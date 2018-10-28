"use strict";

//
//  gemstoneMagicMaker.js
//  tablet-sample-app
//
//  Created by Faye Li on Feb 6 2017.
//  Copyright 2017 High Fidelity, Inc.
//
//  Distributed under the Apache License, Version 2.0.
//  See the accompanying file LICENSE or http://www.apache.org/licenses/LICENSE-2.0.html
//

(function() {
	// Every great app starts with a great name (keep it short so that it can fit in the tablet button)
	var APP_NAME = "INSTAPORT";
	// Link to your app's HTML file
	var APP_URL = "http://hifi-content.s3.amazonaws.com/caitlyn/production/portalDropper/portalDropper/portalDropper.html?622222221";
    // Path to the icon art for your app
    var APP_ICON = "http://hifi-content.s3.amazonaws.com/caitlyn/production/portalDropper/portalDropper/portalButton-faceRight-inactive.svg";
	
    // Get a reference to the tablet 
	var tablet = Tablet.getTablet("com.highfidelity.interface.tablet.system");

	// "Install" your cool new app to the tablet
	// The following lines create a button on the tablet's menu screen
	var button = tablet.addButton({
        icon: APP_ICON,
        text: APP_NAME
    });

	// When user click the app button, we'll display our app on the tablet screen
	function onClicked() {
		tablet.gotoWebScreen(APP_URL);
	}
    button.clicked.connect(onClicked);

    // Helper function that gives us a position right in front of the user 
    function getPositionToCreateEntity() {
    	var direction = Quat.getFront(MyAvatar.orientation);
    	var distance = 0.5;
    	var position = Vec3.sum(MyAvatar.position, Vec3.multiply(direction, distance));
    	position.y += 0.5;
    	return position;
    }

    // Handle the events we're recieving from the web UI
    function onWebEventReceived(event) {
    	print("InstaPort received a web event:" + event);
		if (typeof event !== "string") return;	
		var eventValue = JSON.parse(event).type;			
		print("IOts "+eventValue);
		
		if (eventValue == "storeLocation1") {
			Window.displayAnnouncement("Teleportal emplaced.");
            emplaceTeleportal();
		};
		
		if (eventValue == "storeLocation2") {
			Window.displayAnnouncement("Teleportal emplaced.");
            emplaceTeleportal();
		};
		
		if (eventValue == "clearPortals")  {
			Window.displayAnnouncement("Teleportals cleared.");
			clearTeleportals();
			unoverlayAllTeleportals();
		};
		
		if (eventValue == "portalRoulette") {
            isRouletteMode = !isRouletteMode;
            var state = isRouletteMode ? 'enabled' : 'disabled';
            Window.displayAnnouncement('Teleportal roulette ' + state);
		};
		
    }
	
    tablet.webEventReceived.connect(onWebEventReceived);

	// Provide a way to "uninstall" the app
	// Here, we write a function called "cleanup" which gets executed when
	// this script stops running. It'll remove the app button from the tablet.
	function cleanup() {
        tablet.removeButton(button);
	}
    Script.scriptEnding.connect(cleanup);
	
	//--------------------------------------------------
	    // var AppUi = Script.require('appUi');
    var request = Script.require('request').request;

    var ACTIVATION_RADIUS_M = 2.0;
    var MODEL_FBX = "teleportal.fbx";
    var MODEL_SCALE = { x: 1, y: 1, z: 1 };
    var RESTDB_API_KEY = { 'x-apikey': '5bd33229cb62286429f4ee76' };
    var RESTDB_BASE_URL = 'https://teleportal-66ab.restdb.io/rest/teleportals';
    var TELEPORTION_DESTINATION_OFFSET = { x: 0, y: 0, z: 3 };
    var UPDATE_INTERVAL_MSEC = 1000;

    var allOverlayedTeleportals = [];
    var allTeleportals = [];
    var isPolling = false;
    var isRouletteMode = false;
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
                case 'R':
                    isRouletteMode = !isRouletteMode;
                    var state = isRouletteMode ? 'enabled' : 'disabled';
                    Window.displayAnnouncement('Teleportal roulette ' + state);
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
        Window.location = uri(
            hostname,
            Vec3.sum(
                xyz,
                Vec3.multiplyQbyV(
                    MyAvatar.orientation,
                    TELEPORTION_DESTINATION_OFFSET)));
    }

    function teleportAtRandom() {
        request({
            uri: RESTDB_BASE_URL,
            method: 'GET',
            headers: RESTDB_API_KEY
        }, function (err, result) {
            print("Big result ", JSON.stringify(result));
            var teleportal = result[Math.floor(Math.random() * result.length)];
            if (Math.floor(Math.random() * 2)) {
                teleport(teleportal.HOSTNAME_0, teleportal.XYZ_0);
            } else {
                teleport(teleportal.HOSTNAME_1, teleportal.XYZ_1);
            }
        });
    }

    function energize() {
        var hostname = AddressManager.hostname;
        for (var i = 0; i < allTeleportals.length; i++) {
            if (i in allTeleportals) {
                var teleportal = allTeleportals[i];
                if (hostname === teleportal.HOSTNAME_0 && inRange(teleportal.XYZ_0)) {
                    if (isRouletteMode) {
                        teleportAtRandom();
                    } else {
                        teleport(teleportal.HOSTNAME_1, teleportal.XYZ_1);
                    }
                    break;
                } else if (hostname === teleportal.HOSTNAME_1 && inRange(teleportal.XYZ_1)) {
                    if (isRouletteMode) {
                        teleportAtRandom();
                    } else {
                        teleport(teleportal.HOSTNAME_0, teleportal.XYZ_0);
                    }
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
    }

    function shutdown() { // eslint-disable-line no-unused-vars
        isPolling = false;
        Controller.keyPressEvent.disconnect(keyPressEvent);
        Script.scriptEnding.disconnect(shutdown);
        unoverlayAllTeleportals();
    }

    startup();


}()); 