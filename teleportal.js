'use strict';
/* jslint vars:true, plusplus:true, forin:true */
/* global Script, print */
(function () { // BEGIN LOCAL SCOPE
    // var AppUi = Script.require('appUi');
    var request = Script.require('request').request;

    // function onOpened() {
    // }

    function sheetsuHandleResponse(retry) {
        return function(err, response) {
            if (err) {
                print('sheetsu erred. trying again: ', err || response.status);
                setTimeout(retry, 1000);
            } else {
                print('sheetsu success: ', JSON.stringify(response));
            }
        };
    }

    var sheetsuGet = function () {
        request({
            uri: 'https://sheetsu.com/apis/v1.0su/67b8d3a149a5',
            method: 'GET'
        }, sheetsuHandleResponse(sheetsuGet) );
    };

    var sheetsuUpdate = function () {
        request({
            uri: 'https://sheetsu.com/apis/v1.0su/67b8d3a149a5/ID/1',
            method: 'PATCH',
            json: true,
            body: { 'DATA': 'foobar' }
        }, sheetsuHandleResponse(sheetsuUpdate) );
    };

    function startup() {
        sheetsuGet();
        sheetsuUpdate();

        // ui = new AppUi({
        //   buttonName: "Teleportal Madness",
        //   home: Script.resolvePath("teleportal.html"),
        //   graphicsDirectory: Script.resolvePath("./")
        // });
    }

    startup();

}()); // END LOCAL SCOPE
