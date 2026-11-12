const fs = require('fs');
const path = require('path');
const races = require('./races');
const money = require('./money');
const craft = require('./craft');

// Item catalog (/items editor): src/config/items.json (in the installed
// app, an editable copy in the data folder, see paths.js),
// sorted by
// category ("pool"). Each item also has an optional type (weapon,
// consumable, resource…) and a rarity (common → legendary), specific to the
// catalog for now. "starter" items are given at the start of the
// game to the players of their race. Each change also updates the
// items table of the current game, without touching the copies that
// players or the ship already own.
// The quantity ("qty", 1 if missing) is the number of copies given to
// each player for a starting item, and the quantity suggested by default
// when the item is added to a loot (cards, enemies, combat).
// The price ("price", in game currency, missing: no price) is the merchants'
// price; they buy it back at a share of that price (config/currency.json).
// The recipe ("recipe", optional) says how to craft the item at
// the workshop: {ingredients: [{slug, qty}], qty: copies crafted}.

const paths = require('../config/paths');
// Images added in the editor: in the data folder (served on /img/items)
const IMAGE_DIR = paths.itemImages();
const IMAGE_PATH = '/img/items/';
const STARTER = 'starter';
const MAX_NAME = 60;
const MAX_DESC = 600;
const MAX_QTY = 99;
const MAX_PRICE = 99999;
// Types suggested by default in the editor; others can be created
// Rarities, from most common to rarest
const RARITIES = ['commun', 'peu_commun', 'rare', 'epique', 'legendaire'];
const TYPES = ['arme', 'armure', 'munition', 'consommable', 'ressource', 'outil', 'gadget', 'divers'];

const read = () => JSON.parse(fs.readFileSync(paths.itemsFile(), 'utf8'));
const write = (pools) => fs.writeFileSync(paths.itemsWriteFile(), JSON.stringify(pools, null, 2) + '\n');

const slugify = (text, sep = '-') => String(text).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, sep).replace(new RegExp('^' + sep + '+|' + sep + '+$', 'g'), '');

const imageUrl = (file) => file ? IMAGE_PATH + file : '';
const qtyOf = (v) => Math.min(Math.max(parseInt(v) || 1, 1), MAX_QTY);
const priceOf = (v) => Math.min(Math.max(parseInt(v) || 0, 0), MAX_PRICE);
const knownSlugs = (pools) => Object.fromEntries(Object.values(pools).flat().map(i => [i.slug, true]));
const ownersOf = (row) => row && row.owners ? String(row.owners).split(',').filter(Boolean) : [];

// Copies in the current game: {slug: {players, ship}}
const usage = async function () {
    let rows = await DB.tables.items.findAll({raw: true});
    let out = {};
    for (let row of rows)
        out[row.slug] = {players: ownersOf(row).length, ship: row.quantity || 0};
    return out;
}

// Flat list, in file order
const list = async function () {
    let pools = read(), used = await usage(), known = knownSlugs(pools);
    let items = [];
    for (let pool in pools)
        for (let item of pools[pool])
            items.push({
                slug: item.slug,
                name: item.name,
                desc: item.desc || '',
                pool: pool,
                type: item.type || '',
                rarity: RARITIES.includes(item.rarity) ? item.rarity : RARITIES[0],
                race: item.race || '',
                qty: qtyOf(item.qty),
                price: priceOf(item.price),
                recipe: craft.cleanRecipe(item.recipe, known, item.slug),
                image: imageUrl(item.image),
                used: used[item.slug] || {players: 0, ship: 0}
            });
    let types = TYPES.concat([...new Set(items.map(i => i.type).filter(t => t && !TYPES.includes(t)))]);
    return {items: items, pools: Object.keys(pools), types: types, races: races.list().map(r => ({slug: r.slug, name: r.name})), currency: money.publicConfig()};
}

const find = function (pools, slug) {
    for (let pool in pools) {
        let at = pools[pool].findIndex(i => i.slug === slug);
        if (at >= 0)
            return {pool: pool, index: at, item: pools[pool][at]};
    }
    return null;
}

// Removes an item from its category; a category emptied by the editor disappears
const dropFrom = function (pools, pool, index) {
    pools[pool].splice(index, 1);
    if (!pools[pool].length && pool !== STARTER)
        delete pools[pool];
}

// Image file used by an item other than this one?
const imageShared = (pools, file, slug) => Object.values(pools).flat().some(i => i.image === file && i.slug !== slug);

