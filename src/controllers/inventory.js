const combat = require('./combat');
const cardLoot = require('./cardLoot');

// Inventaires des joueurs : un objet appartient à un joueur quand son
// discord_id figure dans « owners » (liste séparée par des virgules). Un id
// peut y figurer plusieurs fois : le joueur a alors plusieurs exemplaires.
// L'inventaire du vaisseau, lui, est la quantité (« quantity ») de l'objet.

const ownersOf = (row) => row.owners ? String(row.owners).split(',').filter(Boolean) : [];

const slugify = (name) => 'custom-' + name.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const itemView = (row, count) => ({slug: row.slug, name: row.name, image: row.image || '', desc: row.desc || '', count: count});

// {discord_id: [{slug, name, image, desc, count}]}
const getInventories = async function () {
    let rows = await DB.tables.items.findAll({raw: true});
    let inventories = {};
    for (let row of rows) {
        let counts = {};
        for (let id of ownersOf(row))
            counts[id] = (counts[id] || 0) + 1;
        for (let id in counts)
            (inventories[id] = inventories[id] || []).push(itemView(row, counts[id]));
    }
    for (let id in inventories)
        inventories[id].sort((a, b) => a.name.localeCompare(b.name));
    return inventories;
}

const getInventory = async function (discord_id) {
    return (await getInventories())[discord_id] || [];
}

// Objets rangés dans le vaisseau
const getShip = async function () {
    let rows = await DB.tables.items.findAll({raw: true});
    return rows.filter(row => row.quantity > 0)
        .map(row => itemView(row, row.quantity))
        .sort((a, b) => a.name.localeCompare(b.name));
}

// Ligne de l'objet en base ; un butin saisi à la main par le MJ y est ajouté
const ensureItem = async function (item) {
    let name = String(item.name || '').trim().slice(0, 60);
    let slug = item.slug || (name && slugify(name));
    if (!slug)
        return null;
    let row = await DB.tables.items.findOne({raw: true, where: {slug: slug}});
    if (!row && name) {
        await DB.tables.items.create({owners: '', slug: slug, name: name, desc: '', pool: 'loot', race: '', quantity: 0, image: item.image || ''});
        row = await DB.tables.items.findOne({raw: true, where: {slug: slug}});
    }
    return row;
}

const setOwners = (row, owners) => DB.tables.items.update({owners: owners.join(',')}, {where: {id: row.id}});

const isPlayer = async (discord_id) => !!discord_id && !!(await DB.tables.players.findOne({raw: true, where: {discord_id: String(discord_id)}}));

// Déplace un exemplaire d'un objet. from / to : {type: 'player', id},
// {type: 'ship'} ou, en source seulement, {type: 'loot', index} (butin du
// combat gagné). Renvoie {error} ou {item, from, to, lootTaken}
const move = async function (data) {
    let from = data.from || {}, to = data.to || {};
    if (to.type === 'player' && !(await isPlayer(to.id)))
        return {error: 'Ce joueur n\'existe pas'};
    if (to.type !== 'player' && to.type !== 'ship')
        return {error: 'Destination inconnue'};
    if (from.type === to.type && String(from.id || '') === String(to.id || ''))
        return {error: 'L\'objet y est déjà'};

    // On vérifie et on retire d'abord la source : rien n'est créé si elle est vide
    let row, lootTaken = false, cardLootTaken = false;
    if (from.type === 'player') {
        row = await DB.tables.items.findOne({raw: true, where: {slug: String(data.slug || '')}});
        let owners = row ? ownersOf(row) : [];
        let at = owners.indexOf(String(from.id));
        if (at < 0)
            return {error: 'Cet objet n\'est pas dans l\'inventaire'};
        owners.splice(at, 1);
        await setOwners(row, owners);
        row.owners = owners.join(',');
    }
    else if (from.type === 'ship') {
        row = await DB.tables.items.findOne({raw: true, where: {slug: String(data.slug || '')}});
        if (!row || row.quantity <= 0)
            return {error: 'Cet objet n\'est plus dans le vaisseau'};
        await DB.tables.items.decrement({quantity: 1}, {where: {id: row.id}});
    }
    else if (from.type === 'loot') {
        let loot = combat.takeLoot(from.index, data.slug, data.name);
        if (!loot)
            return {error: 'Ce butin n\'est plus disponible'};
        row = await ensureItem(loot);
        lootTaken = true;
        if (!row)
            return {error: 'Objet inconnu'};
    }
    else if (from.type === 'card-loot') {
        let loot = cardLoot.take(from.index, data.slug, data.name);
        if (!loot)
            return {error: 'Ce butin n\'est plus disponible'};
        row = await ensureItem(loot);
        cardLootTaken = true;
        if (!row)
            return {error: 'Objet inconnu'};
    }
    else
        return {error: 'Origine inconnue'};

    if (to.type === 'player') {
        let fresh = await DB.tables.items.findOne({raw: true, where: {id: row.id}});
        await setOwners(fresh, ownersOf(fresh).concat(String(to.id)));
    }
    else
        await DB.tables.items.increment({quantity: 1}, {where: {id: row.id}});

    return {item: itemView(row, 1), from: from, to: to, lootTaken: lootTaken, cardLootTaken: cardLootTaken};
}

// « Tout récupérer » : tout le butin de la carte va dans le vaisseau
const takeAllCardLoot = async function () {
    let items = cardLoot.takeAll();
    for (let item of items) {
        let row = await ensureItem(item);
        if (row)
            await DB.tables.items.increment({quantity: 1}, {where: {id: row.id}});
    }
    return {cardLootTaken: true, toShip: items.length};
}

// Message websocket : inventaires à jour (+ l'état du combat si le butin a changé)
const payload = async function (event) {
    let messages = [{
        action: 'inventory',
        error: false,
        data: {inventories: await getInventories(), ship: await getShip(), event: event || null}
    }];
    if (event && event.lootTaken)
        messages.push({action: 'combat', error: false, data: {state: combat.getState(), event: {type: 'loot-taken'}}});
    if (event && event.cardLootTaken)
        messages.push(cardLoot.message({type: event.toShip ? 'all-taken' : 'taken', count: event.toShip || 1}));
    return messages;
}

// Point d'entrée des actions websocket « inventory-* »
const handle = async function (response) {
    if (response.action === 'inventory-move') {
        let result = await move(response.data || {});
        if (result.error)
            return {action: 'inventory-error', error: false, data: {message: result.error}};
        return payload(result);
    }
    if (response.action === 'card-loot-all')
        return payload(await takeAllCardLoot());
    // inventory-sync : le bot Discord a déjà déplacé l'objet, on diffuse
    return payload((response.data && response.data.event) || null);
}

module.exports = {getInventories, getInventory, getShip, move, handle, payload};
