const fs = require('fs');
const path = require('path');
const inventory = require('./inventory');
const combat = require('./combat');

// Crafting (wiki: regles/artisanat.md). An item is crafted by
// assembling items from the same inventory (a player or the ship),
// in the ship and during a quiet moment: never in the middle of combat.
// Recipes are entered in the item editor, on the crafted item:
// "recipe": {"ingredients": [{"slug": "corde", "qty": 2}], "qty": 1}
// (qty: copies crafted). The GM can also freely assemble
// items and decide the result themselves.
// Success: baseChance %, plus armoryBonus % per armory upgrade
// level (ship.armory_up, 0 to armoryMax). The GM can roll the die or
// confirm directly. On failure, the ingredients are lost if
// failLosesIngredients. Settings: config/craft.json.

const FILE = path.join(__dirname, '../config/craft.json');
const itemsFile = require('../config/paths').itemsFile;
const DEFAULTS = {baseChance: 70, armoryBonus: 10, armoryMax: 3, failLosesIngredients: true};
const IMAGE_PATH = '/img/items/';
const MAX_INGREDIENTS = 8;
const MAX_QTY = 99;
const LOG_SIZE = 20;

let log = [];

const config = function () {
    let cfg;
    try {
        cfg = Object.assign({}, DEFAULTS, JSON.parse(fs.readFileSync(FILE, 'utf8')));
    } catch (e) {
        cfg = Object.assign({}, DEFAULTS);
    }
    for (let key of ['baseChance', 'armoryBonus', 'armoryMax'])
        cfg[key] = Number.isFinite(Number(cfg[key])) && Number(cfg[key]) >= 0 ? Math.round(Number(cfg[key])) : DEFAULTS[key];
    cfg.failLosesIngredients = cfg.failLosesIngredients !== false;
    return cfg;
}

const qtyOf = (v) => Math.min(Math.max(parseInt(v) || 1, 1), MAX_QTY);

/* ---------- Recipes ---------- */

// Flat catalog: {slug: {slug, name, image, recipe}}
const catalog = function () {
    let out = {};
    try {
        let pools = JSON.parse(fs.readFileSync(itemsFile(), 'utf8'));
        for (let pool in pools)
            for (let item of pools[pool])
                out[item.slug] = {slug: item.slug, name: item.name, image: item.image ? IMAGE_PATH + item.image : '', recipe: item.recipe};
    } catch (e) {}
    return out;
}

// Clean recipe or null: catalog ingredients (except the item itself),
// merged quantities, MAX_INGREDIENTS at most
const cleanRecipe = function (raw, known, self) {
    if (!raw || !Array.isArray(raw.ingredients))
        return null;
    let ingredients = [];
    for (let ing of raw.ingredients) {
        let slug = String((ing && ing.slug) || '');
        if (!slug || slug === self || !known[slug])
            continue;
        let same = ingredients.find(i => i.slug === slug);
        if (same)
            same.qty = Math.min(same.qty + qtyOf(ing.qty), MAX_QTY);
        else if (ingredients.length < MAX_INGREDIENTS)
            ingredients.push({slug: slug, qty: qtyOf(ing.qty)});
    }
    return ingredients.length ? {ingredients: ingredients, qty: qtyOf(raw.qty)} : null;
}

