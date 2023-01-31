var controller = require('./../controllers/api');
var basePath = '/api';

module.exports = function(router) {
    router.get(basePath + '/', controller.index);

    router.get(basePath + '/getNextCard', controller.getNextCard);
    router.get(basePath + '/popNextCard', controller.popNextCard);

    router.get(basePath + '/players', controller.getAllPlayers);
    router.get(basePath + '/player/:discordId', controller.getPlayer);
    // router.get(basePath + '/player/:playerId/:stat/:val', controller.updatePlayer); // :val can be SIGNED

    router.get(basePath + '/statuses', controller.getAllStatuses);
    router.get(basePath + '/statuses/active', controller.getActiveStatuses);

    router.get(basePath + '/items', controller.getAllItems);
    router.get(basePath + '/items/owned', controller.getOwnedItems);

    router.get(basePath + '/ship', controller.getShip);
    // router.get(basePath + '/ship/upgrade/:module', controller.upgradeShipModule);
    // router.get(basePath + '/ship/:module/:val', controller.updateShipModule);
};