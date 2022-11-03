require('dotenv').config()
const {WebSocketServer} = require('ws');
const WS = require('./src/controllers/ws');
const constants = require('./src/config/constants');
const db = require ('./src/controllers/db');
const PORT = process.env.PORT || 8080;
const Bot = require('./src/controllers/discord');

const startServer = async function() {

    constants.register();
    let DB = new db.DB;
    global.DB = await DB.init();

    let app = require('./bin/express')();
    let router = require('./bin/express-router')();
    require('./src/routers/default')(router);
    require('./src/routers/api')(router);
    app.use('/', router);

    const wss = new WebSocketServer({ noServer: true });
    wss.on('connection', socket => {
        socket.on('message', message => console.log(message));
    });

    const server = app.listen(PORT);

    server.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, socket => {
            wss.emit('connection', socket, request);
        });
    });

    WS.init(wss);

    Bot.start();
}

startServer().then(e => {
    console.log(`Server launched on port ${PORT}`);
});