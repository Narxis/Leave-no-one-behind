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
    // TODO get ship
    // TODO do it with card pop once baseCard.json is completed
    // let next_card = cardPop();
    // TESTING :
    let next_card = await getCards(ALL, 1);
    next_card = next_card[0];


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

// TEST TPL PARALLAXE
module.exports.renderTestCardEvent = async function (req, res) {

    let players = await DB.tables.players.findAll();
    let card = {
        desc: 'Vos radars détectent des débris à très haute vitesse en direction de votre vaisseau. Ces débris vont percuter votre vaisseau au niveau au niveau du module de détection.',
        timer: 1,
        choices: [
            {
                value: "Minimiser la casse\n(Ingénieur)",
                reveal: "Vous tentez de minimiser la casse, le débris percute votre vaisseau à toute vitesse, malgrès vos effort il est impossible de sauver l'intégralité du module"
            },
            {
                value: "Tenter une manoeuvre d'évitement\n(Pilote)",
                reveal: "Vous essayer d'esquiver le débris mais celui-ci percute une autre partie du vaisseau à la place."
            },
            {
                value: "Ne rien faire",
                reveal: ""
            }
        ]
    }
    let vars = {
        players: players,
        card: card
    }
    console.l

    res.render('parallaxe', vars);
}

// TEST TPL PLANET
module.exports.templatePlanet = async function (req, res) {

    let players = await DB.tables.players.findAll();
    let card =  {
        value: 890,
        modules: {
            oxy: {cost: '2', val: '50'},
            grv: {cost: '3', val: '30'},
            wtr: {cost: '2', val: '30'},
            fau: {cost: '4', val: '60'},
            cli: {cost: '2', val: '30'},
            res: {cost: '1', val: '40'}
        },
    }
    let vars = {
        players: players,
        card: card
    }

    res.render('template-planet', vars);
}

module.exports.endScreen = function (req, res) {
    res.render('end-screen');
}

module.exports.indexLegacy = function (req, res) {
    res.render('index-legacy');
}