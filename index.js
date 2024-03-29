/*
 * Copyright 2017, alex at staticlibs.net
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

define([
    "module",
    "wilton/Channel",
    "wilton/fs",
    "wilton/Logger",
    "wilton/loader",
    "wilton/misc",
    "wilton/Server",
    "wilton/utils"
], function(module, Channel, fs, Logger, loader, misc, Server, utils) {
    "use strict";
    var logger = new Logger(module.id);
    utils.checkRootModuleName(module, "bootstrap");

    return {
        main: function() {
            var conf = loader.loadAppConfig(module);
            // create necessary dirs
            fs.mkdir(conf.appdir + "work", function() {});

            // init logging
            Logger.initialize(conf.logging);

            // share conf for other threads
            new Channel("bootstrap/server/conf", 1).send(conf);
            // prepare lock for sqlite access
            new Channel(conf.dbUrl, 1);

            // init db using lazy-load deps
            require([
                "bootstrap/server/db",
                "bootstrap/server/models/schema",
                "bootstrap/server/models/user"
            ], function(db, schema, user) {
                schema.create();
                db.doInSyncTransaction(conf.dbUrl, function() {
                    user.insertDummyRecords();
                });
                db.close();
            });

            // start server
            var server = new Server({
                tcpPort: 8080,
                views: [
                    "bootstrap/server/views/aboutWilton",
                    "bootstrap/server/views/addUser",
                    "bootstrap/server/views/description",
                    "bootstrap/server/views/usersList"
                ],
                rootRedirectLocation: "/bootstrap/server/views/description",
                mustache: {
                    partialsDirs: [
                        loader.findModulePath("bootstrap/server/components")
                    ]
                },
                documentRoots: [{
                    resource: "/web",
                    dirPath: loader.findModulePath("bootstrap/web"),
                    cacheMaxAgeSeconds: 0
                },
                {
                    resource: "/stdlib/",
                    zipPath: misc.wiltonConfig().wiltonHome + "std.wlib",
                    cacheMaxAgeSeconds: 0
                }]
            });
            logger.info("Server started: http://127.0.0.1:8080/" );

            // wait for shutdown
            misc.waitForSignal();

            logger.info("Shutting down ...");
            server.stop();
        }
    };
});
