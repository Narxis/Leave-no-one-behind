var controller = require('./../controllers/default');
// On injecte le router d'express, nous en avons besoin pour définir les routes
module.exports = function(router) {
    // On crée une route sur l'url "/",
    // cette route va appeler la méthode index() du contrôleur
    router.get('/', controller.index);
    router.get('/coucou', controller.coucou);
    router.get('/event', controller.event);
    router.get('/deck', controller.deckGenerator);
};