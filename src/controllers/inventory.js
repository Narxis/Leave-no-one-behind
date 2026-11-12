const combat = require('./combat');
const cardLoot = require('./cardLoot');
const loot = require('./loot');
const money = require('./money');
const itemRequests = require('./itemRequests');

// Players' inventories: an item belongs to a player when their
// discord_id is in "owners" (comma-separated list). An id
// can appear several times: the player then has several copies.
// The ship's inventory, on the other hand, is the item's "quantity".
// Currency isn't an item: it goes into purses (money.js).

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

// Items stored in the ship
const getShip = async function () {
    let rows = await DB.tables.items.findAll({raw: true});
    return rows.filter(row => row.quantity > 0)
        .map(row => itemView(row, row.quantity))
        .sort((a, b) => a.name.localeCompare(b.name));
}

// Item row in the database; loot typed by hand by the GM is added to it
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

// Adds count copies to a player or the ship
const giveTo = async function (row, to, count) {
    if (to.type === 'player') {
        let fresh = await DB.tables.items.findOne({raw: true, where: {id: row.id}});
        await setOwners(fresh, ownersOf(fresh).concat(Array(count).fill(String(to.id))));
    }
    else
        await DB.tables.items.increment({quantity: count}, {where: {id: row.id}});
}

// Removes up to count copies of an item from a player or the ship.
// Returns {row, count} (copies actually removed) or {error}
const takeFrom = async function (slug, from, count) {
    let row = await DB.tables.items.findOne({raw: true, where: {slug: String(slug || '')}});
    if (from.type === 'player') {
        let owners = row ? ownersOf(row) : [];
        let mine = owners.filter(id => id === String(from.id)).length;
        if (!mine)
            return {error: 'Cet objet n\'est pas dans l\'inventaire'};
        count = Math.min(count, mine);
        for (let i = 0; i < count; i++)
            owners.splice(owners.indexOf(String(from.id)), 1);
        await setOwners(row, owners);
        row.owners = owners.join(',');
        return {row: row, count: count};
    }
    if (from.type === 'ship') {
        if (!row || row.quantity <= 0)
            return {error: 'Cet objet n\'est plus dans le vaisseau'};
        count = Math.min(count, row.quantity);
        await DB.tables.items.decrement({quantity: count}, {where: {id: row.id}});
        return {row: row, count: count};
    }
    return {error: 'Origine inconnue'};
}

// Number of copies of an item for a player or in the ship
const countOf = async function (slug, owner) {
    let row = await DB.tables.items.findOne({raw: true, where: {slug: String(slug || '')}});
    if (!row)
        return 0;
    if (owner.type === 'ship')
        return Math.max(row.quantity || 0, 0);
    return ownersOf(row).filter(id => id === String(owner.id)).length;
}

// Moves copies of an item. from / to: {type: 'player', id},
// {type: 'ship'} or, as source only, {type: 'loot', index} (loot of the
// won combat) and {type: 'card-loot', index} (loot of a card).
// A loot entry goes whole (its full quantity); from an inventory,
// count copies are moved (1 by default, all: every one). Currency from a
// loot goes to the player's purse or the ship's cash box.
// Returns {error} or {item, from, to, lootTaken}
const move = async function (data) {
    let from = data.from || {}, to = data.to || {};
    if (to.type === 'player' && !(await isPlayer(to.id)))
        return {error: 'Ce joueur n\'existe pas'};
    if (to.type !== 'player' && to.type !== 'ship')
        return {error: 'Destination inconnue'};
    if (from.type === to.type && String(from.id || '') === String(to.id || ''))
        return {error: 'L\'objet y est déjà'};

    // The source is checked and removed first: nothing is created if it is empty
    let row, count = data.all ? loot.MAX_QTY : loot.qtyOf(data.count), lootTaken = false, cardLootTaken = false;
    if (from.type === 'player' || from.type === 'ship') {
        let taken = await takeFrom(data.slug, from, count);
        if (taken.error)
            return taken;
        row = taken.row;
        count = taken.count;
    }
    else if (from.type === 'loot' || from.type === 'card-loot') {
        let taken = from.type === 'loot' ? combat.takeLoot(from.index, data.slug, data.name) : cardLoot.take(from.index, data.slug, data.name);
        if (!taken)
            return {error: 'Ce butin n\'est plus disponible'};
        lootTaken = from.type === 'loot';
        cardLootTaken = from.type === 'card-loot';
        count = loot.qtyOf(taken.qty);
        if (taken.money) {
            await money.add(to, count);
            return {item: {slug: money.SLUG, name: money.label(count), image: money.IMAGE, desc: '', count: count, money: true},
                from: from, to: to, lootTaken: lootTaken, cardLootTaken: cardLootTaken};
        }
        row = await ensureItem(taken);
        if (!row)
            return {error: 'Objet inconnu'};
    }
    else
        return {error: 'Origine inconnue'};

    await giveTo(row, to, count);
    return {item: itemView(row, count), from: from, to: to, lootTaken: lootTaken, cardLootTaken: cardLootTaken};
}

// "Tout récupérer": all the card loot goes into the ship (the
// currency into the cash box)
const takeAllCardLoot = async function () {
    let items = cardLoot.takeAll();
    for (let item of items) {
        if (item.money) {
            await money.add({type: 'ship'}, loot.qtyOf(item.qty));
            continue;
        }
        let row = await ensureItem(item);
        if (row)
            await giveTo(row, {type: 'ship'}, loot.qtyOf(item.qty));
    }
    return {cardLootTaken: true, toShip: items.length};
}

// Websocket message: updated inventories (+ the combat state if the loot changed)
const payload = async function (event) {
    let inventories = await getInventories();
    let ship = await getShip();
    let messages = [{
        action: 'inventory',
        error: false,
        data: {inventories: inventories, ship: ship, wallets: await money.wallets(), currency: money.publicConfig(), event: event || null}
    }];
    // Item gone (given, used, discarded): its pending requests drop
    if (itemRequests.prune(inventories, ship))
        messages.push(itemRequests.payload());
    if (event && event.lootTaken)
        messages.push({action: 'combat', error: false, data: {state: combat.getState(), event: {type: 'loot-taken'}}});
    if (event && event.cardLootTaken)
        messages.push(cardLoot.message({type: event.toShip ? 'all-taken' : 'taken', count: event.toShip || 1}));
    return messages;
}

// Entry point of the "inventory-*" websocket actions
const handle = async function (response) {
    if (response.action === 'inventory-move') {
        let result = await move(response.data || {});
        if (result.error)
            return {action: 'inventory-error', error: false, data: {message: result.error}};
        return payload(result);
    }
    if (response.action === 'card-loot-all')
        return payload(await takeAllCardLoot());
    // inventory-sync: the Discord bot already moved the item, we broadcast
    return payload((response.data && response.data.event) || null);
}

module.exports = {getInventories, getInventory, getShip, move, takeFrom, giveTo, countOf, ensureItem, handle, payload};
