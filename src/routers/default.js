var controller = require('./../controllers/default');

module.exports = function(router) {
    router.get('/', controller.index);
    router.get('/coucou', controller.coucou);
    router.get('/event', controller.event);
    router.get('/deck', controller.deckGenerator);
};