var controller = require('./../controllers/default');
const {Card} = require("../models/card");

module.exports = function(router) {
    router.get('/', controller.index);
    router.get('/coucou', controller.coucou);
    router.get('/event', controller.event);
    router.get('/deck', controller.deckGenerator);
    let c = new Card(3);
    c.getData();
};