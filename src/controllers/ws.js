const {Player} = require("../models/player");
const {Items} = require("../models/items");
const {response} = require("express");
const {Ship} = require("../models/ship");
const {Statuses} = require("../models/statuses");
const shipId = 1;
const chalk = require("chalk")
const combat = require("./combat");
const allies = require("./allies");
const inventory = require("./inventory");
const cardLoot = require("./cardLoot");
const loot = require("./loot");
const merchant = require("./merchant");
const shipAlerts = require("./shipAlerts");
const lobby = require("./lobby");
const remote = require("./remote");
const playerView = require("./playerView");
const chat = require("./chat");
const WebSocket = require("ws");

const init = function (){

    WSS.on('connection', (ws) => {
        //connection is up, let's add a simple event
        ws.on('message', (message, isBinary) => {

            let data = isBinary ? message : message.toString();
            let data_json = JSON.parse(data);
            log('[WS] '+ chalk.hex('#aaaaaa')(data_json.action), '#ffcc00');
            // Une action peut produire plusieurs messages (un /roll qui règle
            // aussi une attaque de combat)
            makeAction(data).then(data => {
                for (let payload of (Array.isArray(data) ? data : [data]))
                    if (payload)
                        broadcastData(payload, ws);
            })
        });

        //send immediatly a feedback to the incoming connection
        ws.send('Hi there, I am a WebSocket server');
    });

    // Joueurs en ligne (relais) : actions permises, en leur nom, puis
    // résultat diffusé aux pages du MJ comme pour une action locale
    remote.init({
        run: (action) => makeAction(JSON.stringify(action)),
        broadcast: (payload) => broadcastData(payload)
    });
    playerView.init();
    chat.init(payload => broadcastData(payload));
}

const makeAction = async function (raw_response) {
    let response = {}
    let payload = {}
    try {
        response = JSON.parse(raw_response.toString());
    } catch(e) {
        return  {
            error: true,
            message: e,
            data: {}
        };
    }

    switch (response.action) {
        case 'playerStat':
            payload = actionSetPlayerStat(response);
            break;
        case 'roll':
            payload = actionRoll(response).then(roll => {
                let attack = combat.resolveRoll(roll);
                return attack ? [roll, attack] : roll;
            });
            break;
        case 'setModule':
            payload = actionSetModule(response);
            break;
        case 'status':
            payload = actionSetStatus(response);
            break;
        case 'detection':
            payload = actionSetDetection(response);
            break;
        case 'item':
            payload = actionItem(response);
            break;
        case 'join':
            payload = actionJoin(response);
            break;
        case 'set-race':
            payload = actionSetRace(response);
            break;
        case 'set-name':
            payload = actionSetName(response);
            break;
        case 'roll-stats-done':
        case 'roll-stats':
            payload = actionRollStats(response);
            break;
        case 'game-ready':
            payload = response;
            break;
        case 'card-played':
            payload = response;
            break;
        case 'emote':
            payload = response;
            break;
        case 'passThrough':
            payload = response.data;
            break;
        case 'combat-start':
        case 'combat-end':
        case 'combat-hp':
        case 'combat-target':
        case 'combat-cancel':
        case 'combat-enemy-attack':
        case 'combat-loot':
        case 'combat-add':
        case 'combat-status':
        case 'combat-turn':
        case 'combat-player-hp':
            payload = combat.handle(response);
            break;
        case 'combat-ally-attack':
            payload = combat.allyAttack(response.data || {}) || combat.handle(response);
            break;
        case 'inventory-move':
        case 'inventory-sync':
        case 'card-loot-all':
            payload = inventory.handle(response);
            break;
        case 'card-loot-offer':
            payload = cardLoot.handle(response);
            break;
        case 'merchant-state':
        case 'merchant-open':
        case 'merchant-close':
        case 'merchant-buy':
        case 'merchant-sell':
        case 'money-add':
        case 'money-transfer':
            payload = merchant.handle(response);
            break;
        case 'lobby-state':
        case 'lobby-open':
        case 'lobby-close':
        case 'lobby-kick':
            payload = lobby.handle(response);
            break;
        case 'chat-send':
        case 'chat-history':
            payload = chat.handle(response);
            break;
        case 'ship-alerts':
            payload = shipAlerts.handle(response);
            break;
        case 'ally-add': {
            // Compagnon créé en plein combat : annoncé comme renfort
            let added = allies.handle(response);
            let joined = added.data.event && combat.allyJoined(added.data.allies.find(a => a.id === added.data.event.id).name);
            payload = joined ? [added, joined] : added;
            break;
        }
        case 'ally-update':
        case 'ally-remove':
            payload = allies.handle(response);
            break;
        default:
            payload = {
                error: true,
                message: 'action does not exists',
                data: {}
            };
    }
    return payload;
}

/**
 * Set stat during creation
 * * @param response
 * @returns {Promise<*>}
 */
