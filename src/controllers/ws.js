const {Player} = require("../models/player");
const {response} = require("express");
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

    switch (response.action) {
        case 'roll':
            payload = actionRoll(response);
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

const actionRoll = async function (response) {
    let player = await new Player(response.data.player_id).getData();
    let dice_result = Math.floor(Math.random() * 100) + 1;
    response.data['success'] = await player.roll(dice_result, response.data.stat, response.data.module);
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