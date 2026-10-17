// App de bureau LNOB. À l'ouverture, on choisit son mode :
// - MJ : l'app lance le serveur du jeu, l'affiche et ouvre la partie en ligne
//   (code à donner aux joueurs) ;
// - joueur : l'app ouvre la page joueur, qui rejoint la partie par le relais.
const {app, BrowserWindow, Menu, dialog, ipcMain, shell} = require('electron');
const net = require('net');
const os = require('os');
const path = require('path');

// Ce que le jeu écrit (bases, storage/cache, images des races customs) va dans
// le dossier de données de l'utilisateur : le dossier de l'app est en lecture seule
process.env.LNOB_DATA_DIR = process.env.LNOB_DATA_DIR || app.getPath('userData');
// Le bot Discord n'est plus utilisé : son code reste dans le dépôt
process.env.DISABLE_BOT = 'true';

const PREFERRED_PORT = parseInt(process.env.PORT) || 8080;
let port = null;
let mainWindow = null;
let mode = null; // 'host' ou 'join'

// Le port habituel s'il est libre (le panneau MJ sur téléphone garde la même
// adresse d'une partie à l'autre), sinon un port choisi par le système
const freePort = () => new Promise(resolve => {
    let probe = net.createServer();
    probe.once('error', () => resolve(0));
    probe.once('listening', () => probe.close(() => resolve(PREFERRED_PORT)));
    probe.listen(PREFERRED_PORT);
});

// 127.0.0.1 plutôt que localhost : évite un essai en IPv6 sur certains PC
const localUrl = (page) => `http://127.0.0.1:${port}/${page || ''}`;
const isGameUrl = (url) => {
    try {
        let u = new URL(url);
        return ['127.0.0.1', 'localhost'].includes(u.hostname) && String(u.port) === String(port);
    } catch (e) {
        return false;
    }
};

// Adresse du jeu sur le réseau local, pour ouvrir le panneau MJ sur un téléphone
const lanAddress = function () {
    for (let list of Object.values(os.networkInterfaces()))
        for (let a of list || [])
            if (a.family === 'IPv4' && !a.internal)
                return a.address;
    return null;
};

const createWindow = function (page, options) {
    let win = new BrowserWindow(Object.assign({
        width: 1600,
        height: 900,
        minWidth: 1024,
        minHeight: 600,
        backgroundColor: '#000000',
        title: 'LNOB',
        icon: path.join(__dirname, '../public/img/lnob-icon.ico'),
        autoHideMenuBar: true,
        webPreferences: {contextIsolation: true, sandbox: true}
    }, options || {}));

    // Les liens vers d'autres sites s'ouvrent dans le navigateur
    win.webContents.setWindowOpenHandler(({url}) => {
        if (isGameUrl(url))
            return {action: 'allow'};
        shell.openExternal(url);
        return {action: 'deny'};
    });
    win.webContents.on('will-navigate', (event, url) => {
        if (!isGameUrl(url)) {
            event.preventDefault();
            shell.openExternal(url);
        }
    });

    win.loadURL(localUrl(page));
    return win;
};

// Fenêtre avec l'adresse et le QR code du panneau MJ, comme dans le terminal
const showPhoneAccess = function () {
    let ip = lanAddress();
    let url = ip ? `http://${ip}:${port}/mj-menu` : null;
    let svg = '';
    if (url) {
        const QRCode = require('qrcode-terminal/vendor/QRCode');
        const QRErrorCorrectLevel = require('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel');
        let qr = new QRCode(-1, QRErrorCorrectLevel.L);
        qr.addData(url);
        qr.make();
        let n = qr.getModuleCount();
        let cells = '';
        for (let r = 0; r < n; r++)
            for (let c = 0; c < n; c++)
                if (qr.isDark(r, c))
                    cells += `<rect x="${c + 2}" y="${r + 2}" width="1" height="1"/>`;
        svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 4} ${n + 4}" width="280" height="280" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${cells}</g></svg>`;
    }
    let body = url
        ? `<p>Sur un téléphone connecté au même Wi-Fi, scanne ce code ou ouvre :</p><p class="url">${url}</p>${svg}`
        : `<p>Aucun réseau local trouvé : connecte ce PC au Wi-Fi pour ouvrir le panneau MJ sur un téléphone.</p>`;
    let html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Panneau MJ sur un téléphone</title>
