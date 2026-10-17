var controller = require('./../controllers/default');

module.exports = function(router) {
    router.get('/', controller.index);
    router.get('/200', controller.returnOk);

    router.get('/buildCard', controller.buildCardPage)

    router.get('/reset', controller.reset);
    router.get('/start', controller.start);
    router.get('/land', controller.land);
    router.get('/score', controller.showScore)

    router.get('/deck', controller.deckGenerator);
    router.get('/parametres', controller.settings);
    router.get('/persos', controller.persos);

    router.get('/mj-menu', controller.mjMenu);
    router.get('/end-screen', controller.endScreen);
    router.get('/fiche-vaisseau', controller.ficheVaisseau)
    router.get('/synopsis', controller.synopsis);
    router.get('/index', controller.index);
    router.get('/template-card-lieu', controller.renderTestCardPlace);
    router.get('/template-card', controller.renderTestCardEvent);
    router.get('/template-planet', controller.templatePlanet);
    router.get('/planet-lab', controller.renderPlanetLab);
    router.get('/races', controller.renderRaces);
    router.get('/items', controller.renderItemsEditor);
    router.get('/leaderboard', controller.leaderboard);
    router.get('/index-legacy', controller.indexLegacy);

    router.post('/fiche', controller.renderSingleSheet);
    router.get('/next', controller.renderCardEvent);
};