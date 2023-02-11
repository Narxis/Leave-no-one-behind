require('dotenv').config()
const {WebSocketServer} = require('ws');
const WS = require('./src/controllers/ws');
const constants = require('./src/config/constants');
const db = require ('./src/controllers/db');
const PORT = process.env.PORT || 8080;
const Bot = require('./src/controllers/discord');
const NodeCache = require( "node-cache" );
const os = require("os");
const chalk = require("chalk");
const {Config} = require("./src/models/config")
const {config} = require("dotenv");

const startServer = async function() {

    constants.register();
    let DB = new db.DB;
    global.DB = await DB.init();
    global.CONFIG = await new Config().hydrateDB();

    global.CACHE = new NodeCache();

    let app = require('./bin/express')();
    let router = require('./bin/express-router')();
    require('./src/routers/default')(router);
    require('./src/routers/api')(router);
    app.use('/', router);

    global.WSS = new WebSocketServer({ noServer: true });
    // WSS.on('connection', socket => {
    //     socket.on('message', message => console.log(message));
    // });

    const server = app.listen(PORT);

    server.on('upgrade', (request, socket, head) => {
        WSS.handleUpgrade(request, socket, head, socket => {
            WSS.emit('connection', socket, request);
        });
    });

    WS.init();
    Bot.start();
}

if (process.env.FORCE_COLOR !== 'true') {
    console.log('Add FORCE_COLOR=true to env var for colors !');
}

startServer().then(e => {
    let os = require('os');
    let interfaces = os.networkInterfaces();
    let addresses = [];
    for (let k in interfaces) {
        for (let k2 in interfaces[k]) {
            let address = interfaces[k][k2];
            if (address.family === 'IPv4' && !address.internal) {
                addresses.push(address.address);
            }
        }
    }
    let ip = addresses[0];
    clear();
    log("\n" +
        " ██╗     ███╗   ██╗ ██████╗ ██████╗ \n" +
        " ██║     ████╗  ██║██╔═══██╗██╔══██╗\n" +
        " ██║     ██╔██╗ ██║██║   ██║██████╔╝\n" +
        " ██║     ██║╚██╗██║██║   ██║██╔══██╗\n" +
        " ███████╗██║ ╚████║╚██████╔╝██████╔╝\n" +
        " ╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ \n" +
        "\n", "#ffcc00");
    if (process.env.FORCE_COLOR !== 'true')
        log('Ajouter FORCE_COLOR=true aux variables d\'environnement pour les couleurs sur gitbash \n');
    log(`Server launched on port ${PORT}\n`);
    log(`http://localhost:${PORT}/` + chalk.hex('#aaaaaa')(' (local)'),'#0645AD')
    log(`http://${ip}:${PORT}/` + chalk.hex('#aaaaaa')(' (Wifi Network)'),'#0645AD')
});