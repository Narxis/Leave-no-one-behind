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
            let player = await new Player(response.data.player_id).getData();
            let dice_result = Math.floor(Math.random() * 100) + 1;
            let result = await player.roll(dice_result, response.data.stat, response.data.module)
            response.data['success'] = result;
            response.data['dice_result'] = response.data.dice_result;
            payload = {
                action: 'roll',
                error: false,
                data: response.data
            }
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