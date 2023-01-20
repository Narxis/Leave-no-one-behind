//bin/express.js
var express = require('express');

module.exports = function() {
    var app = express();

    app.set('views', './public/views');
    app.set('view engine', 'ejs');

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.use('/', express.static('./public/views'));
    app.use('/css', express.static('./public/css'));
    app.use('/js', express.static('./public/js'));
    app.use('/img', express.static('./public/img'));
    app.use('/fonts', express.static('./public/fonts'));

    return app;
};