var fs = require('fs');
let {cardPop, deckGenerator,getCards} = require('./deck')
const {Card} = require("./../models/card");
const {Player} = require("../models/player");

module.exports.index = function(req, res) {
    res.render('index');
};

module.exports.returnOk = function (req, res) {
    res.status(200);
    res.json({status: 200})
}

module.exports.randCard = function (req, res) {
    getCards(1, 1).then(card => {
        res.json(card[0]);
    });
}

module.exports.deckGenerator = function (req, res) {
    deckGenerator().then(
        res.render('index-legacy')
    );

}

module.exports.renderSingleSheet = async function (req, res) {

    let player = await new Player().getData(req.body.discord_id);
    res.render('partials/fiche-perso', {player: player});
}

module.exports.persos = function (req, res) {
    res.render('perso');
}

module.exports.ficheVaisseau = function (req, res) {
    res.render('fiche-vaisseau');
}

module.exports.mainMenu = function (req, res) {
    res.render('index');
}

module.exports.renderCardEvent = async function (req, res) {

    let players = await DB.tables.players.findAll();
    // TODO do it with card pop once baseCard.json is completed
    // let next_card = cardPop();
    // TESTING :
    let next_card = await getCards(ALL, 1);
    next_card = next_card[0];

    console.log(next_card);

    let vars = {
        players: players,
        card: next_card
    }

    switch (next_card.type) {
        case TYPE_PLANET:
            res.render('template-planet', vars);
            break;
        case TYPE_NEGATIVE:
        case TYPE_NEUTRAL:
        case TYPE_POSITIVE:
            res.render('parallaxe', vars);
            break;
        case TYPE_PLACE:
            res.render('parallaxe', vars);
            break;
    }
}

module.exports.renderTestCardEvent = async function (req, res) {

    let players = await DB.tables.players.findAll();
    res.render('parallaxe', {players: players});
}

module.exports.templatePlanet = async function (req, res) {

    let players = await DB.tables.players.findAll();
    res.render('template-planet', {players: players});
}

module.exports.endScreen = function (req, res) {
    res.render('end-screen');
}

module.exports.indexLegacy = function (req, res) {
    res.render('index-legacy');
}