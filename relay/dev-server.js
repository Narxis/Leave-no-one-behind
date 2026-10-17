// Relais LNOB en Node, pour jouer et tester sans Cloudflare (npm run relay).
// Même comportement que le relais Cloudflare (worker.js) : il sert la page
// joueur sur / et les connexions WebSocket sur /host, /host/CODE et /join/CODE.
const http = require('http');
const fs = require('fs');
const path = require('path');
const {WebSocketServer} = require('ws');
const {Lobby, EXPIRY_MS, newCode, normalizeCode} = require('./lobby-core');

const PLAYER_DIR = path.join(__dirname, '../public/player');
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'};

// Lobbies en mémoire, par code
const createStore = function (options) {
    const expiryMs = (options && options.expiryMs) || EXPIRY_MS;
    const lobbies = new Map();

    const get = function (code) {
        if (lobbies.has(code))
            return lobbies.get(code);
        let entry = {code: code, sockets: new Map(), token: null, timer: null};
        entry.lobby = new Lobby(code, {
            sockets: () => [...entry.sockets].filter(([ws]) => ws.readyState === ws.OPEN).map(([ws, meta]) => ({ws, meta})),
            metaOf: (ws) => entry.sockets.get(ws) || null,
            setMeta: (ws, meta) => {
                if (meta)
                    entry.sockets.set(ws, meta);
                else if (entry.sockets.has(ws))
                    entry.sockets.set(ws, null);
            },
            send: (ws, obj) => {
                if (ws.readyState === ws.OPEN)
                    ws.send(JSON.stringify(obj));
            },
            close: (ws, code, reason) => {
                try { ws.close(code, reason); } catch (e) { /* déjà fermé */ }
            },
            getToken: async () => entry.token,
            setToken: async (token) => { entry.token = token; },
            expireLater: async () => {
                clearTimeout(entry.timer);
                entry.timer = setTimeout(() => entry.lobby.expire(), expiryMs);
                if (entry.timer.unref)
                    entry.timer.unref();
            },
            cancelExpiry: async () => clearTimeout(entry.timer)
        });
        lobbies.set(code, entry);
        return entry;
    };

    // Branche un socket sur son lobby
    const attach = function (entry, ws) {
        entry.sockets.set(ws, null);
        ws.on('message', (data, isBinary) => entry.lobby.message(ws, isBinary ? data : data.toString()));
        ws.on('close', async () => {
            await entry.lobby.closed(ws);
            entry.sockets.delete(ws);
            // Lobby inconnu ou oublié, sans personne : rien à garder
            if (!entry.token && !entry.sockets.size && lobbies.get(entry.code) === entry)
                lobbies.delete(entry.code);
        });
    };

    const connect = async function (ws, url) {
        let parts = url.pathname.split('/').filter(Boolean);
        let q = url.searchParams;

        if (parts[0] === 'host' && parts.length === 1) {
            // Nouveau lobby : un code libre
            for (let i = 0; i < 10; i++) {
                let code = newCode();
                let entry = get(code);
                attach(entry, ws);
                if (await entry.lobby.hostConnect(ws, {isNew: true}))
                    return;
                entry.sockets.delete(ws);
                ws.removeAllListeners();
            }
            return ws.close(1011, 'no code');
        }

        let code = normalizeCode(parts[1]);
        let entry = code && (lobbies.has(code) ? lobbies.get(code) : null);
        if (parts[0] === 'host' && parts.length === 2) {
            entry = entry || get(code || 'XXXXXX');
            attach(entry, ws);
            return entry.lobby.hostConnect(ws, {isNew: false, token: q.get('token')});
        }
        if (parts[0] === 'join' && parts.length === 2) {
            entry = entry || get(code || 'XXXXXX');
            attach(entry, ws);
            return entry.lobby.playerConnect(ws, {id: q.get('id'), name: q.get('name'), protocol: q.get('v')});
        }
        ws.close(1008, 'unknown route');
    };

    return {connect, lobbies};
};

// Page joueur (fichiers de public/player)
const serveStatic = function (req, res) {
    let name = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (name === '/')
        name = '/index.html';
    let file = path.join(PLAYER_DIR, path.normalize(name));
    if (!file.startsWith(PLAYER_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
        return res.end('Introuvable');
    }
    res.writeHead(200, {'content-type': TYPES[path.extname(file)] || 'application/octet-stream'});
    fs.createReadStream(file).pipe(res);
};

const start = function (port, options) {
    const store = createStore(options);
    const server = http.createServer(serveStatic);
    const wss = new WebSocketServer({noServer: true, maxPayload: 256 * 1024});
    server.on('upgrade', (req, socket, head) => {
        wss.handleUpgrade(req, socket, head, ws => store.connect(ws, new URL(req.url, 'http://x')));
    });
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, () => resolve({server, store, port: server.address().port}));
    });
};

module.exports = {start};

if (require.main === module) {
    let port = parseInt(process.env.PORT) || 8787;
    start(port).then(() => console.log('Relais LNOB : http://127.0.0.1:' + port + '/'));
}
