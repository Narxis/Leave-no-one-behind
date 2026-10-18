// Chat écrit de la partie en ligne : un salon commun, et une conversation
// privée entre le MJ et chaque joueur.
//
// Un message : {id, at, from: {id, name, gm}, to, text}
//   to = null       salon commun (tout le monde le voit)
//   to = id joueur  privé entre le MJ et ce joueur
// L'historique reste en mémoire pendant la partie : un joueur qui revient
// retrouve le salon et sa conversation privée. Une nouvelle partie (page des
// persos ouverte depuis une autre page) le vide.
//
// Pages du MJ (WebSocket local) : {action:'chat', data:{message}} et
//   {action:'chat-history', data:{messages}}
// Joueurs (relais) : {kind:'chat', message} et {kind:'chat-history', messages}
const lobby = require('./lobby');
const dice = require('./dice');

const MAX_HISTORY = 300;
const MAX_TEXT = 500;
// Anti-flood : au plus 6 messages par joueur toutes les 10 secondes
const RATE_COUNT = 6;
const RATE_MS = 10000;

let history = [];
let nextId = 1;
const recent = new Map(); // id joueur → dates de ses derniers messages

const cleanText = (value) => String(value || '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEXT);

// Ce qu'un joueur a le droit de voir
const visibleTo = (playerId) => (m) => m.to === null || m.to === playerId;

const historyFor = (playerId) => history.filter(visibleTo(playerId));

// Diffusion d'un nouveau message : aux joueurs concernés et aux pages du MJ
let toGm = () => {};
const deliver = function (message) {
    if (message.to === null)
        lobby.sendTo('*', {kind: 'chat', message: message});
    else
        lobby.sendTo(message.to, {kind: 'chat', message: message});
    toGm({action: 'chat', error: false, data: {message: message}});
};

const add = function (from, to, text, dice) {
    let message = {id: nextId++, at: Date.now(), from: from, to: to || null, text: text};
    // Jet de la fenêtre de dés (dice.js) : posé par le serveur seulement
    if (dice)
        message.dice = dice;
    history.push(message);
    if (history.length > MAX_HISTORY)
        history = history.slice(-MAX_HISTORY);
    deliver(message);
    return message;
};

// Anti-flood d'un joueur : false s'il écrit (ou lance) trop vite
const allowed = function (playerId) {
    let now = Date.now();
    let times = (recent.get(playerId) || []).filter(t => now - t < RATE_MS);
    if (times.length >= RATE_COUNT)
        return false;
    times.push(now);
    recent.set(playerId, times);
    return true;
};
const TOO_FAST = 'Doucement : attends quelques secondes avant d\'écrire à nouveau.';

// Message d'un joueur. privateToGm : seul le MJ le lit. Renvoie {error} ou {message}
const fromPlayer = function (player, displayName, data) {
    let text = cleanText(data && data.text);
    if (!text)
        return {error: 'Message vide.'};
    if (!allowed(player.id))
        return {error: TOO_FAST};
    let from = {id: player.id, name: displayName || player.name, gm: false};
    return {message: add(from, data && data.private ? player.id : null, text)};
};

// Jet de dés neutres d'un joueur (dice.js), au salon ou au MJ seul (secret)
const playerDice = function (player, displayName, result, secret) {
    if (!allowed(player.id))
        return {error: 'Doucement : attends quelques secondes avant de relancer.'};
    let from = {id: player.id, name: displayName || player.name, gm: false};
    return {message: add(from, secret ? player.id : null, dice.text(result), dice.detail(result))};
};

// Jet du MJ montré à tout le salon
const gmDice = (result) => add({id: 'gm', name: 'MJ', gm: true}, null, dice.text(result), dice.detail(result));

// Message du MJ, dans le salon (to vide) ou à un joueur
const fromGm = function (data) {
    let text = cleanText(data && data.text);
    if (!text)
        return null;
    let to = data && data.to ? String(data.to) : null;
    return add({id: 'gm', name: 'MJ', gm: true}, to, text);
};

const clear = function () {
    history = [];
    recent.clear();
    toGm({action: 'chat-history', error: false, data: {messages: []}});
    lobby.sendTo('*', {kind: 'chat-history', messages: []});
};

// Actions des pages du MJ (ws.js)
const handle = function (response) {
    if (response.action === 'chat-send') {
        fromGm(response.data);
        return null; // déjà diffusé
    }
    // chat-history : la page du MJ qui s'ouvre demande tout l'historique
    return {action: 'chat-history', error: false, data: {messages: history}};
};

// broadcast(message) envoie aux pages du MJ ; à l'arrivée d'un joueur, il
// reçoit l'historique qu'il a le droit de voir
const init = function (broadcast) {
    toGm = broadcast;
    lobby.onPlayerJoin(player => lobby.sendTo(player.id, {kind: 'chat-history', messages: historyFor(player.id)}));
};

module.exports = {init, handle, fromPlayer, fromGm, playerDice, gmDice, historyFor, clear, MAX_TEXT};
