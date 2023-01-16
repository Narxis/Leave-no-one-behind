var fs = require('fs');
let {deckGenerator,getCards} = require('./../controllers/deck')
const {Card} = require("./../models/card");
const {cardPop} = require("./deck");

module.exports.index = function(req, res) {
    res.render('index');
};

module.exports.returnOk = function (req, res) {
    res.status(200);
    res.json({status: 200})
}

module.exports.randCard = function (req, res) {
    getCards(1, 1).then(card => {
        if (req.query.json === '1')
            res.json(card[0])
        else
            res.render('card', {event: card[0]});
    });
    // cardPop();
    // res.render('index');
}

module.exports.deckGenerator = function (req, res) {
    deckGenerator().then(
        res.render('index')
    );

}

module.exports.renderSingleSheet = function (req, res) {
    res.render('partials/fiche-perso', {player: req.body});
}

module.exports.persos = function (req, res) {
    res.render('perso');
}

module.exports.manageCards = function (req, res) {
    res.render('forms/cardEdit')
}
module.exports.cardEdit = async function (req, res) {
    let card = new Card(req.body.id);
    switch (req.body.mode) {
        case 'add':
            await card.create(req.body);
            break;
        case 'edit':
            await card.update(req.body);
            break;
        case 'del':
            await card.delete();
            break;
    }
    res.render('forms/cardEdit')
}
module.exports.cardCreate = async function (req, res) {
    let card = new Card(0);
    await card.create(req.body);
    res.render('forms/cardEdit');
}