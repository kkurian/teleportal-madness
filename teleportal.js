'use strict';
/* jslint vars:true, plusplus:true, forin:true */
/* global Script, AddressManager */
(function () { // BEGIN LOCAL SCOPE
    // var AppUi = Script.require('appUi');
    var request = Script.require('request').request;
    var DB_BASE_URL = 'https://sheetsu.com/apis/v1.0su/67b8d3a149a5';
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

    function dbReportSuccess(response) {
        print('sheetsu success: ', JSON.stringify(response));
    }

    function dbReportErrorRetry(err, response) {
        print('sheetsu erred. trying again.');
        print('err: ', JSON.stringify(err));
        print('response: ', JSON.stringify(response));
    }

    function ensureCreate(retry) {
        return function(err, response) {
            if (response && 201 === response.statusCode) { // eslint-disable-line no-magic-numbers
                dbReportSuccess(response);
            } else {
                dbReportErrorRetry(err, response);
                Script.setTimeout(retry, RETRY_DELAY_MSEC);
            }
        };
    }

    function dbCreate(data) {
        request({
            uri: DB_BASE_URL,
            method: 'POST',
            json: true,
            body: data
        }, ensureCreate(function () {
            dbCreate(data);
        }));
    }

    function dbSearch(queryComponents, processResults) {
        request({
            uri: DB_BASE_URL + '/search',
            body: queryComponents // request() puts these in the uri
        }, processResults);
    }

    function handleUpdateResult(err, response) {
        if (!response || response.statusCode || 1 !== response.length) {
            print("Failed to emplace teleportal or emplaced it multiple times!");
            print("err: ", JSON.stringify(err));
            print("response: ", JSON.stringify(response));
        }
    }

    function dbUpdate(id, fields) {
        request({
            url: DB_BASE_URL + '/ID/' + id,
            method: 'PATCH',
            json: true,
            body: fields
        }, handleUpdateResult);
    }

    function handleSearchResult(err, response) {
        if (response) {
            var now = new Date();
            if (response.statusCode) {
                if (404 === response.statusCode) { // eslint-disable-line no-magic-numbers
                    var row = {
                        ID: quasiGUID(),
                        USERNAME: Account.username,
                        DOMAIN_0: AddressManager.domainID,
                        XYZ_0: MyAvatar.position,
                        CREATED_AT: now.toUTCString() };
                    print("Emplace first teleportal: ", JSON.stringify(row));
                    dbCreate(row);
                } else if (500 <= response.statusCode) { // eslint-disable-line no-magic-numbers
                    dbReportErrorRetry(err, response);
                    Script.setTimeout(emplaceTeleportal, RETRY_DELAY_MSEC);
                } else {
                    print("Unexpected status code: ", JSON.stringify(response));
                }
            } else if (1 === response.length) {
                var fields = {
                    DOMAIN_1: AddressManager.domainID,
                    XYZ_1: MyAvatar.position,
                    UPDATED_AT: now.toUTCString() };
                print("Emplace second teleportal: ", JSON.stringify(fields));
                dbUpdate(response[0].ID, fields);
            } else {
                print("Unexpected response: ", JSON.stringify(response));
                print("Corresponding error: ", JSON.stringify(err));
            }
        } else {
            print("Error. No response: ", JSON.stringify(err));
        }
    }

    function emplaceTeleportal() {
        dbSearch(
            { USERNAME: Account.username, DOMAIN_1: '' },
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
