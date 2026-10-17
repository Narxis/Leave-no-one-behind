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
const qrcode = require('qrcode-terminal');

const startServer = async function() {

    constants.register();
    // Dossiers de données (bases, storage/cache) créés si besoin
    require('./src/config/paths').prepare();
    // Races customs (éditeur /races) ajoutées aux textes du jeu
    require('./src/controllers/races').applyToLang();
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
    await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });

    server.on('upgrade', (request, socket, head) => {
        WSS.handleUpgrade(request, socket, head, socket => {
            WSS.emit('connection', socket, request);
        });
    });

    WS.init();
    // DISABLE_BOT=true : serveur de test sans connecter le bot Discord
    if (process.env.DISABLE_BOT !== 'true')
        Bot.start();

    return {server, port: server.address().port};
}

module.exports = {start: startServer};

// Lancé avec node server.js. L'app de bureau (electron/main.js) appelle
// start() elle-même, sans la bannière ni le QR code
if (require.main === module) {
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
        log(`http://localhost:${PORT}/` + chalk.hex('#aaaaaa')(' (local)'),'#0645AD')
        log(`http://${ip}:${PORT}/` + chalk.hex('#aaaaaa')(' (Wifi Network)'),'#0645AD')
        qrcode.generate(`http://${ip}:${PORT}/`, {small:true}, function (qrcode) {
            console.log(qrcode);
        });
    });
}
