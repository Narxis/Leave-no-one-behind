var controller = require('./../controllers/default');
const {Card} = require("../models/card");
const {deckGenerator, getCards} = require("../controllers/deck");

module.exports = function(router) {
    router.get('/', controller.index);
    router.get('/coucou', controller.coucou);
    router.get('/event', controller.event);
    router.get('/deck', controller.deckGenerator);

    let card_obj = {
        type: 1,
        value: -1,
        name: 'insertion manuelle 666666666',
        choices: [
            'coucou', 'hey', 'plop'
        ],
        modules: {
            oxy: {
                cost: 1,
                value: 2
            },
            res: {
                cost:3,
                value:4
            }
        }
    }
    let c = new Card(66);
    c.update(card_obj);
    deckGenerator()
};