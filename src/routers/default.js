var controller = require('./../controllers/default');
const {Card} = require("../models/card");

module.exports = function(router) {
    router.get('/', controller.index);
    router.get('/coucou', controller.coucou);
    router.get('/event', controller.event);
    router.get('/deck', controller.deckGenerator);

    // let card_obj = {
    //     type: 1,
    //     value: -1,
    //     name: 'insertion manuelle',
    //     desc: 'description 123',
    //     timer: 0,
    //     choices: [
    //         'coucou', 'hey', 'salut'
    //     ],
    //     modules: {
    //         oxy: {
    //             cost: 1,
    //             value: 2
    //         },
    //         res: {
    //             cost:3,
    //             value:4
    //         }
    //     }
    // }
    // let c = new Card();
    // c.create(card_obj);
};