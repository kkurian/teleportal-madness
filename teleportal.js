'use strict';
/* jslint vars:true, plusplus:true, forin:true */
/* global Script, Promise, print */
(function () { // BEGIN LOCAL SCOPE
    var AppUi = Script.require('appUi');
    var request = Script.require('request').request;

    /// XXX AWS
    // var AWS = Script.require(Script.resolvePath('aws-sdk-2.343.0.min.js'));
    // AWS.config.update({region: 'us-west-2'});
    // AWS.config.credentials = new AWS.credentials(
    //   'AKIAIPF6MCR6FSNAUB7Q',
    //   'Gep5lTKJB5K/5+8ureMP5zMFnYq8k2W5YC1yKbZu'
    // );
    // var ddb = new AWS.DynamoDB({apiVersion: '2012-10-08'});
    ///

    function onOpened() {
        /// XXX AWS
        // var params = {
        //   TableName: "hello_world",
        //   Item: {
        //     'id': {N: 1}
        //   }
        // };
        // ddb.putItem(params, function (err, data) {
        //   if (err) {
        //     console.log("Error", err);
        //   } else {
        //     console.log("Success", data);
        //   }
        // });
        ///
    }

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
