const {Player} = require("../models/player");
const {Bonuses} = require("../models/bonuses");
const {response} = require("express");
const {Ship} = require("../models/ship");
const shipId = 1;

const init = function (){

    WSS.on('connection', (ws) => {
        //connection is up, let's add a simple event
        ws.on('message', (message, isBinary) => {

            let data = isBinary ? message : message.toString();
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

    console.log(response);
    switch (response.action) {
        case 'playerStat':
            payload = actionSetPlayerStat(response);
            break;
        case 'roll':
            payload = actionRoll(response);
            break;
        case 'setModule':
            payload = actionSetModule(response);
            break;
        case 'setStatus':
            payload = actionSetStatus(response);
            break;
        case 'detection':
            payload = actionSetDetection(response);
            break;
        case 'conso':
            payload = actionConso(response);
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
        default:
            payload = {
                error: true,
                message: 'action does not exists',
                data: {}
            };
    }
    return payload;
}

const actionSetRace = async function(response) {

    await new Player().update({race: response.race}, response.uid);
    return {
        action: response.action,
        error: false,
        data: response
    };
}

const actionSetName = async function(response) {

    await new Player().update({name: response.nick}, response.uid);
    return {
        action: response.action,
        error: false,
        data: response
    };
}

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

// set to given value
const actionSetPlayerStat = async function(response) {

    let player = new Player(response.data.player_id);
    let val = parseInt(response.data.val);
    let stat = response.data.stat;

    player = await player.getData();
    if (player) {
        let data = {};
        data[stat] = val;
        await player.update(data);
    }

    return {
        action: response.action,
        error: false,
        data: response.data
    }
}

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

const actionSetStatus = async function(response) {

    let status = response.data.name;
    let val = response.data.value;
    let bonuses = new Bonuses();

    if (await bonuses.exists(status))
        await bonuses.updateStatus(status, val);
    else
        await bonuses.create(status, val, 0);

    return {
        action: response.action,
        error: false,
        data: response.data
    }
}

const actionSetDetection = async function(response) {

    let val = response.data.value;

    // TODO implement detection points on ship

    return {
        action: response.action,
        error: false,
        data: response.data
    }
}

const actionConso = async function (response) {

    let name = response.data.name;
    let remove = response.data.remove;
    let bonuses = new Bonuses();

    if (remove)
        await bonuses.deleteOne(name);
    else
        await bonuses.create(name);

    return {
        action: response.action,
        error: false,
        data: response.data
    }
}

const actionRoll = async function (response) {
    let player = await new Player(response.data.player_id).getData();
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
                if (client.readyState === ws.OPEN) {
                    client.send(payload);
                }
            }
        });
    }
    catch (e) {
        console.log(e)
    }
}

module.exports = {init}