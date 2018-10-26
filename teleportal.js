'use strict';
/* jslint vars:true, plusplus:true, forin:true */
/* global Script, AddressManager */
(function () { // BEGIN LOCAL SCOPE
    // var AppUi = Script.require('appUi');
    var request = Script.require('request').request;

    // function onOpened() {
    // }

    function sheetsuHandleResponse(retry) {
        var delaymsec = 1000;
        return function(err, response) {
            var isSuccess = 200 <= response.statusCode && response.statusCode < 300; // eslint-disable-line no-magic-numbers
            if (isSuccess) {
                print('sheetsu success: ', JSON.stringify(response));
            } else {
                print('sheetsu erred. trying again: ', err || response.status);
                Script.setTimeout(retry, delaymsec);
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
            uri: 'https://sheetsu.com/apis/v1.0su/67b8d3a149a5',
            method: 'POST',
            json: true,
            body: data
        }, sheetsuHandleResponse(function () {
            dbCreate(data);
        }));
    }

    function dbWriteCurrentLocation() {
        var now = new Date();
        dbCreate({
            USERNAME: Account.username,
            DOMAIN_0: AddressManager.domainID,
            XYZ_0: MyAvatar.position,
            CREATED_AT: now.toUTCString()
        });
    }

    function keyPressEvent(key) {
        // TODO: Do something informative if the user is not logged in.
        if (Account.username !== 'Unknown user') {
            var lowercaseT = 84;
            if (key.key === lowercaseT) {
                dbWriteCurrentLocation();
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
