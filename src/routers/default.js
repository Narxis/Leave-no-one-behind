var controller = require('./../controllers/default');

module.exports = function(router) {
    router.get('/', controller.index);
    router.get('/randCard', controller.randCard);
    router.get('/deck', controller.deckGenerator);

    router.get('/manageCards', controller.cardEdit);
    router.post('/cardEdit', controller.cardEdit);
};