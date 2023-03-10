const {Player} = require("../models/player");
const {Items} = require("../models/items");
const {response} = require("express");
const {Ship} = require("../models/ship");
const {Statuses} = require("../models/statuses");
const {friendFoe} = require("../models/friendFoe");
const shipId = 1;
const ff = require("../controllers/ff")
const chalk = require("chalk")

const init = function (){

    WSS.on('connection', (ws) => {
        //connection is up, let's add a simple event
        ws.on('message', (message, isBinary) => {

            let data = isBinary ? message : message.toString();
            let data_json = JSON.parse(data);
            log('[WS] '+ chalk.hex('#aaaaaa')(data_json.action), '#ffcc00');
            makeAction(data).then(data => {broadcastData(data, ws)})
        });

        //send immediatly a feedback to the incoming connection
        ws.send('Hi there, I am a WebSocket server');
    });
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
            payload = actionRoll(response);
            break;
        case 'ff_switch':
        case 'ff_update':
        case 'ff_create':
        case 'ff_delete':
        case 'ff_roll':
            payload = actionFriendFoe(response);
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
        default:
            payload = {
                error: true,
                message: 'action does not exists',
                data: {}
            };
    }
    return payload;
}

const actionFriendFoe = async function(response) {

    let payload = {action: response.action};
    switch (response.action) {
        case 'ff_switch':
            payload.data = await new friendFoe(response.data.id).switchTeam();
            break;
        case 'ff_create':
            if (response.data.type === 'slug') {
                payload.data = await ff.createFromSlug(response.data.val, response.data.is_friend);
            }
            else if (response.data.type === 'race') {
                payload.data = await ff.createFromRace(response.data.val, response.data.is_friend);
            }
            break;
        case 'ff_delete':
            await new friendFoe(response.data.id).delete();
            payload.data = {};
            break;
        case 'ff_roll':
            let roll = await new friendFoe(response.data.id).roll(response.data.stat);
            payload.data = {
                stat: response.data.stat,
                success: roll >= 50,
                roll: roll
            }
            break;
        case 'ff_update':
            let statToUpdate = response.data.stat;
            let dataUpdate = {};
            dataUpdate[statToUpdate] = response.data.val;
            payload.data = await new friendFoe(response.data.id).update(dataUpdate);
            break;
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

    let status = response.data.name;
    let val = response.data.value;
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
        if (discord_id !== '') {
            await items.removeItemFromPlayer(slug, discord_id);
        }
        else {
            await items.remove(slug);
        }
    }
    else {
        await items.add(slug);
    }

    return {
        action: response.action,
        error: false,
        data: response.data
    }
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
    let dice_result = randomIntFromInterval(1,100);
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
                if (client.readyState === ws.OPEN) {
                    client.send(payload);
                }
            }
        });
    }
    catch (e) {
        log(e)
    }
}

module.exports = {init}