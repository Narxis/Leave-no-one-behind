var controller = require('./../controllers/api');
var basePath = '/api/v' + API_VER;

module.exports = function(router) {
    router.get(basePath + '/', controller.index);

    router.get(basePath + '/player/:playerId', controller.getPlayer);
    router.get(basePath + '/player/:playerId/:stat/:val', controller.updatePlayer); // :val can be SIGNED

    router.get(basePath + '/ship', controller.getShip);
};