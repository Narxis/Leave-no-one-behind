module.exports.init = function (wss){

    wss.on('connection', (ws) => {
        //connection is up, let's add a simple event
        ws.on('message', (message) => {

            //log the received message and send it back to the client
            console.log('received: %s', message);
            // ws.send(`-> ${message}`);  // Unique
            // All
            wss.clients.forEach(function each(client) {
                if (client !== ws && client.readyState === ws.OPEN) {
                    client.send(`-> ${message}`);
                }
            });
        });

        //send immediatly a feedback to the incoming connection
        ws.send('Hi there, I am a WebSocket server');
    });
}
