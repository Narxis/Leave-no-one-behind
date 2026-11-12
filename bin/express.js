//bin/express.js
var express = require('express');
var path = require('path');
var paths = require('../src/config/paths');

module.exports = function() {
    var app = express();
    // Game folders, whatever the launch folder (the desktop app
    // doesn't necessarily start in the game folder)
    var pub = (dir) => path.join(paths.ROOT, 'public', dir || '');

    app.set('views', pub('views'));
    app.set('view engine', 'ejs');
    // Ship rooms, to show their name on the map (partials/ship-rooms-svg)
    app.locals.shipRooms = require('../src/config/shipRooms.json');
    // Player roles, for their logo on the tabs (partials/player-tabs)
    app.locals.playerRoles = require('../src/controllers/roles');
    // Discord account of an online player (app id → {id, name, avatar} or null)
    app.locals.discordOf = (id) => require('../src/controllers/lobby').discordOf(id);

    // GM pages hidden and blocked for players (src/controllers/mjAccess.js)
    app.use(require('../src/controllers/mjAccess').middleware);

    app.use(express.urlencoded({ extended: true, limit: '52428800' }));
    app.use(express.json({limit: '52428800'}));

    // Custom race images, in the data folder; base races
    // are still served from public/img/races
    app.use('/img/races', express.static(paths.raceImages()));
    // Same for images added in the item editor
    app.use('/img/items', express.static(paths.itemImages()));

    app.use(express.static(pub()));

    app.use('/', express.static(pub('views')));
    app.use('/css', express.static(pub('css')));
    app.use('/js', express.static(pub('js')));
    app.use('/img', express.static(pub('img')));
    app.use('/fonts', express.static(pub('fonts')));

    return app;
};
