'use strict';
/* jslint vars:true, plusplus:true, forin:true */
/* global Script, AddressManager */
(function () { // BEGIN LOCAL SCOPE
    // var AppUi = Script.require('appUi');
    var request = Script.require('request').request;

    var ACTIVATION_RADIUS_M = 0.5;
    var RESTDB_API_KEY = { 'x-apikey': '5bd33229cb62286429f4ee76' };
    var RESTDB_BASE_URL = 'https://teleportal-66ab.restdb.io/rest/teleportals';
    var UPDATE_INTERVAL_MSEC = 1000;

    var isPolling = false;
    var allTeleportals = [];

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

    function handleSearchResult(err, response) {
        print("Search response: ", JSON.stringify(response));
        if (response) {
            var now = new Date();
            if (!err) {
                if (0 === response.length) {
                    var document = {
                        ID: quasiGUID(),
                        USERNAME: Account.username,
                        HOSTNAME_0: AddressManager.hostname,
                        XYZ_0: MyAvatar.position,
                        CREATED_AT: now.toUTCString() };
                    print("Emplace first teleportal: ", JSON.stringify(document));
                    dbInsert(document);
                } else if (1 === response.length) {
                    var fields = {
                        HOSTNAME_1: AddressManager.hostname,
                        XYZ_1: MyAvatar.position,
                        UPDATED_AT: now.toUTCString() };
                    print("Found incomplete pair: ", JSON.stringify(response[0]));
                    print("Emplace second teleportal: ", JSON.stringify(fields));
                    dbUpdate(response[0]._id, fields);
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
            handleSearchResult);
    }

    function clearTeleportals() {
        dbDeleteAllTeleportalsForUser(Account.username);
    }

    function keyPressEvent(key) {
        // TODO: Do something informative if the user is not logged in.
        if (Account.username !== 'Unknown user') {
            var actual = String.fromCharCode(key.key);
            actual = key.isShifted ? actual : actual.toLowerCase();
            print("actual:", actual);
            switch (actual) {
                case 'T':
                    Window.displayAnnouncement("Teleportal emplaced.");
                    emplaceTeleportal();
                    break;
                case 'C':
                    Window.displayAnnouncement("Teleportals cleared.");
                    clearTeleportals();
                    break;
            }
        }
    }

    function xyzDistance(a, b) {
        var result = Math.sqrt(
            Math.pow(a.x - b.x, 2) +
            Math.pow(a.y - b.y, 2) +
            Math.pow(a.z - b.z, 2));
        print("distance: " + result);
        return result;
    }

    function inRange(xyz) {
        return ACTIVATION_RADIUS_M >= xyzDistance(MyAvatar.position, xyz);
    }

    function uri(hostname, xyz) {
        return "hifi://" + hostname + '/' + xyz.x + "," + xyz.y + "," + xyz.z;
    }

    function teleport(hostname, xyz) {
        Window.displayAnnouncement("Teleporting to " + uri(hostname, xyz));
    }

    function energize() {
        var hostname = AddressManager.hostname;
        for (var i = 0; i < allTeleportals.length; i++) {
            if (i in allTeleportals) {
                var teleportal = allTeleportals[i];
                if (hostname === teleportal.HOSTNAME_0 && inRange(teleportal.XYZ_0)) {
                    teleport(teleportal.HOSTNAME_0, teleportal.XYZ_0);
                    break;
                } else if (hostname === teleportal.HOSTNAME_1 && inRange(teleportal.XYZ_1)) {
                    teleport(teleportal.HOSTNAME_1, teleportal.XYZ_1);
                    break;
                }
            }
        }
    }

    function updateTeleportalsListUntilNotPolling() {
        var thisHostname = AddressManager.hostname;
        dbSearch(
            { $or: [{ HOSTNAME_0: thisHostname }, { HOSTNAME_1: thisHostname }] },
            function (err, response) {
                allTeleportals = response;
                energize();
                if (isPolling) {
                    Script.setTimeout(
                        updateTeleportalsListUntilNotPolling,
                        UPDATE_INTERVAL_MSEC);
                    print("all teleportals in hostname: ", JSON.stringify(allTeleportals));
                }
            }
        );
    }

    function startup() {
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
    }

    startup();

}()); // END LOCAL SCOPE
