// Objets utilisés par les joueurs en ligne.
//
// Un joueur demande à utiliser un objet de son inventaire ; la demande
// s'affiche chez le MJ (page de jeu, planète, menu MJ), qui accepte ou
// refuse. Accepté : l'objet est retiré de l'inventaire et le salon du chat
// l'annonce ; l'effet, lui, reste appliqué par le MJ comme avant.
//
// Joueur → MJ : action « item-use » {slug}
// Pages du MJ : {action: 'item-use', data: {requests}}  demandes en attente
//               action « item-use-answer » {id, ok}       réponse du MJ
// MJ → joueur : {kind: 'notice', text}
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

// Demande d'un joueur. Renvoie {payload} pour les pages du MJ, ou {error}
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

// Réponse du MJ : messages pour ses pages (demandes, inventaires)
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