<style>body{margin:0;padding:24px;background:#0b0e14;color:#e8e8e8;font:15px system-ui,sans-serif;text-align:center}
.url{font:600 16px ui-monospace,monospace;color:#ffcc00;user-select:all}svg{margin-top:8px;border-radius:8px}</style></head>
<body>${body}</body></html>`;

    let win = new BrowserWindow({
        width: 420,
        height: 500,
        resizable: false,
        parent: mainWindow,
        title: 'Panneau MJ sur un téléphone',
        autoHideMenuBar: true,
        backgroundColor: '#0b0e14',
        webPreferences: {contextIsolation: true, sandbox: true, javascript: false}
    });
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
};

const viewMenu = {
    label: 'Affichage',
    submenu: [
        {role: 'reload', label: 'Recharger'},
        {role: 'resetZoom', label: 'Taille normale'},
        {role: 'zoomIn', label: 'Agrandir'},
        {role: 'zoomOut', label: 'Réduire'},
        {type: 'separator'},
        {role: 'togglefullscreen', label: 'Plein écran'},
        {role: 'toggleDevTools', label: 'Outils de développement'}
    ]
};

const buildMenu = function () {
    let game = mode === 'host' ? [
        {label: 'Écran principal', accelerator: 'CmdOrCtrl+Shift+H', click: () => mainWindow && mainWindow.loadURL(localUrl())},
        {label: 'Panneau MJ', accelerator: 'CmdOrCtrl+M', click: () => createWindow('mj-menu', {width: 1280, height: 800})},
        {label: 'Partie en ligne', accelerator: 'CmdOrCtrl+L', click: () => createWindow('lobby', {width: 760, height: 820, minWidth: 480})},
        {label: 'Panneau MJ sur un téléphone…', click: showPhoneAccess},
        {type: 'separator'},
        {label: 'Dossier des données', click: () => shell.openPath(process.env.LNOB_DATA_DIR)},
        {type: 'separator'}
    ] : [];
    Menu.setApplicationMenu(Menu.buildFromTemplate([
        {label: 'Jeu', submenu: [...game, {role: 'quit', label: 'Quitter'}]},
        viewMenu
    ]));
};

// Fenêtre de départ : « Créer une partie (MJ) » ou « Rejoindre une partie »
const createLauncher = function () {
    let win = new BrowserWindow({
        width: 560,
        height: 520,
        resizable: false,
        title: 'LNOB',
        icon: path.join(__dirname, '../public/img/lnob-icon.ico'),
        autoHideMenuBar: true,
        backgroundColor: '#0b0c14',
        webPreferences: {contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.js')}
    });
    win.loadFile(path.join(__dirname, 'launcher.html'));
    return win;
};

// Mode MJ : serveur du jeu, écran principal et partie en ligne
const startHost = async function (launcher) {
    // Un seul MJ par PC : deux serveurs écriraient dans les mêmes bases
    if (!app.requestSingleInstanceLock())
        return {error: 'Une partie MJ est déjà ouverte sur ce PC.'};
    try {
        process.env.PORT = String(await freePort());
        let started = await require('../server').start();
        port = started.port;
    } catch (e) {
        app.releaseSingleInstanceLock();
        return {error: 'Le jeu n\'a pas pu démarrer : ' + (e && e.message || e)};
    }
    mode = 'host';
    buildMenu();
    require('../src/controllers/lobby').open();
    mainWindow = createWindow('');
    mainWindow.maximize();
    createWindow('lobby', {width: 760, height: 820, minWidth: 480});
    launcher.close();
    return {ok: true};
};

// Mode joueur : la page joueur, reliée au relais de la partie
const startJoin = function (launcher) {
    mode = 'join';
    buildMenu();
    let relay = require('../src/controllers/lobby').RELAY_URL;
    let win = new BrowserWindow({
        width: 900,
        height: 760,
        minWidth: 360,
        minHeight: 480,
        title: 'LNOB',
        icon: path.join(__dirname, '../public/img/lnob-icon.ico'),
        autoHideMenuBar: true,
        backgroundColor: '#0b0c14',
        webPreferences: {contextIsolation: true, sandbox: true}
    });
    // Les liens vers d'autres sites s'ouvrent dans le navigateur
    win.webContents.setWindowOpenHandler(({url}) => {
        shell.openExternal(url);
        return {action: 'deny'};
    });
    const page = path.join(__dirname, '../public/player/index.html');
    // Connexion Discord : faite dans la fenêtre (relais puis discord.com) ;
    // au retour, le relais passe par /auth/discord/done?profile=… et l'app
    // rouvre la page joueur avec ce profil
    const discordDone = function (event, url) {
        if (!url.startsWith(relay + '/auth/discord/done'))
            return false;
        event.preventDefault();
        let profile = new URL(url).searchParams.get('profile') || '';
        win.loadFile(page, {query: {relay: relay, discord: profile}});
        return true;
    };
    const discordFlow = (url) => url.startsWith(relay + '/auth/discord/') || /^https:\/\/(\w+\.)?discord(app)?\.com\//.test(url);
    win.webContents.on('will-redirect', discordDone);
    win.webContents.on('will-navigate', (event, url) => {
        if (discordDone(event, url))
            return;
        if (!url.startsWith('file:') && !discordFlow(url)) {
            event.preventDefault();
            shell.openExternal(url);
        }
    });
    win.loadFile(page, {query: {relay: relay}});
    mainWindow = win;
    launcher.close();
    return {ok: true};
};

ipcMain.handle('lnob:start', (event, choice) => {
    let launcher = BrowserWindow.fromWebContents(event.sender);
    if (mode || !launcher)
        return {error: 'Déjà lancé.'};
    return choice === 'host' ? startHost(launcher) : startJoin(launcher);
});

app.on('window-all-closed', () => app.quit());

app.whenReady().then(() => {
    buildMenu();
    createLauncher();
});
