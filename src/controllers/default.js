var fs = require('fs');
let {deckGenerator,getCards} = require('./../controllers/deck')
const {Card} = require("./../models/card");
const {cardPop} = require("./deck");
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

module.exports.parallaxe = function (req, res) {
    res.render('parallaxe');
}

module.exports.templatePlanet = function (req, res) {
    res.render('template-planet');
}

module.exports.endScreen = function (req, res) {
    res.render('end-screen');
}

module.exports.indexLegacy = function (req, res) {
    res.render('index-legacy');
}

// module.exports.manageCards = function (req, res) {
//     res.render('forms/cardEdit')
// }
// module.exports.cardEdit = async function (req, res) {
//     let card = new Card(req.body.id);
//     switch (req.body.mode) {
//         case 'add':
//             await card.create(req.body);
//             break;
//         case 'edit':
//             await card.update(req.body);
//             break;
//         case 'del':
//             await card.delete();
//             break;
//     }
//     res.render('forms/cardEdit')
// }
// module.exports.cardCreate = async function (req, res) {
//     let card = new Card(0);
//     await card.create(req.body);
//     res.render('forms/cardEdit');
// }