// Copies the item into the current game (or adds it, with no copies)
const syncDB = async function (item, pool, oldSlug) {
    let data = {slug: item.slug, name: item.name, desc: item.desc, pool: pool, race: item.race || '', image: imageUrl(item.image)};
    let row = await DB.tables.items.findOne({raw: true, where: {slug: oldSlug || item.slug}});
    if (row)
        await DB.tables.items.update(data, {where: {id: row.id}});
    else
        await DB.tables.items.create(Object.assign({owners: '', quantity: 0}, data));
}

// Creation or edit. Returns {item} or {error}
const save = async function (data) {
    let pools = read();
    let name = String(data.name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
    if (!name)
        return {error: 'Donne un nom à l\'objet.'};
    let pool = slugify(data.pool || '', '_').slice(0, 30);
    if (!pool)
        return {error: 'Choisis une catégorie.'};
    let type = slugify(data.type || '', '_').slice(0, 30);
    let rarity = RARITIES.includes(data.rarity) ? data.rarity : RARITIES[0];
    let race = pool === STARTER ? String(data.race || '') : '';
    if (pool === STARTER && !race)
        return {error: 'Un objet de départ appartient à une race : choisis-la.'};

    let existing = data.slug ? find(pools, String(data.slug)) : null;
    if (data.slug && !existing)
        return {error: 'Cet objet n\'existe plus : recharge la page.'};
    let slug = existing ? existing.item.slug : slugify(name);
    if (!slug)
        return {error: 'Ce nom ne contient aucune lettre utilisable.'};
    if (!existing && (find(pools, slug) || await DB.tables.items.findOne({raw: true, where: {slug: slug}})))
        return {error: 'Un objet porte déjà ce nom.'};
    let other = Object.values(pools).flat().find(i => i.slug !== slug && i.name.toLowerCase() === name.toLowerCase());
    if (other)
        return {error: 'Un objet porte déjà ce nom.'};

    let item = {
        name: name,
        slug: slug
    };
    if (type)
        item.type = type;
    item.rarity = rarity;
    item.desc = String(data.desc || '').replace(/\r/g, '').trim().slice(0, MAX_DESC);
    if (race)
        item.race = race;
    if (qtyOf(data.qty) > 1)
        item.qty = qtyOf(data.qty);
    if (priceOf(data.price) > 0)
        item.price = priceOf(data.price);
    let recipe = craft.cleanRecipe(data.recipe, knownSlugs(pools), slug);
    if (recipe)
        item.recipe = recipe;
    item.image = existing ? (existing.item.image || '') : '';

    // Image sent by the editor: a PNG already resized by the browser
    if (data.image && /^data:image\/png;base64,/.test(data.image)) {
        let buffer = Buffer.from(data.image.split(',')[1], 'base64');
        if (buffer.length > 3 * 1024 * 1024)
            return {error: 'Image trop lourde (3 Mo au plus).'};
        fs.writeFileSync(path.join(IMAGE_DIR, slug + '.png'), buffer);
        item.image = slug + '.png';
    }
    else if (data.removeImage && item.image) {
        if (item.image === slug + '.png' && !imageShared(pools, item.image, slug))
            try { fs.unlinkSync(path.join(IMAGE_DIR, item.image)); } catch (e) {}
        item.image = '';
    }

    // Same place in the list, unless the category changes (at the end of the new one)
    if (existing && existing.pool === pool)
        pools[pool][existing.index] = item;
    else {
        if (existing)
            dropFrom(pools, existing.pool, existing.index);
        (pools[pool] = pools[pool] || []).push(item);
    }
    write(pools);
    await syncDB(item, pool);
    return {item: (await list()).items.find(i => i.slug === slug)};
}

// Removal from the catalog. Copies already owned stay until the next game
const remove = async function (slug) {
    let pools = read();
    let found = find(pools, String(slug));
    if (!found)
        return {error: 'Cet objet n\'existe plus.'};
    dropFrom(pools, found.pool, found.index);
    write(pools);
    let file = found.item.image;
    if (file && file === found.item.slug + '.png' && !imageShared(pools, file, found.item.slug))
        try { fs.unlinkSync(path.join(IMAGE_DIR, file)); } catch (e) {}

    let row = await DB.tables.items.findOne({raw: true, where: {slug: found.item.slug}});
    let kept = row && (ownersOf(row).length || row.quantity > 0);
    if (row && !kept)
        await DB.tables.items.destroy({where: {id: row.id}});
    return {ok: true, kept: !!kept};
}

module.exports = {list, save, remove, STARTER, TYPES, RARITIES, MAX_QTY};
