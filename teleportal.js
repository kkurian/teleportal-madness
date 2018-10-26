'use strict';
/* jslint vars:true, plusplus:true, forin:true */
/* global Script, AddressManager */
(function () { // BEGIN LOCAL SCOPE
    // var AppUi = Script.require('appUi');
    var request = Script.require('request').request;
    var DB_BASE_URL = 'https://teleportal-66ab.restdb.io/rest/teleportals';
    var RESTDB_API_KEY = { 'x-apikey': '5bd33229cb62286429f4ee76' };
    var RETRY_DELAY_MSEC = 1000;

    // function onOpened() {
    // }

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
            uri: DB_BASE_URL,
            method: 'POST',
            json: true,
            body: document,
            headers: RESTDB_API_KEY
        }, printResponse);
    }

    function dbSearch(document, processResults) {
        request({
            uri: DB_BASE_URL,
            method: 'GET',
            body: { q: JSON.stringify(document) }, // request() puts these in the uri
            headers: RESTDB_API_KEY
        }, processResults);
    }

    function handleUpdateResult(id, err, response) {
        if (err || response._id !== id) {
            print("Error during update: ", JSON.stringify(err), JSON.stringify(response));
        }
    }

    function dbUpdate(id, fields) {
        request({
            url: DB_BASE_URL + '/' + id,
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
                        DOMAIN_0: AddressManager.domainID,
                        XYZ_0: MyAvatar.position,
                        CREATED_AT: now.toUTCString() };
                    print("Emplace first teleportal: ", JSON.stringify(document));
                    dbInsert(document);
                } else if (1 === response.length) {
                    var fields = {
                        DOMAIN_1: AddressManager.domainID,
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
            { USERNAME: Account.username, DOMAIN_1: null },
            handleSearchResult);
    }

    function keyPressEvent(key) {
        // TODO: Do something informative if the user is not logged in.
        if (Account.username !== 'Unknown user') {
            var lowercaseT = 84;
            if (key.key === lowercaseT) {
                emplaceTeleportal();
            }
        }
    }

    function startup() {
        Controller.keyPressEvent.connect(keyPressEvent);
        // ui = new AppUi({
        //   buttonName: "Teleportal Madness",
        //   home: Script.resolvePath("teleportal.html"),
        //   graphicsDirectory: Script.resolvePath("./")
        // });
    }

    function shutdown() { // eslint-disable-line no-unused-vars
        Controller.keyPressEvent.disconnect(keyPressEvent);
    }

    startup();

}()); // END LOCAL SCOPE