// Catalog recipes, ready to display
const recipes = function () {
    let known = catalog(), out = [];
    for (let slug in known) {
        let recipe = cleanRecipe(known[slug].recipe, known, slug);
        if (!recipe)
            continue;
        out.push({
            slug: slug, name: known[slug].name, image: known[slug].image, qty: recipe.qty,
            ingredients: recipe.ingredients.map(i => ({slug: i.slug, name: known[i.slug].name, image: known[i.slug].image, qty: i.qty}))
        });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

/* ---------- Armory ---------- */

const shipRow = () => DB.tables.ship.findOne({raw: true, order: [['id', 'ASC']]});

const armory = async function () {
    let ship = await shipRow();
    return ship ? Math.min(ship.armory_up || 0, config().armoryMax) : 0;
}

const setArmory = async function (level) {
    let ship = await shipRow();
    if (!ship)
        return {error: 'Pas de vaisseau'};
    level = Math.min(Math.max(parseInt(level) || 0, 0), config().armoryMax);
    await DB.tables.ship.update({armory_up: level}, {where: {id: ship.id}});
    return {level: level};
}

// Success chance (in %) for an armory level
const chance = function (level, cfg) {
    cfg = cfg || config();
    return Math.min(cfg.baseChance + cfg.armoryBonus * (level || 0), 100);
}

/* ---------- Crafting ---------- */

// {type: 'player', id} or {type: 'ship'}; null if unknown
const validCrafter = async function (crafter) {
    crafter = crafter || {};
    if (crafter.type === 'ship')
        return {type: 'ship'};
    if (crafter.type === 'player' && crafter.id && await DB.tables.players.findOne({raw: true, where: {discord_id: String(crafter.id)}}))
        return {type: 'player', id: String(crafter.id)};
    return null;
}

const whoName = async function (crafter) {
    if (crafter.type === 'ship')
        return 'L\'équipage';
    let p = await DB.tables.players.findOne({raw: true, where: {discord_id: String(crafter.id)}});
    return p ? p.name : '?';
}

// Name of a game item (or of the catalog)
const itemName = async function (slug, known) {
    if (known[slug])
        return known[slug].name;
    let row = await DB.tables.items.findOne({raw: true, where: {slug: slug}});
    return row ? row.name : slug;
}

const addLog = function (entry) {
    entry.at = Date.now();
    log.push(entry);
    log = log.slice(-LOG_SIZE);
    return entry;
}

/**
 * Crafts an item. data:
 * - crafter: who crafts (their items are used as ingredients, they receive the result)
 * - slug: the crafted item (a catalog recipe, or any item in free assembly)
 * - name: in free assembly, name of an item outside the catalog to create
 * - ingredients: [{slug, qty}] for a free assembly; if absent, those of the recipe
 * - qty: copies crafted (by default those of the recipe, otherwise 1)
 * - roll: true to roll the success die, otherwise success is guaranteed
 * Returns {event, item} or {error}
 */
const make = async function (data) {
    data = data || {};
    let cfg = config();
    let crafter = await validCrafter(data.crafter);
    if (!crafter)
        return {error: 'Choisis qui fabrique l\'objet'};
    if (combat.getState().active)
        return {error: 'Pas d\'artisanat pendant un combat : il faut un moment calme'};

    let known = catalog();
    let slug = String(data.slug || '');
    let recipe = recipes().find(r => r.slug === slug);
    let free = Array.isArray(data.ingredients);
    let ingredients, qty, result;
    if (free) {
        ingredients = [];
        for (let ing of data.ingredients) {
            let s = String((ing && ing.slug) || '');
            if (!s)
                continue;
            let same = ingredients.find(i => i.slug === s);
            if (same)
                same.qty = Math.min(same.qty + qtyOf(ing.qty), MAX_QTY);
            else if (ingredients.length < MAX_INGREDIENTS)
                ingredients.push({slug: s, qty: qtyOf(ing.qty)});
        }
        if (!ingredients.length)
            return {error: 'Ajoute au moins un ingrédient'};
        let name = String(data.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        if (known[slug])
            result = known[slug];
        else if (name)
            result = {name: name, image: ''};
        else
            return {error: 'Choisis l\'objet fabriqué'};
        qty = qtyOf(data.qty || (recipe && recipe.qty));
    }
    else {
        if (!recipe)
            return {error: 'Cette recette n\'existe pas'};
        ingredients = recipe.ingredients.map(i => ({slug: i.slug, qty: i.qty}));
        result = known[slug];
        qty = qtyOf(data.qty || recipe.qty);
    }

    // All ingredients must be in the crafter's inventory
    for (let ing of ingredients) {
        let have = await inventory.countOf(ing.slug, crafter);
        ing.name = await itemName(ing.slug, known);
        if (have < ing.qty)
            return {error: 'Il manque ' + ing.name + ' (' + have + ' / ' + ing.qty + ')'};
    }

    let level = await armory();
    let odds = chance(level, cfg);
    let roll = data.roll ? 1 + Math.floor(Math.random() * 100) : null;
    let success = roll === null || roll <= odds;

    if (success || cfg.failLosesIngredients)
        for (let ing of ingredients)
            await inventory.takeFrom(ing.slug, crafter, ing.qty);

    let item = null;
    if (success) {
        let row = await inventory.ensureItem({slug: known[slug] ? slug : '', name: result.name, image: result.image});
        if (!row)
            return {error: 'Objet fabriqué inconnu'};
        await inventory.giveTo(row, crafter, qty);
        item = {slug: row.slug, name: row.name, image: row.image || '', desc: row.desc || '', count: qty};
    }

    let event = addLog({
        type: success ? 'craft' : 'craft-failed',
        who: await whoName(crafter),
        crafter: crafter,
        name: result.name,
        qty: qty,
        ingredients: ingredients.map(i => ({name: i.name, qty: i.qty})),
        lost: !success && cfg.failLosesIngredients,
        roll: roll,
        chance: odds,
        free: free
    });
    return {event: event, item: item, crafter: crafter};
}

/* ---------- Messages ---------- */

// Copies of each item: {ship: {slug: n}, players: {id: {slug: n}}}
const holdings = async function () {
    let out = {ship: {}, players: {}};
    for (let it of await inventory.getShip())
        out.ship[it.slug] = it.count;
    let inventories = await inventory.getInventories();
    for (let id in inventories) {
        out.players[id] = {};
        for (let it of inventories[id])
            out.players[id][it.slug] = it.count;
    }
    return out;
}

// Game items (for free assembly): {slug: {name, image}}
const items = async function () {
    let out = {};
    for (let row of await DB.tables.items.findAll({raw: true}))
        out[row.slug] = {name: row.name, image: row.image || ''};
    return out;
}

const message = async function (event) {
    let cfg = config(), level = await armory();
    let players = (await DB.tables.players.findAll({raw: true})).map(p => ({id: p.discord_id, name: p.name}));
    return {
        action: 'craft',
        error: false,
        data: {
            recipes: recipes(),
            items: await items(),
            holdings: await holdings(),
            players: players,
            armory: level,
            armoryMax: cfg.armoryMax,
            chance: chance(level, cfg),
            failLosesIngredients: cfg.failLosesIngredients,
            combat: !!combat.getState().active,
            log: log.slice(),
            event: event || null
        }
    };
}

const error = (text) => ({action: 'craft-error', error: false, data: {message: text}});

const reset = function () {
    log = [];
}

// Entry point of the "craft-*" websocket actions
const handle = async function (response) {
    let data = response.data || {};
    if (response.action === 'craft-make') {
        let result = await make(data);
        if (result.error)
            return error(result.error);
        let invEvent = result.item ? {item: result.item, to: result.crafter} : null;
        return [await message(result.event)].concat(await inventory.payload(invEvent));
    }
    if (response.action === 'craft-armory') {
        let result = await setArmory(data.level);
        if (result.error)
            return error(result.error);
        return [await message({type: 'armory', level: result.level})];
    }
    return [await message(null)];   // craft-state: plain read
}

module.exports = {handle, config, catalog, cleanRecipe, recipes, armory, setArmory, chance, make, message, reset, MAX_INGREDIENTS};
