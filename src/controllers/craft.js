const fs = require('fs');
const path = require('path');
const inventory = require('./inventory');
const combat = require('./combat');

// Artisanat (wiki : regles/artisanat.md). On fabrique un objet en
// assemblant des objets d'un même inventaire (un joueur ou le vaisseau),
// dans le vaisseau et pendant un moment calme : jamais en plein combat.
// Les recettes se saisissent dans l'éditeur d'objets, sur l'objet fabriqué :
// "recipe": {"ingredients": [{"slug": "corde", "qty": 2}], "qty": 1}
// (qty : exemplaires fabriqués). Le MJ peut aussi assembler librement des
// objets et décider lui-même du résultat.
// Réussite : baseChance %, plus armoryBonus % par niveau d'amélioration de
// l'armurerie (ship.armory_up, 0 à armoryMax). Le MJ peut lancer le dé ou
// valider directement. En cas d'échec, les ingrédients sont perdus si
// failLosesIngredients. Réglages : config/craft.json.

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

/* ---------- Recettes ---------- */

// Catalogue à plat : {slug: {slug, name, image, recipe}}
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

// Recette propre ou null : ingrédients du catalogue (sauf l'objet lui-même),
// quantités fusionnées, MAX_INGREDIENTS au plus
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

// Recettes du catalogue, prêtes à afficher
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

/* ---------- Armurerie ---------- */

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

// Chance de réussite (en %) pour un niveau d'armurerie
const chance = function (level, cfg) {
    cfg = cfg || config();
    return Math.min(cfg.baseChance + cfg.armoryBonus * (level || 0), 100);
}

/* ---------- Fabrication ---------- */

// {type: 'player', id} ou {type: 'ship'} ; null si inconnu
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

// Nom d'un objet de la partie (ou du catalogue)
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
 * Fabrique un objet. data :
 * - crafter : qui fabrique (ses objets servent d'ingrédients, il reçoit le résultat)
 * - slug : l'objet fabriqué (une recette du catalogue, ou n'importe quel objet en assemblage libre)
 * - name : en assemblage libre, nom d'un objet hors catalogue à créer
 * - ingredients : [{slug, qty}] pour un assemblage libre ; absent, ceux de la recette
 * - qty : exemplaires fabriqués (par défaut ceux de la recette, 1 sinon)
 * - roll : true pour lancer le dé de réussite, sinon réussite assurée
 * Renvoie {event, item} ou {error}
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

    // Tous les ingrédients doivent être dans l'inventaire de l'artisan
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

// Exemplaires de chaque objet : {ship: {slug: n}, players: {id: {slug: n}}}
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

// Objets de la partie (pour l'assemblage libre) : {slug: {name, image}}
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

// Point d'entrée des actions websocket « craft-* »
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
    return [await message(null)];   // craft-state : simple lecture
}

module.exports = {handle, config, catalog, cleanRecipe, recipes, armory, setArmory, chance, make, message, reset, MAX_INGREDIENTS};
