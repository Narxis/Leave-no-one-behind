// Written chat of the online game: a common room, and a private
// conversation between the GM and each player.
//
// A message: {id, at, from: {id, name, gm}, to, text}
//   to = null       common room (everyone sees it)
//   to = player id  private between the GM and that player
// The history stays in memory during the game: a returning player
// finds the room and their private conversation again. A new game (characters
// page opened from another page) clears it.
//
// GM pages (local WebSocket): {action:'chat', data:{message}} and
//   {action:'chat-history', data:{messages}}
// Players (relay): {kind:'chat', message} and {kind:'chat-history', messages}
const lobby = require('./lobby');
const dice = require('./dice');

const MAX_HISTORY = 300;
const MAX_TEXT = 500;
// Anti-flood: at most 6 messages per player every 10 seconds
const RATE_COUNT = 6;
const RATE_MS = 10000;

let history = [];
let nextId = 1;
const recent = new Map(); // player id → dates of their last messages

const cleanText = (value) => String(value || '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEXT);

// What a player is allowed to see
const visibleTo = (playerId) => (m) => m.to === null || m.to === playerId;

const historyFor = (playerId) => history.filter(visibleTo(playerId));

// Broadcasting a new message: to the players concerned and to the GM pages
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
    // Dice window roll (dice.js): set by the server only
    if (dice)
        message.dice = dice;
    history.push(message);
    if (history.length > MAX_HISTORY)
        history = history.slice(-MAX_HISTORY);
    deliver(message);
    return message;
};

// A player's anti-flood: false if they write (or roll) too fast
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

// A player's message. privateToGm: only the GM reads it. Returns {error} or {message}
const fromPlayer = function (player, displayName, data) {
    let text = cleanText(data && data.text);
    if (!text)
        return {error: 'Message vide.'};
    if (!allowed(player.id))
        return {error: TOO_FAST};
    let from = {id: player.id, name: displayName || player.name, gm: false};
    return {message: add(from, data && data.private ? player.id : null, text)};
};

// A player's neutral dice roll (dice.js), in the room or to the GM only (secret)
const playerDice = function (player, displayName, result, secret) {
    if (!allowed(player.id))
        return {error: 'Doucement : attends quelques secondes avant de relancer.'};
    let from = {id: player.id, name: displayName || player.name, gm: false};
    return {message: add(from, secret ? player.id : null, dice.text(result), dice.detail(result))};
};

// GM roll shown to the whole room
const gmDice = (result) => add({id: 'gm', name: 'MJ', gm: true}, null, dice.text(result), dice.detail(result));

// GM message, in the room (empty to) or to a player
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

// Actions from the GM pages (ws.js)
const handle = function (response) {
    if (response.action === 'chat-send') {
        fromGm(response.data);
        return null; // already broadcast
    }
    // chat-history: the GM page that opens asks for the whole history
    return {action: 'chat-history', error: false, data: {messages: history}};
};

// broadcast(message) sends to the GM pages; when a player arrives, they
// receive the history they are allowed to see
const init = function (broadcast) {
    toGm = broadcast;
    lobby.onPlayerJoin(player => lobby.sendTo(player.id, {kind: 'chat-history', messages: historyFor(player.id)}));
};

module.exports = {init, handle, fromPlayer, fromGm, playerDice, gmDice, historyFor, clear, MAX_TEXT};
