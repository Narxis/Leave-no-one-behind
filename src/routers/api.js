var controller = require('./../controllers/api');
var basePath = '/api';

module.exports = function(router) {
    router.get(basePath + '/', controller.index);

    router.post(basePath + '/savePlaces', controller.savePlaces)
    router.post(basePath + '/deletePlace', controller.deletePlace)

    router.get(basePath + '/nextCard/get', controller.getNextCard);
    router.get(basePath + '/nextCard/pop', controller.popNextCard);
    router.get(basePath + '/nextCard/get/:name', controller.getCardByName);
    router.get(basePath + '/currentCard', controller.getCurrentCard);
    router.get(basePath + '/blankCard', controller.getBlankCard);

    router.get(basePath + '/getAllCards', controller.getAllCards);
    router.get(basePath + '/getAllCards/:type', controller.getAllCards);

    router.get(basePath + '/players', controller.getAllPlayers);
    router.get(basePath + '/combat', controller.getCombat);
    router.get(basePath + '/allies', controller.getAllies);
    router.get(basePath + '/ship/alerts', controller.getShipAlerts);
    router.get(basePath + '/team', controller.getTeam);
    router.get(basePath + '/races', controller.getRaces);
    router.post(basePath + '/races', controller.saveRace);
    // Races customs autorisées dans la partie (cochées par le MJ sur /persos)
    router.get(basePath + '/races/allowed', controller.getAllowedRaces);
    router.post(basePath + '/races/allowed', controller.setAllowedRaces);
    router.delete(basePath + '/races/:slug', controller.deleteRace);

    router.get(basePath + '/npcs', controller.getNpcs);
    router.post(basePath + '/npcs/:kind', controller.saveNpc);
    router.delete(basePath + '/npcs/:kind/:slug', controller.deleteNpc);
    router.post(basePath + '/team', controller.setTeam);
    router.get(basePath + '/settings', controller.getSettings);
    router.post(basePath + '/settings', controller.setSettings);
    router.get(basePath + '/player/:discordId', controller.getPlayer);
    // router.get(basePath + '/player/:playerId/:stat/:val', controller.updatePlayer); // :val can be SIGNED

    router.get(basePath + '/statuses', controller.getAllStatuses);
    router.get(basePath + '/statuses/active', controller.getActiveStatuses);

    router.get(basePath + '/items', controller.getAllItems);
    router.get(basePath + '/items/owned', controller.getOwnedItems);
    router.get(basePath + '/items/owned/:discordId', controller.getPlayerItems);
    // Éditeur d'objets (/items) : catalogue src/config/items.json
    router.get(basePath + '/items/catalog', controller.getItemCatalog);
    router.post(basePath + '/items/catalog', controller.saveCatalogItem);
    router.delete(basePath + '/items/catalog/:slug', controller.deleteCatalogItem);

    router.get(basePath + '/ship', controller.getShip);
    // router.get(basePath + '/ship/upgrade/:module', controller.upgradeShipModule);
    // router.get(basePath + '/ship/:module/:val', controller.updateShipModule);
};