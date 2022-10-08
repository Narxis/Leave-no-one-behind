var fs = require('fs');
let deck = require('../controllers/deck')

module.exports.index = function(req, res) {
    // req est bien entendu notre objet requête et res notre objet réponse
    // on utilise l'objet res pour rendre notre vue index.jade
    // (pas besoin de spécifier le chemin de la vue, on l'a fait dans bin/express.js)
    res.render('index');
};

module.exports.coucou = function (req, res) {
    let variable_coucou = 'Texte qui dit coucou';
    res.render('coucou', {var_coucou: variable_coucou});
}

module.exports.event = function (req, res) {
    var conf = JSON.parse(fs.readFileSync('src/config/events.json', 'utf8'));
    let events = conf.events;
    let event = events[Math.floor(Math.random() * events.length )];
    res.render('card', {event: event});
}

module.exports.deckGenerator = function (req, res) {
    deck.deckGenerator();
    res.render('index')
}