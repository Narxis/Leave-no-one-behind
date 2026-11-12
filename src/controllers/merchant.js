const fs = require('fs');
const path = require('path');
const money = require('./money');
const inventory = require('./inventory');
const loot = require('./loot');

// Merchant: the GM prepares a stall (items, prices, stock) in their menu and
// opens it; the game screen shows it to the players. The GM makes the purchases and
// sales for them: a player (their purse) or the ship (the cash
// box) buys with currency, or the crew pays in cryopods (the ship's
// humans) at the rate of config/currency.json. A merchant buys back
// items at a share of their price (sellRatio), editable by the GM.
// Kept in memory, like the combat state.

const itemsFile = require('../config/paths').itemsFile;
const MAX_STOCK = 30;
const MAX_PRICE = 99999;
const LOG_SIZE = 20;
const DEFAULT_NAME = 'Marchand';

// stock: [{slug, name, image, price, qty}] (qty null: unlimited)
let state = {open: false, name: DEFAULT_NAME, stock: [], log: []};

const toInt = (v, def) => Number.isFinite(parseInt(v)) ? parseInt(v) : def;
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const text = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);

// Catalog items with their price (0: no price)
const catalog = function () {
    let pools = JSON.parse(fs.readFileSync(itemsFile(), 'utf8'));
    return Object.values(pools).flat().map(item => ({
        slug: item.slug,
        name: item.name,
        image: item.image ? '/img/items/' + item.image : '',
        price: clamp(toInt(item.price, 0), 0, MAX_PRICE)
    }));
}

const findItem = function (list, entry) {
    let slug = String(entry.slug || ''), name = text(entry.name, 60).toLowerCase();
    return list.find(i => i.slug === slug) || list.find(i => name && i.name.toLowerCase() === name);
}

// Stall sent by the GM menu: catalog items (or typed by hand),
// default price from the item editor
const cleanStock = function (raw) {
    let known = catalog();
    let stock = [];
    for (let entry of (Array.isArray(raw) ? raw : [])) {
        if (!entry || stock.length >= MAX_STOCK)
            continue;
        let item = findItem(known, entry);
        let name = item ? item.name : text(entry.name, 60);
        if (!name || money.isMoney(name))
            continue;
        let qty = entry.qty === null || entry.qty === undefined || entry.qty === '' ? null : clamp(toInt(entry.qty, 1), 0, loot.MAX_QTY);
        stock.push({
            slug: item ? item.slug : '',
            name: name,
            image: item ? item.image : '',
            price: clamp(toInt(entry.price, item ? item.price : 0), 0, MAX_PRICE),
            qty: qty
        });
    }
    return stock;
}

const getState = () => JSON.parse(JSON.stringify(state));

const reset = function () {
    state = {open: false, name: DEFAULT_NAME, stock: [], log: []};
}

const players = async function () {
    let list = await DB.tables.players.findAll({raw: true});
    return list.map(p => ({id: p.discord_id, name: p.name}));
}

const whoName = async function (target) {
    if (target.type === 'ship')
        return 'Le vaisseau';
    let p = await DB.tables.players.findOne({raw: true, where: {discord_id: String(target.id)}});
    return p ? p.name : '?';
}

const addLog = function (entry) {
    entry.at = Date.now();
    state.log.push(entry);
    state.log = state.log.slice(-LOG_SIZE);
    return entry;
}

const validTarget = async function (target) {
    target = target || {};
    if (target.type === 'ship')
        return {type: 'ship'};
    if (target.type === 'player' && await money.balance(target) !== null)
        return {type: 'player', id: String(target.id)};
    return null;
}

// Opens the stall (or updates it if already open)
const open = function (data) {
    let wasOpen = state.open;
    state.open = true;
    state.name = text(data.name, 40) || DEFAULT_NAME;
    // Opened from a card without an item list: the GM's last stall,
    // failing that the catalog items that have a price
    if (Array.isArray(data.stock))
        state.stock = cleanStock(data.stock);
    else if (!state.stock.length)
        state.stock = cleanStock(catalog().filter(i => i.price > 0));
    if (!wasOpen)
        state.log = [];
    return {type: wasOpen ? 'update' : 'open'};
}

const close = function () {
    state.open = false;
    return {type: 'close'};
}

