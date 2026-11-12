// LNOB desktop app. On opening, you pick your mode:
// - GM: the app starts the game server, shows it and opens the online game
//   (code to give to the players);
// - player: the app opens the player page, which joins the game through the relay.
const {app, BrowserWindow, Menu, dialog, ipcMain, shell} = require('electron');
const net = require('net');
const os = require('os');
const path = require('path');

// What the game writes (databases, storage/cache, custom race images) goes into
// the user's data folder: the app folder is read-only
process.env.LNOB_DATA_DIR = process.env.LNOB_DATA_DIR || app.getPath('userData');
// The Discord bot is no longer used: its code stays in the repo
process.env.DISABLE_BOT = 'true';

const PREFERRED_PORT = parseInt(process.env.PORT) || 8080;
let port = null;
let mainWindow = null;
let mode = null; // 'host' or 'join'

// The usual port if it is free (the GM panel on a phone keeps the same
// address from one game to the next), otherwise a port chosen by the system
const freePort = () => new Promise(resolve => {
    let probe = net.createServer();
    probe.once('error', () => resolve(0));
    probe.once('listening', () => probe.close(() => resolve(PREFERRED_PORT)));
    probe.listen(PREFERRED_PORT);
});

// 127.0.0.1 rather than localhost: avoids an IPv6 attempt on some PCs
const localUrl = (page) => `http://127.0.0.1:${port}/${page || ''}`;
const isGameUrl = (url) => {
    try {
        let u = new URL(url);
        return ['127.0.0.1', 'localhost'].includes(u.hostname) && String(u.port) === String(port);
    } catch (e) {
        return false;
    }
};

// Game address on the local network, to open the GM panel on a phone
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

    // Links to other sites open in the browser
    win.webContents.setWindowOpenHandler(({url, frameName}) => {
        // Lobby buttons ("Lancer la partie"…): the page opens in the
        // main game window, recreated if the GM closed it
        if (frameName === 'lnob-game' && isGameUrl(url)) {
            let page = new URL(url).pathname.replace(/^\/+/, '');
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.loadURL(localUrl(page));
                if (mainWindow.isMinimized())
                    mainWindow.restore();
                mainWindow.focus();
            } else {
                mainWindow = createWindow(page);
                mainWindow.maximize();
            }
            return {action: 'deny'};
        }
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

// Window with the address and QR code of the GM panel, as in the terminal
const showPhoneAccess = function () {
    let ip = lanAddress();
    // Link with the GM key: other devices on the network don't get the GM pages
    let url = ip ? require('../src/controllers/mjAccess').mjUrl(`http://${ip}:${port}`, 'mj-menu') : null;
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

// Start window: "Créer une partie (MJ)" or "Rejoindre une partie"
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

// GM mode: game server, main screen and online game
const startHost = async function (launcher) {
    // Only one GM per PC: two servers would write to the same databases
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

// Player mode: the player page, connected to the game relay
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
    // Links to other sites open in the browser
    win.webContents.setWindowOpenHandler(({url}) => {
        shell.openExternal(url);
        return {action: 'deny'};
    });
    const page = path.join(__dirname, '../public/player/index.html');
    // Discord login: done in the window (relay then discord.com);
    // on return, the relay goes through /auth/discord/done?profile=… and the app
    // reopens the player page with this profile
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
