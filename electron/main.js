// App de bureau LNOB : lance le serveur du jeu dans l'app et l'affiche dans
// une fenêtre, sans navigateur ni terminal.
const {app, BrowserWindow, Menu, dialog, shell} = require('electron');
const net = require('net');
const os = require('os');
const path = require('path');

// Une seule app ouverte à la fois : deux serveurs écriraient dans les mêmes bases
const hasLock = app.requestSingleInstanceLock();
if (!hasLock)
    app.quit();

// Ce que le jeu écrit (bases, storage/cache, images des races customs) va dans
// le dossier de données de l'utilisateur : le dossier de l'app est en lecture seule
process.env.LNOB_DATA_DIR = process.env.LNOB_DATA_DIR || app.getPath('userData');
// Le bot Discord n'est plus utilisé : son code reste dans le dépôt
process.env.DISABLE_BOT = 'true';

const PREFERRED_PORT = parseInt(process.env.PORT) || 8080;
let port = null;
let mainWindow = null;

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

const buildMenu = function () {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
        {
            label: 'Jeu',
            submenu: [
                {label: 'Écran principal', accelerator: 'CmdOrCtrl+Shift+H', click: () => mainWindow && mainWindow.loadURL(localUrl())},
                {label: 'Panneau MJ', accelerator: 'CmdOrCtrl+M', click: () => createWindow('mj-menu', {width: 1280, height: 800})},
                {label: 'Panneau MJ sur un téléphone…', click: showPhoneAccess},
                {type: 'separator'},
                {label: 'Dossier des données', click: () => shell.openPath(process.env.LNOB_DATA_DIR)},
                {type: 'separator'},
                {role: 'togglefullscreen', label: 'Plein écran'},
                {role: 'quit', label: 'Quitter'}
            ]
        },
        {
            label: 'Affichage',
            submenu: [
                {role: 'reload', label: 'Recharger'},
                {role: 'resetZoom', label: 'Taille normale'},
                {role: 'zoomIn', label: 'Agrandir'},
                {role: 'zoomOut', label: 'Réduire'},
                {type: 'separator'},
                {role: 'toggleDevTools', label: 'Outils de développement'}
            ]
        }
    ]));
};

app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized())
            mainWindow.restore();
        mainWindow.focus();
    }
});

app.on('window-all-closed', () => app.quit());

app.whenReady().then(async () => {
    if (!hasLock)
        return;
    try {
        process.env.PORT = String(await freePort());
        let started = await require('../server').start();
        port = started.port;
    } catch (e) {
        dialog.showErrorBox('LNOB', 'Le jeu n\'a pas pu démarrer :\n\n' + (e && e.stack || e));
        app.quit();
        return;
    }
    buildMenu();
    mainWindow = createWindow('');
    mainWindow.maximize();
});
