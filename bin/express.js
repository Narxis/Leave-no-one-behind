//bin/express.js
var express = require('express');

module.exports = function() {
    var app = express();
    // On ajoute jade à express ainsi que le chemin des vues
    app.set('views', './public/views');
    app.set('view engine', 'ejs');
    // On définit des alias sur nos assets,
    // ainsi dans la vue on pourra facilement y faire référence sans tenir
    // compte du chemin du fichier
    app.use('/', express.static('./public/views'));
    app.use('/css', express.static('./public/css'));
    app.use('/js', express.static('./public/js'));
    app.use('/img', express.static('./public/img'));
    return app;
};