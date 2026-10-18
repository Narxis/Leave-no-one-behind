//bin/express.js
var express = require('express');
var path = require('path');
var paths = require('../src/config/paths');

module.exports = function() {
    var app = express();
    // Dossiers du jeu, quel que soit le dossier de lancement (l'app de bureau
    // ne démarre pas forcément dans le dossier du jeu)
    var pub = (dir) => path.join(paths.ROOT, 'public', dir || '');

    app.set('views', pub('views'));
    app.set('view engine', 'ejs');
    // Salles du vaisseau, pour afficher leur nom sur le plan (partials/ship-rooms-svg)
    app.locals.shipRooms = require('../src/config/shipRooms.json');
    // Rôles des joueurs, pour leur logo sur les onglets (partials/player-tabs)
    app.locals.playerRoles = require('../src/controllers/roles');
    // Compte Discord d'un joueur en ligne (id d'app → {id, name, avatar} ou null)
    app.locals.discordOf = (id) => require('../src/controllers/lobby').discordOf(id);

    // Pages MJ cachées et bloquées pour les joueurs (src/controllers/mjAccess.js)
    app.use(require('../src/controllers/mjAccess').middleware);

    app.use(express.urlencoded({ extended: true, limit: '52428800' }));
    app.use(express.json({limit: '52428800'}));

    // Images des races customs, dans le dossier de données ; les races de base
    // restent servies depuis public/img/races
    app.use('/img/races', express.static(paths.raceImages()));

    app.use(express.static(pub()));

    app.use('/', express.static(pub('views')));
    app.use('/css', express.static(pub('css')));
    app.use('/js', express.static(pub('js')));
    app.use('/img', express.static(pub('img')));
    app.use('/fonts', express.static(pub('fonts')));

    return app;
};
