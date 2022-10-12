var fs = require('fs');
let {deckGenerator,getCards} = require('../controllers/deck')
const {Card} = require("../models/card");

module.exports.index = function(req, res) {
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