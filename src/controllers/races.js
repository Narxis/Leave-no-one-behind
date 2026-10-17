const fs = require('fs');
const path = require('path');

// Races jouables : celles de base (config/raceStats.json + lang.json) et les
// races customs créées dans l'éditeur (/races), gardées dans
// storage/cache/customRaces.json. Les customs sont fusionnées dans LANG
// (descriptions, formes « un/le/du… » des textes de cartes) au démarrage et
// à chaque modification.

const BASE_FILE = path.join(__dirname, '../config/raceStats.json');
// Dans le dossier de données (voir config/paths.js)
const paths = require('../config/paths');
const CUSTOM_FILE = paths.cache('customRaces.json');
const IMAGE_DIR = paths.raceImages();
const STATS = ['combat', 'pilotage', 'engineering', 'survival', 'recon'];
// Un menu déroulant Discord propose 25 options au plus (choix de la race dans /create)
const MAX_RACES = 25;

const clampMod = (v) => Math.max(-2, Math.min(2, parseInt(v) || 0));
const escapeHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

const readBase = () => JSON.parse(fs.readFileSync(BASE_FILE, 'utf8'));

const readCustom = function () {
    try {
        let list = JSON.parse(fs.readFileSync(CUSTOM_FILE, 'utf8'));
        return Array.isArray(list) ? list : [];
    }
    catch (e) {
        return [];
    }
}

// Nom affiché d'une race de base, à partir de son identifiant (nek_eau → Nek-Eau)
const baseLabel = (slug) => slug.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-');

// Identifiant d'une race custom : sert de nom d'image et de clé partout
const slugify = (name) => String(name).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);

// Formes utilisées par les variables des cartes ([un_race_1], [le_race_2]…)
const grammar = function (name, plural, feminine) {
    let vowel = /^[aeiouyhâàéèêëîïôöûü]/i.test(name);
    return {
        le: vowel ? "l'" + name : (feminine ? 'la ' : 'le ') + name,
        les: 'les ' + plural,
        des: 'des ' + plural,
        un: (feminine ? 'une ' : 'un ') + name,
        du: vowel ? "de l'" + name : (feminine ? 'de la ' : 'du ') + name,
        au: vowel ? "à l'" + name : (feminine ? 'à la ' : 'au ') + name,
        aux: 'aux ' + plural,
        no: name,
        nos: plural
    };
}

// Liste complète, races de base d'abord
const list = function () {
    let base = readBase();
    let races = Object.keys(base).map(slug => ({
        slug: slug,
        name: baseLabel(slug),
        custom: false,
        stats: Object.fromEntries(STATS.map(s => [s, parseInt(base[slug][s]) || 0])),
        desc: (LANG.card_vars[slug] && LANG.card_vars[slug].desc) || '',
        image: '/img/races/' + slug + '.png'
    }));
    for (let race of readCustom())
        races.push(Object.assign({}, race, {custom: true}));
    return races;
}

// Même forme que raceStats.json, customs comprises (lu par le bot et /persos)
const getStats = function () {
    let stats = readBase();
    for (let race of readCustom())
        stats[race.slug] = Object.assign({}, race.stats, {moral: 0});
    return stats;
}

const nameOf = function (slug) {
    let race = list().find(r => r.slug === slug);
    return race ? race.name : (slug ? baseLabel(slug) : '');
}

// Les races customs dans LANG : description (fiche perso) et formes des cartes
let applied = [];
const applyToLang = function () {
    for (let slug of applied) {
        delete LANG.card_vars[slug];
        delete LANG.card_vars.race[slug];
    }
    applied = [];
    for (let race of readCustom()) {
        LANG.card_vars[race.slug] = {desc: race.desc || ''};
        if (race.inCards !== false)
            LANG.card_vars.race[race.slug] = grammar(race.name, race.plural || race.name + 's', race.feminine);
        applied.push(race.slug);
    }
}

// Création ou modification d'une race custom. Renvoie {race} ou {error}
const save = function (data) {
    let name = String(data.name || '').trim().slice(0, 30);
    if (!name)
        return {error: 'Donne un nom à la race.'};
    let customs = readCustom();
    let slug = data.slug ? String(data.slug) : slugify(name);
    let existing = customs.find(r => r.slug === slug);
    if (!slug)
        return {error: 'Ce nom ne contient aucune lettre utilisable.'};
    if (!existing) {
        if (readBase()[slug] || customs.some(r => r.slug === slug) || LANG.card_vars[slug])
            return {error: 'Une race porte déjà ce nom.'};
        if (Object.keys(readBase()).length + customs.length >= MAX_RACES)
            return {error: 'Discord n\'accepte que ' + MAX_RACES + ' races dans le menu de création : supprime-en une avant d\'en créer une autre.'};
    }
    let race = {
        slug: slug,
        name: name,
        plural: String(data.plural || '').trim().slice(0, 32) || name + 's',
        feminine: !!data.feminine,
        inCards: data.inCards !== false,
        stats: Object.fromEntries(STATS.map(s => [s, clampMod(data.stats && data.stats[s])])),
        desc: escapeHtml(String(data.desc || '').replace(/\s+/g, ' ').trim().slice(0, 600)),
        image: existing ? existing.image : '/img/races/wat.png'
    };
    // Image envoyée par l'éditeur : un PNG déjà redimensionné par le navigateur
    if (data.image && /^data:image\/png;base64,/.test(data.image)) {
        let buffer = Buffer.from(data.image.split(',')[1], 'base64');
        if (buffer.length > 3 * 1024 * 1024)
            return {error: 'Image trop lourde (3 Mo au plus).'};
        fs.writeFileSync(path.join(IMAGE_DIR, slug + '.png'), buffer);
        race.image = '/img/races/' + slug + '.png?v=' + Date.now();
    }
    if (existing)
        customs[customs.indexOf(existing)] = race;
    else
        customs.push(race);
    fs.writeFileSync(CUSTOM_FILE, JSON.stringify(customs, null, 2));
    applyToLang();
    return {race: Object.assign({}, race, {custom: true})};
}

// Suppression d'une race custom (refusée si un personnage la porte encore)
const remove = async function (slug) {
    let customs = readCustom();
    let race = customs.find(r => r.slug === slug);
    if (!race)
        return {error: 'Seules les races customs peuvent être supprimées.'};
    let used = await DB.tables.players.count({where: {race: slug}});
    if (used)
        return {error: 'Un personnage de la partie est ' + race.name + ' : change sa race avant de la supprimer.'};
    fs.writeFileSync(CUSTOM_FILE, JSON.stringify(customs.filter(r => r.slug !== slug), null, 2));
    if (!race.image.startsWith('/img/races/wat.png')) {
        try {
            fs.unlinkSync(path.join(IMAGE_DIR, slug + '.png'));
        }
        catch (e) {}
    }
    applyToLang();
    return {ok: true};
}

module.exports = {list, getStats, nameOf, applyToLang, save, remove, grammar, STATS, MAX_RACES};
