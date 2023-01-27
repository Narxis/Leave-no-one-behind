var controller = require('./../controllers/api');
var basePath = '/api';

module.exports = function(router) {
    router.get(basePath + '/', controller.index);

    router.get(basePath + '/reset', controller.reset);

    router.get(basePath + '/getNextCard', controller.getNextCard);
    router.get(basePath + '/popNextCard', controller.popNextCard);

    router.get(basePath + '/players', controller.getAllPlayers);
    router.get(basePath + '/player/:playerId', controller.getPlayer);
    router.get(basePath + '/player/:playerId/:stat/:val', controller.updatePlayer); // :val can be SIGNED

    router.get(basePath + '/ship', controller.getShip);
    router.get(basePath + '/ship/upgrade/:module', controller.upgradeShipModule);
    router.get(basePath + '/ship/:module/:val', controller.updateShipModule);
};