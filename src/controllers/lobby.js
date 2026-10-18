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

// Écouteurs des messages et des arrivées des joueurs (remote.js)
const listeners = [];
const onPlayerMessage = (fn) => listeners.push(fn);
const joinListeners = [];
const onPlayerJoin = (fn) => joinListeners.push(fn);

const notifyJoin = function (player) {
    for (let fn of joinListeners) {
        try {
            fn(player);
        } catch (e) {
            log('[LOBBY] ' + e);
        }
    }
};

// Compte Discord vérifié par le relais : seulement l'id, le pseudo et l'URL
// de l'avatar (cdn de Discord), sinon null
const cleanDiscord = function (d) {
    if (!d || typeof d !== 'object' || !/^\d{5,25}$/.test(String(d.id)) || !/^https:\/\/cdn\.discordapp\.com\/[\w./?=-]+$/.test(String(d.avatar)))
        return null;
    return {id: String(d.id), name: String(d.name || '').slice(0, 32), avatar: String(d.avatar)};
};

// Un joueur arrive ou revient : on garde le nom de son perso, s'il en a un
const addPlayer = function (p) {
    let known = state.players.get(p.id);
    let player = {id: p.id, name: p.name, online: true, character: known ? known.character : null, discord: cleanDiscord(p.discord)};
    state.players.set(p.id, player);
    return player;
};

const formatCode = (code) => code ? code.slice(0, 3) + '-' + code.slice(3) : null;

// Étape de la partie (creation, gameLive, postGame…) : le lobby propose de la lancer ou de la reprendre
const phase = () => (global.CONFIG && CONFIG.gameState) || null;
let lastPhase = null;

const getState = function () {
    return {
        status: state.status,
        code: formatCode(state.code),
        link: state.code ? RELAY_URL + '/?code=' + state.code : null,
        relay: RELAY_URL,
        error: state.error,
        players: [...state.players.values()],
        phase: phase()
    };
};

const message = () => ({action: 'lobby', error: false, data: getState()});

// Vers les pages du MJ (même format qu'une réponse du WebSocket du jeu)
const broadcast = function () {
    if (!global.WSS)
        return;
    lastPhase = phase();
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

// La partie a changé d'étape : les pages du MJ mettent à jour le bouton de lancement
const phaseChanged = function () {
    if (phase() !== lastPhase)
        broadcast();
};

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
        let back = msg.players.map(addPlayer);
        log('[LOBBY] Partie ouverte : ' + formatCode(msg.code), '#4fd8e0');
        changed();
        back.forEach(notifyJoin);
    }
    else if (msg.type === 'join') {
        let player = addPlayer(msg.player);
        log('[LOBBY] ' + msg.player.name + ' a rejoint la partie', '#4fd8e0');
        changed();
        notifyJoin(player);
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

// Nom du perso lié à ce joueur (null s'il n'en a pas encore)
const setCharacter = function (id, name) {
    let p = state.players.get(String(id));
    if (!p || p.character === name)
        return;
    p.character = name;
    changed();
};

// Compte Discord d'un joueur (écrans du MJ), null s'il ne s'est pas connecté avec
const discordOf = function (id) {
    let p = state.players.get(String(id));
    return p ? p.discord : null;
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

module.exports = {RELAY_URL, open, close, kick, handle, getState, sendTo, setCharacter, discordOf, phaseChanged, onPlayerMessage, onPlayerJoin, onRelayMessage};
