//bin/express.js
var express = require('express');

module.exports = function() {
    var app = express();

    app.set('views', './public/views');
    app.set('view engine', 'ejs');
    // Salles du vaisseau, pour afficher leur nom sur le plan (partials/ship-rooms-svg)
    app.locals.shipRooms = require('../src/config/shipRooms.json');

    app.use(express.urlencoded({ extended: true, limit: '52428800' }));
    app.use(express.json({limit: '52428800'}));

    app.use(express.static('public'));

    app.use('/', express.static('./public/views'));
    app.use('/css', express.static('./public/css'));
    app.use('/js', express.static('./public/js'));
    app.use('/img', express.static('./public/img'));
    app.use('/fonts', express.static('./public/fonts'));

    return app;
};