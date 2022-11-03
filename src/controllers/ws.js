module.exports.init = function (wss){

    wss.on('connection', (ws) => {
        //connection is up, let's add a simple event
        ws.on('message', (message) => {

            //log the received message and send it back to the client
            console.log('received: %s', message);
            ws.send(`Hello, you sent -> ${message}`);
        });

        //send immediatly a feedback to the incoming connection
        ws.send('Hi there, I am a WebSocket server');
    });
}