// Purchase: {index, slug, buyer: {type, id}, pay: 'credits' | 'cryopods', count}
const buy = async function (data) {
    if (!state.open)
        return {error: 'La boutique est fermée'};
    let i = toInt(data.index, -1);
    let entry = state.stock[i];
    if (!entry || (data.slug !== undefined && String(data.slug) !== entry.slug))
        return {error: 'Cet objet n\'est plus en vente'};
    let buyer = await validTarget(data.buyer);
    if (!buyer)
        return {error: 'Acheteur inconnu'};
    let count = loot.qtyOf(data.count);
    if (entry.qty !== null && entry.qty < count)
        return {error: entry.qty ? 'Il n\'en reste que ' + entry.qty : 'Plus en stock'};

    let cfg = money.config();
    let cost = entry.price * count;
    let pay = data.pay === 'cryopods' ? 'cryopods' : 'credits';
    let paid, cryopods;
    if (pay === 'cryopods') {
        paid = money.cryopodPrice(cost, cfg);
        let out = await money.spendCryopods(paid);
        if (out.error)
            return out;
        cryopods = out.cryopods;
    }
    else {
        paid = cost;
        let out = await money.add(buyer, -cost);
        if (out.error)
            return out;
    }

    let row = await inventory.ensureItem(entry);
    await inventory.giveTo(row, buyer, count);
    if (entry.qty !== null)
        entry.qty -= count;
    let log = addLog({type: 'buy', who: await whoName(buyer), item: entry.name, count: count, paid: paid, pay: pay});
    return {event: Object.assign({buyer: buyer, cryopods: cryopods}, log)};
}

// Sale to the merchant: {slug, seller: {type, id}, count, price (per unit,
// optional: otherwise the sellRatio share of the editor price)}
const sell = async function (data) {
    if (!state.open)
        return {error: 'La boutique est fermée'};
    let seller = await validTarget(data.seller);
    if (!seller)
        return {error: 'Vendeur inconnu'};
    let known = findItem(catalog(), {slug: data.slug}) || {price: 0};
    let price = data.price === undefined || data.price === '' || data.price === null
        ? money.sellPrice(known.price) : clamp(toInt(data.price, 0), 0, MAX_PRICE);
    let taken = await inventory.takeFrom(data.slug, seller, loot.qtyOf(data.count));
    if (taken.error)
        return taken;
    await money.add(seller, price * taken.count);
    // The merchant puts the item back in their stall if they already sell it
    let entry = state.stock.find(e => e.slug && e.slug === taken.row.slug);
    if (entry && entry.qty !== null)
        entry.qty = Math.min(entry.qty + taken.count, loot.MAX_QTY);
    let log = addLog({type: 'sell', who: await whoName(seller), item: taken.row.name, count: taken.count, paid: price * taken.count, pay: 'credits'});
    return {event: Object.assign({seller: seller}, log)};
}

// Websocket message: the stall, purses, cryopods and players
const message = async function (event) {
    return {
        action: 'merchant',
        error: false,
        data: {
            state: getState(),
            wallets: await money.wallets(),
            cryopods: await money.cryopods(),
            players: await players(),
            currency: money.publicConfig(),
            event: event || null
        }
    };
}

const error = (text) => ({action: 'merchant-error', error: false, data: {message: text}});

// Entry point of the "merchant-*" and "money-*" websocket actions
const handle = async function (response) {
    let data = response.data || {};
    let result = {};
    switch (response.action) {
        case 'merchant-open':
            result = {event: open(data)};
            break;
        case 'merchant-close':
            result = {event: close()};
            break;
        case 'merchant-buy':
            result = await buy(data);
            break;
        case 'merchant-sell':
            result = await sell(data);
            break;
        // The GM adds or removes currency to a purse (+x / -x)
        case 'money-add': {
            let target = await validTarget(data.target);
            if (!target)
                return error('Bourse introuvable');
            let out = await money.add(target, toInt(data.amount, 0));
            if (out.error)
                return error(out.error);
            result = {event: {type: 'money', who: await whoName(target), amount: toInt(data.amount, 0)}};
            break;
        }
        // A purse gives some to another (player ↔ player or cash box)
        case 'money-transfer': {
            let from = await validTarget(data.from), to = await validTarget(data.to);
            if (!from || !to)
                return error('Bourse introuvable');
            let out = await money.transfer(from, to, data.amount);
            if (out.error)
                return error(out.error);
            result = {event: {type: 'transfer', from: await whoName(from), to: await whoName(to), amount: toInt(data.amount, 0)}};
            break;
        }
        default:    // merchant-state: plain read
            return [await message(null)].concat(await inventory.payload(null));
    }
    if (result.error)
        return error(result.error);
    return [await message(result.event)].concat(await inventory.payload(null));
}

module.exports = {handle, getState, reset, catalog, cleanStock, open, close, buy, sell, message, MAX_STOCK};
