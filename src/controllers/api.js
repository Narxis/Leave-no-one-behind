const {Player} = require("./../models/player");
const {Ship} = require("./../models/ship");
const {hydrateCardDB, getCardsIds, cardPop} = require("./deck");
const {Statuses} = require("../models/statuses");
const {Items} = require("../models/items");
const {Card} = require("../models/card");

// TODO replace shipId with current game ship ID
const shipId = 1;

module.exports.index = async function(req, res) {

    res.status(200);
    res.json({});
};

module.exports.getAllStatuses = async function(req, res) {
    let statuses = new Statuses();
    statuses = await statuses.getAllStatuses(false);

    res.json(statuses);
}

module.exports.getActiveStatuses = async function(req, res) {
    let statuses = new Statuses();
    statuses = await statuses.getAllStatuses();

    res.json(statuses);
}

module.exports.getAllItems = async function(req, res) {
    let items = new Items();
    items = await items.getAllItems(false);

    res.json(items);
}

module.exports.getOwnedItems = async function(req, res) {
    let items = new Items();
    items = await items.getAllItems();

    res.json(items);
}

module.exports.getPlayerItems = async function(req, res) {
    let itemsMan = new Items();
    let items = await itemsMan.getAllStarters();

    items = items.filter(item => item.owners.includes(req.params.discordId))

    res.json(items);
}

module.exports.getPlayer = async function (req, res) {
    let player = new Player();
    player = await player.getData(req.params.discordId);
    if (!player)
        showError(res, 'No player for this ID')
    else {
        delete player['accepted_datas'];
        res.json(player)
    }
}

module.exports.getAllPlayers = async function (req, res) {

    let players = await DB.tables.players.findAll();
    res.json(players);
}

module.exports.getNextCard = async function (req, res) {

    let next_card = await cardPop(false);

    res.json(next_card);
}

module.exports.getCardByName = async function (req, res) {

    let cardRaw = await DB.tables.cards.findOne({
        attributes: [
            'id'
        ],
        where: {
            name: req.params.name
        }
    });

    let card = await new Card(cardRaw.id).getData();

    res.json(card);
}

module.exports.popNextCard = async function (req, res) {

    let next_card = await cardPop();

    let statuses = await new Statuses();
    let activeStatuses = await statuses.getAllStatuses();

    for (let i of activeStatuses) {
        await statuses.remove(i.slug);
    }

    res.json(next_card);
}

// module.exports.updatePlayer = async function (req, res) {
//     let player = new Player(req.params.playerId);
//     let stat = req.params.stat;
//     let val = parseInt(req.params.val);
//     player = await player.getData();
//     if (!player)
//         showError(res, 'No player for this ID')
//     else {
//         if (typeof player.accepted_datas[stat] !== 'number') {
//             showError(res, 'Wrong stat, expecting one of [combat|pilotage|engineering|survival|recon|moral]')
//         }
//         else {
//             let data = {};
//             data[stat] = player[stat] + val;
//             let updatedPlayer = await player.update(data)
//             updatedPlayer['updated_stat'] = stat;
//             updatedPlayer['updated_val'] = val;
//             delete updatedPlayer['accepted_datas'];
//             res.json(updatedPlayer);
//         }
//     }
// }

module.exports.getShip = async function (req, res) {
    let ship = new Ship(shipId);
    if (! await ship.getData())
        await ship.create();
    delete ship['accepted_datas'];
    res.json(ship);
}

module.exports.getAllCards = async function (req, res) {

    let type = req.params.type;
    let whereClause;


    switch (type) {
        case 'planet':
            whereClause = {type: TYPE_PLANET};
            break;
        case 'positive':
            whereClause = {type: TYPE_POSITIVE};
            break;
        case 'negative':
            whereClause = {type: TYPE_NEGATIVE};
            break;
        case 'neutral':
            whereClause = {type: TYPE_NEUTRAL};
            break;
        case 'initial':
            whereClause = {type: TYPE_INITIAL};
            break;
        case 'place':
            break;
    }

    let cardsRaw = await DB.tables.cards.findAll({where:whereClause, raw:true});
    let cards = [];

    for (let item of cardsRaw){
        let  card = await new Card(item.id).getData();
        card = cleanObject(card, 'langVars','cardVars','accepted_datas');
        cards.push(card);
    }

    res.json(cards);
}

// module.exports.upgradeShipModule = async function (req, res) {
//     let ship = new Ship(shipId);
//     let mod = req.params.module;
//     await ship.getData();
//     if (typeof ship.accepted_datas[mod + '_up'] !== 'number')
//         showError(res, 'Not an upgradable module, expectiong on of [scanner|oxygen|energy|gravity]')
//     else if (ship[mod + '_up'] !== 0)
//         showError(res, 'This module is already upgraded')
//     else {
//         await ship.upgradeModule(mod);
//         delete ship['accepted_datas'];
//         res.json(ship);
//     }
// }

// module.exports.updateShipModule = async function (req, res) {
//     let ship = new Ship(shipId);
//     let mod = req.params.module;
//     await ship.getData();
//     if (ship.accepted_datas[mod] !== 100) {
//         showError(res, 'Not a module, expectiong on of [cryopods|scanner|proximity|motors|shield|oxygen|energy|gravity|landing|construction]')
//     }
//     else {
//         await ship.updateIntegrity(mod, req.params.val);
//         delete ship['accepted_datas'];
//         res.json(ship);
//     }
// }

const cleanObject = function (object, ...unusedKeys){
    for (let key in object) {
        if (unusedKeys.includes(key) === true)
            delete object[key];
    }
    return object;
}

const showError = function (res, msg) {
    res.status(404);
    res.json({
        error_msg: msg
    })
}