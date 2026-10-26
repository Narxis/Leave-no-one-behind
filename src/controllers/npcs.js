const fs = require('fs');
const path = require('path');
const lootEntry = require('./loot');

// Ennemis et compagnons préparés dans l'éditeur (/bestiaire), proposés
// ensuite au MJ dans son menu (onglets Adversaires et Compagnons).
// Ennemis : config/bestiary.json fournit la liste de départ ; dès la première
// modification, la liste complète vit dans storage/cache/bestiary.json.
// Compagnons : modèles (nom, rôle, stats) gardés dans storage/cache/companions.json.

const BASE_ENEMIES = path.join(__dirname, '../config/bestiary.json');
// Dans le dossier de données (comme les races customs)
const ENEMY_FILE = require('../config/paths').cache('bestiary.json');
const COMPANION_FILE = require('../config/paths').cache('companions.json');

const DAMAGE = ['faible', 'moyen', 'fort'];
// Catégorie d'un ennemi : sert au tri dans l'éditeur, au Roll et au menu MJ
const CATEGORIES = ['invocation', 'sbire', 'standard', 'elite', 'boss'];
const COMPANION_STATS = ['combat', 'pilotage', 'engineering', 'survival', 'recon', 'moral'];
const MAX_ENEMIES = 100;
const MAX_COMPANIONS = 50;
const LOOT_SIZE = 12;

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const toInt = (v, def) => Number.isFinite(parseInt(v)) ? parseInt(v) : def;
const cleanText = (v, max) => String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

const slugify = (name) => String(name).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

const readList = function (file, fallback) {
    try {
        let list = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (Array.isArray(list))
            return list;
    }
    catch (e) {}
    return fallback ? readList(fallback) : [];
}

const getEnemies = () => readList(ENEMY_FILE, BASE_ENEMIES);
const getCompanions = () => readList(COMPANION_FILE);

// Fiche d'un ennemi telle qu'enregistrée (mêmes champs que bestiary.json,
// plus le butin par défaut, repris à chaque fois qu'il entre en combat)
const cleanEnemy = function (data) {
    let name = cleanText(data.name, 60);
    if (!name)
        return {error: 'Donne un nom à l\'ennemi.'};
    let loot = [];
    for (let entry of (Array.isArray(data.loot) ? data.loot : []).map(lootEntry.entry)) {
        if (entry && loot.length < LOOT_SIZE)
            loot.push(lootEntry.stored(entry));
    }
    return {enemy: {
        name: name,
        hp: clamp(toInt(data.hp, 10), 1, 999),
        offense: clamp(toInt(data.offense, 50), 0, 100),
        defense: clamp(toInt(data.defense, 50), 0, 100),
        damage: DAMAGE.includes(data.damage) ? data.damage : 'moyen',
        category: CATEGORIES.includes(data.category) ? data.category : 'standard',
        loot: loot
    }};
}

const cleanCompanion = function (data) {
    let name = cleanText(data.name, 20);
    if (!name)
        return {error: 'Donne un nom au compagnon.'};
    let companion = {name: name, race: cleanText(data.race, 30)};
    for (let stat of COMPANION_STATS)
        companion[stat] = clamp(toInt(data[stat], 50), 0, 100);
    return {companion: companion};
}

// Enregistre une fiche (nouvelle si data.slug est vide). Le slug ne change
// pas quand on renomme : c'est lui qui identifie la fiche
const upsert = function (file, list, data, clean, max, label) {
    let result = clean(data);
    if (result.error)
        return result;
    let entry = result.enemy || result.companion;
    let existing = data.slug ? list.find(e => e.slug === String(data.slug)) : null;
    if (data.slug && !existing)
        return {error: 'Cette fiche n\'existe plus : recharge la page.'};
    let lower = entry.name.toLowerCase();
    if (list.some(e => e !== existing && String(e.name).toLowerCase() === lower))
        return {error: 'Un ' + label + ' porte déjà ce nom.'};
    if (existing) {
        entry.slug = existing.slug;
        list[list.indexOf(existing)] = entry;
    }
    else {
        if (list.length >= max)
            return {error: 'Pas plus de ' + max + ' fiches : supprimes-en une avant d\'en créer une autre.'};
        let base = slugify(entry.name) || label;
        let slug = base, i = 2;
        while (list.some(e => e.slug === slug))
            slug = base + '-' + i++;
        entry.slug = slug;
        list.push(entry);
    }
    // Le slug en premier, comme dans bestiary.json
    let saved = Object.assign({slug: entry.slug}, entry);
    list[list.indexOf(entry)] = saved;
    fs.writeFileSync(file, JSON.stringify(list, null, 2));
    return {entry: saved};
}

const removeFrom = function (file, list, slug) {
    let entry = list.find(e => e.slug === String(slug));
    if (!entry)
        return {error: 'Cette fiche n\'existe plus.'};
    fs.writeFileSync(file, JSON.stringify(list.filter(e => e !== entry), null, 2));
    return {ok: true};
}

const saveEnemy = (data) => upsert(ENEMY_FILE, getEnemies(), data || {}, cleanEnemy, MAX_ENEMIES, 'ennemi');
const removeEnemy = (slug) => removeFrom(ENEMY_FILE, getEnemies(), slug);
const saveCompanion = (data) => upsert(COMPANION_FILE, getCompanions(), data || {}, cleanCompanion, MAX_COMPANIONS, 'compagnon');
const removeCompanion = (slug) => removeFrom(COMPANION_FILE, getCompanions(), slug);

module.exports = {getEnemies, getCompanions, saveEnemy, removeEnemy, saveCompanion, removeCompanion,
    cleanEnemy, cleanCompanion, slugify, DAMAGE, CATEGORIES, COMPANION_STATS, MAX_ENEMIES, MAX_COMPANIONS, LOOT_SIZE};
