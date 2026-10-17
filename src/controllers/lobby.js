// Lobby de la partie, côté MJ : le serveur du jeu se connecte au relais
// (relay/), obtient un code de partie et suit les joueurs qui le rejoignent.
// Les pages du MJ reçoivent l'état par le WebSocket du jeu (action « lobby »).
// Gardé en mémoire : un redémarrage du serveur ouvre une nouvelle partie.
const WebSocket = require('ws');
const pkg = require('../../package.json');

// Relais : LNOB_RELAY_URL, sinon celui de package.json (lnob.relayUrl),
// sinon le relais local de développement (npm run relay)
const RELAY_URL = String(process.env.LNOB_RELAY_URL || (pkg.lnob && pkg.lnob.relayUrl) || 'http://127.0.0.1:8787').replace(/\/+$/, '');

let socket = null;
let wantOpen = false;
let retryDelay = 1000;
let retryTimer = null;
let state;

const reset = function () {
    state = {status: 'closed', code: null, token: null, error: null, players: new Map()};
};
reset();

// Écouteurs des messages des joueurs (étapes suivantes : jeu, chat…)
const listeners = [];
const onPlayerMessage = (fn) => listeners.push(fn);

const formatCode = (code) => code ? code.slice(0, 3) + '-' + code.slice(3) : null;

const getState = function () {
    return {
        status: state.status,
        code: formatCode(state.code),
        link: state.code ? RELAY_URL + '/?code=' + state.code : null,
        relay: RELAY_URL,
        error: state.error,
        players: [...state.players.values()]
    };
};

const message = () => ({action: 'lobby', error: false, data: getState()});

// Vers les pages du MJ (même format qu'une réponse du WebSocket du jeu)
const broadcast = function () {
    if (!global.WSS)
        return;
    let payload = JSON.stringify(message());
    WSS.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN)
            client.send(payload);
    });
};

const relaySend = function (obj) {
    if (socket && socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify(obj));
};

// Vers les joueurs : un seul (id) ou tous ('*')
const sendTo = (to, data) => relaySend({type: 'send', to: to, data: data});

// Liste de l'équipage, affichée sur l'écran d'attente des joueurs
const sendRoster = () => sendTo('*', {kind: 'roster', players: [...state.players.values()]});

const changed = function () {
    broadcast();
    sendRoster();
};

const onRelayMessage = function (raw) {
    let msg;
    try {
        msg = JSON.parse(raw.toString());
    } catch (e) {
        return;
    }
    if (msg.type === 'ready') {
        retryDelay = 1000;
        state.code = msg.code;
        state.token = msg.token;
        state.status = 'open';
        state.error = null;
        // Retour après une coupure : ceux qui sont encore là repassent en ligne
        for (let p of state.players.values())
            p.online = false;
        for (let p of msg.players)
            state.players.set(p.id, {id: p.id, name: p.name, online: true});
        log('[LOBBY] Partie ouverte : ' + formatCode(msg.code), '#4fd8e0');
        changed();
    }
    else if (msg.type === 'join') {
        state.players.set(msg.player.id, {id: msg.player.id, name: msg.player.name, online: true});
        log('[LOBBY] ' + msg.player.name + ' a rejoint la partie', '#4fd8e0');
        changed();
    }
    else if (msg.type === 'leave') {
        let p = state.players.get(msg.id);
        if (p)
            p.online = false;
        changed();
    }
    else if (msg.type === 'msg') {
        let player = state.players.get(msg.from);
        for (let fn of listeners) {
            try {
                fn(player || {id: msg.from}, msg.data);
            } catch (e) {
                log('[LOBBY] ' + e);
            }
        }
    }
    else if (msg.type === 'error') {
        // Partie oubliée par le relais (MJ absent trop longtemps) : on en ouvre une nouvelle
        state.error = msg.message;
        if (msg.code === 'unknown' || msg.code === 'token') {
            state.code = null;
            state.token = null;
            state.players.clear();
        }
    }
};

const connect = function () {
    clearTimeout(retryTimer);
    let base = RELAY_URL.replace(/^http/, 'ws');
    let url = state.code && state.token
        ? base + '/host/' + state.code + '?token=' + encodeURIComponent(state.token)
        : base + '/host';
    let ws = new WebSocket(url, {handshakeTimeout: 10000});
    socket = ws;
    state.status = state.code ? 'reconnecting' : 'connecting';
    broadcast();

    ws.on('message', onRelayMessage);
    ws.on('error', (e) => {
        if (!state.code)
            state.error = 'Relais injoignable (' + RELAY_URL + ').';
    });
    ws.on('close', () => {
        if (socket !== ws)
            return;
        socket = null;
        if (!wantOpen) {
            reset();
            broadcast();
            return;
        }
        // Coupure : on retente avec le même code, de plus en plus espacé
        state.status = state.code ? 'reconnecting' : 'error';
        for (let p of state.players.values())
            p.online = false;
        broadcast();
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30000);
    });
};

const open = function () {
    wantOpen = true;
    if (!socket)
        connect();
    return message();
};

const close = function () {
    wantOpen = false;
    clearTimeout(retryTimer);
    relaySend({type: 'close'});
    let ws = socket;
    socket = null;
    if (ws)
        setTimeout(() => ws.terminate(), 1000);
    reset();
    broadcast();
    return message();
};

const kick = function (id) {
    relaySend({type: 'kick', id: String(id)});
    state.players.delete(String(id));
    changed();
    return message();
};

// Actions envoyées par les pages du MJ
const handle = function (response) {
    switch (response.action) {
        case 'lobby-open':
            return open();
        case 'lobby-close':
            return close();
        case 'lobby-kick':
            return kick(response.data && response.data.id);
        default:
            return message();
    }
};

module.exports = {RELAY_URL, open, close, kick, handle, getState, sendTo, onPlayerMessage};
