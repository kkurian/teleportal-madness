"use strict";

//
//  instaport.js
//
//  Created by Kerry Ivan Kurian on 26 OCT 2018
//  Copyright 2018 High Fidelity, Inc.
//
//  Distributed under the Apache License, Version 2.0.
//  See the accompanying file LICENSE or http://www.apache.org/licenses/LICENSE-2.0.html
//

/* global AddressManager */
(function() {
    var APP_ICON = "http://hifi-content.s3.amazonaws.com/caitlyn/production/portalDropper/portalDropper/appIcon.svg";
    var APP_NAME = "INSTAPORT";
    var APP_URL = "http://hifi-content.s3.amazonaws.com/caitlyn/production/portalDropper/portalDropper/portalDropper.html?622222221";

    var button = null;
    var request = Script.require('request').request;
    var tablet = Tablet.getTablet("com.highfidelity.interface.tablet.system");

    var ACTIVATION_RADIUS_M = 1.0;
    var MODEL_FBX = "http://hifi-content.s3.amazonaws.com/caitlyn/production/portalDropper/portalDropper/portalDropperBall.fbx?2";
    var MODEL_SCALE = { x: 3, y: 3, z: 3 };
    var ANIM_FBX = "http://hifi-content.s3.amazonaws.com/caitlyn/production/portalDropper/portalDropper/portalDropperBall.fbx?2";
    var RESTDB_API_KEY = { 'x-apikey': '5bd33229cb62286429f4ee76' };
    var RESTDB_BASE_URL = 'https://teleportal-66ab.restdb.io/rest/teleportals';
    var TELEPORTION_DESTINATION_OFFSET = { x: 0, y: 0, z: -2 };
    var UPDATE_INTERVAL_MSEC = 1000;

    var isPolling = false;
    var isRouletteMode = false;
    var instaportOverlaysByHostname = {};

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

    function dbDeleteAllInstaportsForUser(username) {
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

    function unoverlayAllInstaports() {
        Object.keys(instaportOverlaysByHostname).forEach(function(hostname) {
            var instaportOverlays = instaportOverlaysByHostname[hostname];
            Object.keys(instaportOverlays).forEach(function(instaportId) {
                Overlays.deleteOverlay(instaportOverlays[instaportId].overlay);
            });
        });
        instaportOverlaysByHostname = {};
    }

    function overlayInstaport(instaport, instaportId) {
        print("!!! overlay ", JSON.stringify(instaport), instaportId);
        var hostname = instaportHostname(instaport, instaportId);
        var position = instaportPosition(instaport, instaportId);
        instaportOverlaysByHostname[hostname] = instaportOverlaysByHostname[hostname] || {};
        instaportOverlaysByHostname[hostname][instaportId] = {
            instaport: instaport,
            overlay: Overlays.addOverlay(
                "model", {
                    url: Script.resolvePath(MODEL_FBX),
                    animationSettings: {
                        url: ANIM_FBX,
                        fps: 40,
                        firstFrame: 0,
                        lastFrame: 180,
                        loop: true,
                        running: true
                    },
                    position: position,
                    scale: MODEL_SCALE,
                    rotation: MyAvatar.orientation,
                    solid: true
                }
            )
        };
    }

    function newOverlayPosition() {
        return Vec3.sum(
            MyAvatar.position,
            Vec3.multiplyQbyV(MyAvatar.orientation, { x: 0, y: 0, z: -2}));
    }

    function createInstaportA() {
        var guid = quasiGUID();
        var hostname = AddressManager.hostname;
        var now = new Date();
        var position = newOverlayPosition();
        var document = {
            ID_0: guid,
            USERNAME: Account.username,
            HOSTNAME_0: hostname,
            XYZ_0: position,
            CREATED_AT_0: now.toUTCString() };
        print("Emplace first instaport: ", JSON.stringify(document));
        dbInsert(document);
    }

    function createInstaportB(response) {
        var guid = quasiGUID();
        var hostname = AddressManager.hostname;
        var now = new Date();
        var position = newOverlayPosition();
        var fields = {
            ID_1: guid,
            HOSTNAME_1: hostname,
            XYZ_1: position,
            CREATED_AT_1: now.toUTCString() };
        print("Found incomplete pair: ", JSON.stringify(response[0]));
        print("Emplace second instaport: ", JSON.stringify(fields));
        dbUpdate(response[0]._id, fields);
    }

    function finishEmplaceInstaport(err, response) {
        print("Search response: ", JSON.stringify(response));
        if (response) {
            if (!err) {
                if (0 === response.length) {
                    createInstaportA();
                } else if (1 === response.length) {
                    createInstaportB(response);
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

    function ensureUsername(action) {
        var username = Account.username;
        if ('Unknown user' === username) {
            Window.displayAnnoucement("Cannot " + action + ". You must be logged in.");
            // XXX Add sound here.
        } else {
            return username;
        }
    }

    function emplaceInstaport() {
        var username = ensureUsername();
        if (username) {
            Window.displayAnnouncement("Instaport emplaced.");
            dbSearch(
                { USERNAME: username, HOSTNAME_1: null },
                finishEmplaceInstaport);
        }
    }

    function deleteThisUsersInstaports() {
        var username = ensureUsername();
        if (username) {
            Window.displayAnnouncement("Instaports cleared.");
            dbDeleteAllInstaportsForUser(username);
        }
    }

    function keyPressEvent(key) {
        // TODO: Do something informative if the user is not logged in.
        if (Account.username !== 'Unknown user') {
            var actual = String.fromCharCode(key.key);
            actual = key.isShifted ? actual : actual.toLowerCase();
            switch (actual) {
                case 'T':
                    emplaceInstaport();
                    break;
                case 'C':
                    deleteThisUsersInstaports();
                    break;
                case 'R':
                    isRouletteMode = !isRouletteMode;
                    var state = isRouletteMode ? 'enabled' : 'disabled';
                    Window.displayAnnouncement('Instaport roulette ' + state);
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

    function materialize(hostname, xyz) {
        Window.location = uri(
            hostname,
            Vec3.sum(
                xyz,
                Vec3.multiplyQbyV(
                    MyAvatar.orientation,
                    TELEPORTION_DESTINATION_OFFSET)));
    }

    function materializeAtRandom() {
        request({
            uri: RESTDB_BASE_URL,
            method: 'GET',
            headers: RESTDB_API_KEY
        }, function (err, result) {
            print("Big result ", JSON.stringify(result));
            var instaport = result[Math.floor(Math.random() * result.length)];
            if (Math.floor(Math.random() * 2)) {
                materialize(instaport.HOSTNAME_0, instaport.XYZ_0);
            } else {
                materialize(instaport.HOSTNAME_1, instaport.XYZ_1);
            }
        });
    }

    function beam(hostname, xyz) {
        if (isRouletteMode) {
            materializeAtRandom();
        } else {
            materialize(hostname, xyz);
        }
    }

    function energize() {
        var instaportOverlays = instaportOverlaysByHostname[AddressManager.hostname];
        if (instaportOverlays) {
            Object.keys(instaportOverlays).forEach(function(instaportId) {
                var instaport = instaportOverlays[instaportId].instaport;
                if (instaportId === instaport.ID_0 && inRange(instaport.XYZ_0)) {
                    beam(instaport.HOSTNAME_1, instaport.XYZ_1);
                    return;
                } else if (inRange(instaport.XYZ_1)) {
                    beam(instaport.HOSTNAME_0, instaport.XYZ_0);
                    return;
                }
            });
        }
    }

    function instaportHostname(instaport, instaportId) {
        return (instaportId === instaport.ID_0) ? instaport.HOSTNAME_0 :
               (instaportId === instaport.ID_1) ? instaport.HOSTNAME_1 : undefined; // eslint-disable-line indent
    }

    function instaportPosition(instaport, instaportId) {
        return (instaportId === instaport.ID_0) ? instaport.XYZ_0 :
               (instaportId === instaport.ID_1) ? instaport.XYZ_1 : undefined; // eslint-disable-line indent
    }

    function ensureInstaportsAreOverlayed(hostname, instaports) {
        if (instaports) {
            var instaportOverlays = instaportOverlaysByHostname[hostname];
            instaports.forEach(function(instaport) {
                if (hostname === instaport.HOSTNAME_0) {
                    if (!(instaportOverlays && instaport.ID_0 in instaportOverlays)) {
                        overlayInstaport(instaport, instaport.ID_0);
                    }
                }
                if (hostname === instaport.HOSTNAME_1) {
                    if (!(instaportOverlays && instaport.ID_1 in instaportOverlays)) {
                        overlayInstaport(instaport, instaport.ID_1);
                    }
                }
            });
        }
    }

    function unoverlayInstaport(hostname, instaportId) {
        var instaportOverlays = instaportOverlaysByHostname[hostname];
        Overlays.deleteOverlay(instaportOverlays[instaportId].overlay);
        delete instaportOverlays[instaportId];
    }

    function ensureOldInstaportsAreUnoverlayed(hostname, instaports) {
        var instaportOverlays = instaportOverlaysByHostname[hostname];
        if (instaportOverlays) {
            var instaportIds = {};
            instaports.forEach(function(instaport) {
                if (hostname === instaport.HOSTNAME_0) {
                    instaportIds[instaport.ID_0] = true;
                }
                if (hostname === instaport.HOSTNAME_1) {
                    instaportIds[instaport.ID_1] = true;
                }
            });
            Object.keys(instaportOverlays).forEach(function(instaportId) {
                if (!(instaportId in instaportIds)) {
                    unoverlayInstaport(hostname, instaportId);
                }
            });
        }
    }

    function updateInstaportsListUntilNotPolling() {
        var hostname = AddressManager.hostname;
        dbSearch(
            { $or: [{ HOSTNAME_0: hostname }, { HOSTNAME_1: hostname }] },
            function (err, response) {
                ensureOldInstaportsAreUnoverlayed(hostname, response);
                ensureInstaportsAreOverlayed(hostname, response);
                energize();
                if (isPolling) {
                    Script.setTimeout(
                        updateInstaportsListUntilNotPolling,
                        UPDATE_INTERVAL_MSEC);
                }
            }
        );
    }

    // Handle the events we're recieving from the web UI
    function onWebEventReceived(event) {
        if (typeof event === "string") {
            switch (JSON.parse(event).type) {
                case 'storeLocation1':
                case 'storeLocation2':
                    Window.displayAnnouncement("Instaport emplaced.");
                    emplaceInstaport();
                    break;
                case 'clearPortals':
                    Window.displayAnnouncement("Instaports cleared.");
                    dbDeleteAllInstaportsForUser(Account.username);
                    break;
                case 'portalRoulette':
                    isRouletteMode = !isRouletteMode;
                    var state = isRouletteMode ? 'enabled' : 'disabled';
                    Window.displayAnnouncement('Instaport roulette ' + state);
                    break;
            }
        }
    }

    function onClicked() {
        tablet.gotoWebScreen(APP_URL);
    }

    function createTabletButton() {
        button = tablet.addButton({
            icon: APP_ICON,
            text: APP_NAME
        });
        button.clicked.connect(onClicked);
    }

    function destroyTabletButton() {
        button.clicked.disconnect(onClicked);
        tablet.removeButton(button);
    }

    function startup() {
        isPolling = true;
        Script.scriptEnding.connect(shutdown);
        updateInstaportsListUntilNotPolling();
        Controller.keyPressEvent.connect(keyPressEvent);
        tablet.webEventReceived.connect(onWebEventReceived);
        createTabletButton();
    }

    function shutdown() { // eslint-disable-line no-unused-vars
        isPolling = false;
        destroyTabletButton();
        Controller.keyPressEvent.disconnect(keyPressEvent);
        Script.scriptEnding.disconnect(shutdown);
        unoverlayAllInstaports();
    }

    startup();


}());
