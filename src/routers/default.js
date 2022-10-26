var controller = require('./../controllers/default');

module.exports = function(router) {
    router.get('/', controller.index);
    router.get('/200', controller.returnOk);
    router.get('/randCard', controller.randCard);
    router.get('/deck', controller.deckGenerator);

    router.get('/createCard', controller.cardEdit);
    router.post('/createCard', controller.cardCreate);
};