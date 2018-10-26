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

    function ensureSearchOrUpdate(retry, finish) {
        return function (err, response) {
            if (!response || 500 <= response.statusCode) { // eslint-disable-line no-magic-numbers
                dbReportErrorRetry(err, response);
                Script.setTimeout(retry, RETRY_DELAY_MSEC);
            } else {
                finish(err, response);
            }
        };
    }

    // function sheetsuGet() {
    //     request({
    //         uri: 'https://sheetsu.com/apis/v1.0su/67b8d3a149a5',
    //         method: 'GET'
    //     }, sheetsuHandleResponse(sheetsuGet) );
    // }

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
            body: queryComponents // request puts these in the uri
        }, processResults);
    }

    function dbUpdate(id, fields, retry, finish) {
        request({
            url: DB_BASE_URL + '/ID/' + id,
            method: 'PATCH',
            json: true,
            body: fields
        }, ensureSearchOrUpdate(retry, finish));
    }

    function elseEmplaceFirstTeleportal() {
        var now = new Date();
        var row = {
            ID: quasiGUID(),
            USERNAME: Account.username,
            DOMAIN_0: AddressManager.domainID,
            DOMAIN_1: 'null',
            XYZ_0: MyAvatar.position,
            CREATED_AT: now.toUTCString() };
        print("Emplace first teleportal: ", JSON.stringify(row));
        dbCreate(row);
    }

    function emplaceSecondTeleportal(rows) {
        function retry() {
            emplaceSecondTeleportal(rows);
        }

        function finish(err, response) {
            if (!response || 0 === response.length) {
                print(
                    "Update did not fail (5xx) yet nothing updated! ",
                    "err: ", JSON.stringify(err),
                    "response: ", JSON.stringify(response));
            } else if (1 !== response.length) {
                // XXX What to do? We have updated more than one row.
                // This should *never* happen because we key off of a
                // quasi-guid.
                print(
                    "Data corruption? Updated more than one row! ",
                    "err: ", JSON.stringify(err),
                    "response: ", JSON.stringify(response));
            }
        }

        var now = new Date();
        var fields = {
            DOMAIN_1: AddressManager.domainID,
            XYZ_1: MyAvatar.position,
            UPDATED_AT: now.toUTCString() };
        dbUpdate(rows[0].ID, fields, retry, finish);
    }

    function whenFirstTeleportalIsEmplaced(doThis, elseDoThat) {
        function retry() {
            whenFirstTeleportalIsEmplaced(doThis, elseDoThat);
        }

        function finish(err, response) {
            if (404 !== response.statusCode) { // eslint-disable-line no-magic-numbers
                if (1 !== response.length) {
                    // XXX What to do? We have found more than one
                    // candidate row for updating. This might happen on
                    // rare occaision due to a race condition that is
                    // unavoidable given our choice of "database".
                    print("Data corruption? More than one match! Silently dropping this error.");
                } else {
                    print("First teleportal is already emplaced: ", JSON.stringify(response));
                    doThis(response);
                }
            } else {
                print("First teleportal has yet to be emplaced: ", JSON.stringify(response));
                elseDoThat();
            }
        }

        dbSearch(
            { USERNAME: Account.username, DOMAIN_1: 'null' },
            ensureSearchOrUpdate(retry, finish)
        );
    }

    function emplaceTeleportal() {
        whenFirstTeleportalIsEmplaced(
            emplaceSecondTeleportal,
            elseEmplaceFirstTeleportal);
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
