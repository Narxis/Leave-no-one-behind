var fs = require('fs');
let {deckGenerator,getCards} = require('../controllers/deck')
const {Card} = require("../models/card");

module.exports.index = function(req, res) {
    // req est bien entendu notre objet requête et res notre objet réponse
    // on utilise l'objet res pour rendre notre vue index.jade
    // (pas besoin de spécifier le chemin de la vue, on l'a fait dans bin/express.js)
    res.render('index');
};

module.exports.randCard = function (req, res) {
    getCards(0, 1).then(card => {
        console.log(card[0])
        res.render('card', {event: card[0]});
    });
}

module.exports.deckGenerator = function (req, res) {
    deckGenerator().then(
        res.render('index')
    );

}

module.exports.cardEdit = function (req, res) {
    console.log(req, res)
    res.render('forms/cardEdit')
}