const actionRollStats = async function (response) {
    // TODO
    return {
        action: response.action,
        error: false,
        data: response.data
    };
}

/**
 * Set Race during creation
 * @param response
 * @returns {Promise<{data, action, error: boolean}>}
 */
const actionSetRace = async function(response) {

    await new Player().update({race: response.race}, response.uid);
    return {
        action: response.action,
        error: false,
        data: response
    };
}

/**
 * Set Name during creation
 * @param response
 * @returns {Promise<{data, action, error: boolean}>}
 */
const actionSetName = async function(response) {

    await new Player().update({name: response.nick}, response.uid);
    return {
        action: response.action,
        error: false,
        data: response
    };
}

/**
 * Join game
 * @param response
 * @returns {Promise<{data, action, error: boolean, message: string}|*>}
 */
const actionJoin = async function(response) {

    let player = await new Player().create({discord_id: response.uid, name: response.nick});

    if (player) {
        return response;
    }
    return {
        action: response.action,
        error: true,
        message: 'Player already exists',
        data: response.data
    };
}

/**
 * Update specific player stat
 * @param response
 * @returns {Promise<{data, action, error: boolean}>}
 */
const actionSetPlayerStat = async function(response) {

    let player = new Player();
    let val = parseInt(response.data.value);
    let stat = response.data.name;

    player = await player.getData(response.data.player_id);
    if (player) {
        let data = {};
        data[stat] = val;
        await player.update(data, response.data.player_id);
    }

    return {
        action: response.action,
        error: false,
        data: player
    }
}

/**
 * Update specific module
 * @param response
 * @returns {Promise<{data, action, error: boolean}>}
 */
const actionSetModule = async function(response) {
    let ship = new Ship(shipId);
    let module = response.data.name;
    let val = response.data.value;

    let data = {};
    data[module] = val;

    await ship.update(data);

    return {
        action: response.action,
        error: false,
        data: response.data
    }
}

/**
 * Update | Create Specific status
 * @param response
 * @returns {Promise<{data, action, error: boolean}>}
 */
const actionSetStatus = async function(response) {

    let status = String(response.data.name || '').trim().toLowerCase();
    // Durée en tours de carte : un champ vide vaut 1, 0 retire le status
    let val = response.data.value === '' || response.data.value === undefined ? 1 : parseInt(response.data.value);
    let known = await DB.tables.statuses.findOne({where: {slug: status}});
    if (!known || isNaN(val))
        return {
            action: response.action,
            error: true,
            error_msg: 'status inconnu ou durée invalide : ' + status,
            data: {}
        };
    val = Math.max(0, Math.min(99, val));
    response.data = {name: status, value: val};
    let statuses = new Statuses();

    await statuses.updateStatus(status, val);

    return {
        action: response.action,
        error: false,
        data: response.data
    }
}

/**
 * Update detection Value
 * @param response
 * @returns {Promise<{data, action, error: boolean}>}
 */
const actionSetDetection = async function(response) {

    let val = response.data.value;

    // TODO implement detection points on ship

    return {
        action: response.action,
        error: false,
        data: response.data
    }
}

/**
 * Add | Remove a consumable with a given name
 * @param response
 * @returns {Promise<{data, action, error: boolean}>}
 */
const actionItem = async function (response) {

    let slug = response.data.slug;
    let discord_id = response.data.discord_id;
    let remove = response.data.remove;
    let items = new Items();

    if (remove) {
        if (discord_id)
            await items.removeItemFromPlayer(slug, discord_id);
        else
            await items.remove(slug);
    }
    else if (slug)
        await items.add(slug, loot.qtyOf(response.data.qty));

    // Les onglets des joueurs et la liste du vaisseau se mettent à jour partout
    return inventory.payload(null);
}

/**
 * Return the result of a roll for a player
 * @param response
 * @returns {Promise<{data, action, error: boolean}>}
 */
const actionRoll = async function (response) {
    let player = await new Player().getData(response.data.discord_id);
    if (!player) {
        return  {
            action: response.action,
            error: true,
            error_msg: 'Player not in current game !'
        }
    }
    let dice_result = Math.floor(Math.random() * 100) + 1;
    let result = await player.roll(dice_result, response.data.stat, response.data.module);
    response.data['success'] = (result >= 50);
    response.data['result'] = result;
    response.data['dice_result'] = dice_result;
    return  {
        action: response.action,
        error: false,
        data: response.data
    }
}

const broadcastData = function (data, ws, sendBackToSender = true) {

    try {
        let payload = JSON.stringify(data);
        WSS.clients.forEach(function each(client) {
            if ((!sendBackToSender && (client !== ws)) || sendBackToSender) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(payload);
                }
            }
        });
    }
    catch (e) {
        log(e)
    }
    // L'état du jeu a pu changer : la vue des joueurs en ligne suit
    if (!data || !['lobby', 'chat', 'chat-history'].includes(data.action))
        playerView.changed();
}

module.exports = {init}