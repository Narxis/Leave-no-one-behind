// Items used by online players.
//
// A player asks to use an item from their inventory; the request
// shows on the GM side (game page, planet, GM menu), who accepts or
// refuses. Accepted: the item is removed from the inventory and the chat room
// announces it; the effect itself is still applied by the GM as before.
//
// Player → GM: "item-use" action {slug}
// GM pages: {action: 'item-use', data: {requests}}  pending requests
//               "item-use-answer" action {id, ok}       GM's answer
// GM → player: {kind: 'notice', text}
const {Items} = require('../models/items');
const lobby = require('./lobby');
const inventory = require('./inventory');
const chat = require('./chat');

const MAX_PENDING = 20;
const requests = new Map(); // id → {id, playerId, playerName, slug, itemName}
let count = 0;

const payload = () => ({
    action: 'item-use',
    error: false,
    data: {requests: Array.from(requests.values())}
});

// A player's request. Returns {payload} for the GM pages, or {error}
const request = async function (player, name, slug) {
    slug = String(slug || '');
    let item = (await inventory.getInventory(player.id)).find(i => i.slug === slug);
    if (!item)
        return {error: 'Cet objet n\'est pas dans ton inventaire.'};
    for (let r of requests.values())
        if (r.playerId === player.id && r.slug === slug)
            return {error: 'Demande déjà envoyée au MJ.'};
    if (requests.size >= MAX_PENDING)
        return {error: 'Le MJ a déjà trop de demandes en attente.'};
    let id = String(++count);
    requests.set(id, {id, playerId: player.id, playerName: String(name || player.name || ''), slug, itemName: item.name});
    return {payload: payload()};
};

// GM's answer: messages for their pages (requests, inventories)
const answer = async function (data) {
    data = data || {};
    let req = requests.get(String(data.id));
    if (!req)
        return payload();
    requests.delete(req.id);
    if (!data.ok) {
        lobby.sendTo(req.playerId, {kind: 'notice', text: 'Le MJ a refusé : tu n\'utilises pas ' + req.itemName + '.'});
        return payload();
    }
    let still = (await inventory.getInventory(req.playerId)).some(i => i.slug === req.slug);
    if (!still) {
        lobby.sendTo(req.playerId, {kind: 'notice', text: req.itemName + ' n\'est plus dans ton inventaire.'});
        return payload();
    }
    await new Items().removeItemFromPlayer(req.slug, req.playerId);
    lobby.sendTo(req.playerId, {kind: 'notice', text: 'Le MJ a accepté : tu utilises ' + req.itemName + '.'});
    chat.fromGm({text: req.playerName + ' utilise ' + req.itemName + '.'});
    return [payload(), await inventory.payload(null)];
};

const pendingFor = (playerId) => Array.from(requests.values()).filter(r => r.playerId === playerId).map(r => r.slug);

const clear = function () {
    requests.clear();
};

module.exports = {request, answer, payload, pendingFor, clear};
