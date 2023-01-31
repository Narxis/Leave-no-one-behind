const {Player} = require("./../models/player");
const {Ship} = require("./../models/ship");
const {hydrateCardDB, getCards, cardPop} = require("./deck");
const {Statuses} = require("../models/statuses");

// TODO replace shipId with current game ship ID
const shipId = 1;

module.exports.index = async function(req, res) {

    let statuses = new Statuses();
    await statuses.hydrateDB();
    res.status(200);
    res.json({});
};

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

    //TODO replace with card pop when baseCard.json is completed
    let next_card = await cardPop(false);
    // TESTING :
    // let next_card = await getCards(ALL, 1);
    // next_card = next_card[0];

    res.json(next_card);
}
module.exports.popNextCard = async function (req, res) {

    //TODO replace with card pop when baseCard.json is completed
    let next_card = await cardPop();
    // TESTING :
    // let next_card = await getCards(ALL, 1);
    // next_card = next_card[0];

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

const showError = function (res, msg) {
    res.status(404);
    res.json({
        error_msg: msg
    })
}