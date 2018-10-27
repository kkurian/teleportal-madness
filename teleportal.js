'use strict';
/* jslint vars:true, plusplus:true, forin:true */
/* global Script, AddressManager */
(function () { // BEGIN LOCAL SCOPE
    // var AppUi = Script.require('appUi');
    var request = Script.require('request').request;

    var ACTIVATION_RADIUS_M = 1.0;
    var MODEL_FBX = "teleportal.fbx";
    var MODEL_SCALE = { x: 1, y: 1, z: 1 };
    var RESTDB_API_KEY = { 'x-apikey': '5bd33229cb62286429f4ee76' };
    var RESTDB_BASE_URL = 'https://teleportal-66ab.restdb.io/rest/teleportals';
    var UPDATE_INTERVAL_MSEC = 1000;

    var isPolling = false;
    var allTeleportals = [];
    var allOverlayedTeleportals = [];
    var teleportalOverlaysByHostname = {};

    function quasiGUID() {
        // From https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
        // N.B. This does not produce an RFC 4122 compliant GUID.
        function s4() {
            /* eslint-disable no-magic-numbers */
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
            /* eslint-enable no-magic-numbers */
        }
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
    }

    function printResponse(err, response) {
        print("err: ", JSON.stringify(err));
        print("response: ", JSON.stringify(response));
    }

    function dbInsert(document) {
        request({
            uri: RESTDB_BASE_URL,
            method: 'POST',
            json: true,
            body: document,
            headers: RESTDB_API_KEY
        }, printResponse);
    }

    function dbSearch(document, processResults) {
        request({
            uri: RESTDB_BASE_URL,
            method: 'GET',
            body: { q: JSON.stringify(document) }, // request() puts these in the uri
            headers: RESTDB_API_KEY
        }, processResults);
    }

    function dbDeleteRecords(ids) {
        request({
            uri: RESTDB_BASE_URL + '/*',
            method: 'DELETE',
            json: true,
            body: ids,
            headers: RESTDB_API_KEY
        }, printResponse);
    }

    function dbDeleteAllTeleportalsForUser(username) {
        dbSearch({ USERNAME: username }, function (err, response) {
            var ids = response.map(function (x, i) { return x._id; }); // eslint-disable-line brace-style
            dbDeleteRecords(ids);
        });
    }

    function handleUpdateResult(id, err, response) {
        if (err || response._id !== id) {
            print("Error during update: ", JSON.stringify(err), JSON.stringify(response));
        }
    }

    function dbUpdate(id, fields) {
        request({
            url: RESTDB_BASE_URL + '/' + id,
            method: 'PATCH',
            json: true,
            body: fields,
            headers: RESTDB_API_KEY
        }, function (err, response) {
            handleUpdateResult(id, err, response);
        });
    }

    function unoverlayAllTeleportals() {
        for (var hostname in teleportalOverlaysByHostname) {
            var overlays = teleportalOverlaysByHostname[hostname];
            var length = overlays.length;
            for (var i = 0; i < length; i++) {
                if (i in overlays) {
                    print(JSON.stringify(overlays[i]));
                    Overlays.deleteOverlay(overlays[i]);
                }
            }
        }
    }

    function overlayTeleportal(guid, position) {
        var hostname = AddressManager.hostname;
        teleportalOverlaysByHostname[hostname] = teleportalOverlaysByHostname[hostname] || [];
        teleportalOverlaysByHostname[hostname].push(
            Overlays.addOverlay(
                "model", {
                    url: Script.resolvePath(MODEL_FBX),
                    position: position,
                    scale: MODEL_SCALE,
                    rotation: MyAvatar.orientation,
                    solid: true
                }
            ));
        allOverlayedTeleportals.push(guid);
    }

    function newOverlayPosition() {
        return Vec3.sum(
            MyAvatar.position,
            Vec3.multiplyQbyV(MyAvatar.orientation, { x: 0, y: 0, z: -6}));
    }

    function createTeleportalA() {
        var now = new Date();
        var guid = quasiGUID();
        var position = newOverlayPosition();
        var document = {
            ID_0: guid,
            USERNAME: Account.username,
            HOSTNAME_0: AddressManager.hostname,
            XYZ_0: position,
            CREATED_AT_0: now.toUTCString() };
        print("Emplace first teleportal: ", JSON.stringify(document));
        dbInsert(document);
        overlayTeleportal(guid, position);
    }

    function createTeleportalB(response) {
        var now = new Date();
        var guid = quasiGUID();
        var position = newOverlayPosition();
        var fields = {
            ID_1: guid,
            HOSTNAME_1: AddressManager.hostname,
            XYZ_1: position,
            CREATED_AT_1: now.toUTCString() };
        print("Found incomplete pair: ", JSON.stringify(response[0]));
        print("Emplace second teleportal: ", JSON.stringify(fields));
        dbUpdate(response[0]._id, fields);
        overlayTeleportal(guid, position);
    }

    function finishEmplaceTeleportal(err, response) {
        print("Search response: ", JSON.stringify(response));
        if (response) {
            if (!err) {
                if (0 === response.length) {
                    createTeleportalA();
                } else if (1 === response.length) {
                    createTeleportalB(response);
                } else {
                    print("Unexpected response: ", JSON.stringify(response));
                    print("Corresponding error: ", JSON.stringify(err));
                }
            } else {
                print("Error with response: ", JSON.stringify(err), " ", JSON.stringify(response));
            }
        } else {
            print("Error without response: ", JSON.stringify(err));
        }
    }

    function emplaceTeleportal() {
        dbSearch(
            { USERNAME: Account.username, HOSTNAME_1: null },
            finishEmplaceTeleportal);
    }

    function clearTeleportals() {
        dbDeleteAllTeleportalsForUser(Account.username);
    }

    function keyPressEvent(key) {
        // TODO: Do something informative if the user is not logged in.
        if (Account.username !== 'Unknown user') {
            var actual = String.fromCharCode(key.key);
            actual = key.isShifted ? actual : actual.toLowerCase();
            switch (actual) {
                case 'T':
                    Window.displayAnnouncement("Teleportal emplaced.");
                    emplaceTeleportal();
                    break;
                case 'C':
                    Window.displayAnnouncement("Teleportals cleared.");
                    clearTeleportals();
                    unoverlayAllTeleportals();
                    break;
            }
        }
    }

    function inRange(xyz) {
        return ACTIVATION_RADIUS_M >= Vec3.distance(MyAvatar.position, xyz);
    }

    function uri(hostname, xyz) {
        return "hifi://" + hostname + '/' + xyz.x + "," + xyz.y + "," + xyz.z;
    }

    function teleport(hostname, xyz) {
        Window.displayAnnouncement("Teleporting to " + uri(hostname, xyz));
        Window.location = uri(hostname, xyz);
    }

    function energize() {
        var hostname = AddressManager.hostname;
        for (var i = 0; i < allTeleportals.length; i++) {
            if (i in allTeleportals) {
                var teleportal = allTeleportals[i];
                if (hostname === teleportal.HOSTNAME_0 && inRange(teleportal.XYZ_0)) {
                    teleport(teleportal.HOSTNAME_1, teleportal.XYZ_1);
                    break;
                } else if (hostname === teleportal.HOSTNAME_1 && inRange(teleportal.XYZ_1)) {
                    teleport(teleportal.HOSTNAME_0, teleportal.XYZ_0);
                    break;
                }
            }
        }
    }

    function ensureTeleportalIsOverlayed(guid, position) {
        if (guid && -1 === allOverlayedTeleportals.indexOf(guid)) {
            overlayTeleportal(guid, position);
        }
    }

    function ensureTeleportalsAreOverlayed() {
        var length = allTeleportals.length;
        for (var i = 0; i < length; i++) {
            if (i in allTeleportals) {
                var teleportal = allTeleportals[i];
                ensureTeleportalIsOverlayed(teleportal.ID_0, teleportal.XYZ_0);
                ensureTeleportalIsOverlayed(teleportal.ID_1, teleportal.XYZ_1);
            }
        }
    }

    function updateTeleportalsListUntilNotPolling() {
        var thisHostname = AddressManager.hostname;
        dbSearch(
            { $or: [{ HOSTNAME_0: thisHostname }, { HOSTNAME_1: thisHostname }] },
            function (err, response) {
                allTeleportals = response;
                ensureTeleportalsAreOverlayed();
                energize();
                if (isPolling) {
                    Script.setTimeout(
                        updateTeleportalsListUntilNotPolling,
                        UPDATE_INTERVAL_MSEC);
                    print("all teleportals here: ", JSON.stringify(allTeleportals));
                }
            }
        );
    }

    function startup() {
        Script.scriptEnding.connect(shutdown);
        Controller.keyPressEvent.connect(keyPressEvent);
        isPolling = true;
        updateTeleportalsListUntilNotPolling();

        // ui = new AppUi({
        //   buttonName: "Teleportal Madness",
        //   home: Script.resolvePath("teleportal.html"),
        //   graphicsDirectory: Script.resolvePath("./")
        // });
    }

    function shutdown() { // eslint-disable-line no-unused-vars
        isPolling = false;
        Controller.keyPressEvent.disconnect(keyPressEvent);
        Script.scriptEnding.disconnect(shutdown);
        unoverlayAllTeleportals();
    }

    startup();

}()); // END LOCAL SCOPE
