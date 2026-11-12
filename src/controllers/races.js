const fs = require('fs');
const path = require('path');

// Playable races: the base ones (config/raceStats.json + lang.json) and the
// custom races created in the editor (/races), kept in
// storage/cache/customRaces.json. The customs are merged into LANG
// (descriptions, "un/le/du…" forms of card texts) at startup and
// on each change.
//
// The GM chooses the game's custom races (/persos): only those
// are playable, mentioned by cards and visible in the players' Codex.

const BASE_FILE = path.join(__dirname, '../config/raceStats.json');
// In the data folder (see config/paths.js)
const paths = require('../config/paths');
const CUSTOM_FILE = paths.cache('customRaces.json');
const IMAGE_DIR = paths.raceImages();
// Allowed custom races, kept across restarts like the game settings
const ALLOWED_FILE = paths.cache('raceSettings.json');
const STATS = ['combat', 'pilotage', 'engineering', 'survival', 'recon'];
// A Discord dropdown offers 25 options at most (race choice in /create)
const MAX_RACES = 25;
// Thumbnail of a custom race for the players' app (a relay message is 64 KB at most)
const THUMB_MAX = 40 * 1024;

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

// Slugs of allowed custom races; null: never set, all are allowed
const readAllowed = function () {
    try {
        let saved = JSON.parse(fs.readFileSync(ALLOWED_FILE, 'utf8'));
        return Array.isArray(saved.allowed) ? saved.allowed.map(String) : null;
    }
    catch (e) {
        return null;
    }
}

const writeAllowed = (allowed) => fs.writeFileSync(ALLOWED_FILE, JSON.stringify({allowed: allowed}, null, 2));

// Race playable in this game: base, or custom checked by the GM
const isAllowed = function (slug) {
    let custom = readCustom().find(r => r.slug === slug);
    if (!custom)
        return Object.prototype.hasOwnProperty.call(readBase(), slug);
    let allowed = readAllowed();
    return !allowed || allowed.includes(slug);
}

// Displayed name of a base race, from its id (nek_eau → Nek-Eau)
const baseLabel = (slug) => slug.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-');

// Id of a custom race: used as image name and key everywhere
const slugify = (name) => String(name).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);

// Forms used by card variables ([un_race_1], [le_race_2]…)
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

// Full list, base races first
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

// Races of the game: base, plus the allowed customs
const playable = function () {
    let allowed = readAllowed();
    return list().filter(r => !r.custom || !allowed || allowed.includes(r.slug));
}

// The GM checks the game's custom races. Returns {allowed}
const setAllowed = function (slugs) {
    let known = readCustom().map(r => r.slug);
    let allowed = [...new Set((Array.isArray(slugs) ? slugs : []).map(String))].filter(s => known.includes(s));
    writeAllowed(allowed);
    applyToLang();
    return {allowed: allowed};
}

// List for the GM: each custom race with its state
const allowedState = function () {
    let allowed = readAllowed();
    return readCustom().map(r => ({slug: r.slug, name: r.name, allowed: !allowed || allowed.includes(r.slug)}));
}

// Same shape as raceStats.json, customs included (read by the bot and /persos)
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

// Custom races in LANG: description (character sheet) and card forms
let applied = [];
const applyToLang = function () {
    for (let slug of applied) {
        delete LANG.card_vars[slug];
        delete LANG.card_vars.race[slug];
    }
    applied = [];
    for (let race of readCustom()) {
        LANG.card_vars[race.slug] = {desc: race.desc || ''};
        if (race.inCards !== false && isAllowed(race.slug))
            LANG.card_vars.race[race.slug] = grammar(race.name, race.plural || race.name + 's', race.feminine);
        applied.push(race.slug);
    }
}

// Creating or editing a custom race. Returns {race} or {error}
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
    // Image sent by the editor: a PNG already resized by the browser
    if (data.image && /^data:image\/png;base64,/.test(data.image)) {
        let buffer = Buffer.from(data.image.split(',')[1], 'base64');
        if (buffer.length > 3 * 1024 * 1024)
            return {error: 'Image trop lourde (3 Mo au plus).'};
        fs.writeFileSync(path.join(IMAGE_DIR, slug + '.png'), buffer);
        race.image = '/img/races/' + slug + '.png?v=' + Date.now();
    }
    // JPEG thumbnail made by the editor: it is what the players' app receives
    if (data.image && /^data:image\/png;base64,/.test(data.image)) {
        try {
            fs.unlinkSync(path.join(IMAGE_DIR, slug + '-thumb.jpg'));
        }
        catch (e) {}
    }
    if (data.image && data.thumb && /^data:image\/jpeg;base64,/.test(data.thumb)) {
        let buffer = Buffer.from(data.thumb.split(',')[1], 'base64');
        if (buffer.length <= THUMB_MAX)
            fs.writeFileSync(path.join(IMAGE_DIR, slug + '-thumb.jpg'), buffer);
    }
    if (existing)
        customs[customs.indexOf(existing)] = race;
    else {
        customs.push(race);
        // New race: allowed by default in the game
        let allowed = readAllowed();
        if (allowed)
            writeAllowed(allowed.concat(slug));
    }
    fs.writeFileSync(CUSTOM_FILE, JSON.stringify(customs, null, 2));
    applyToLang();
    return {race: Object.assign({}, race, {custom: true})};
}

// Deleting a custom race (refused if a character still has it)
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
    try {
        fs.unlinkSync(path.join(IMAGE_DIR, slug + '-thumb.jpg'));
    }
    catch (e) {}
    applyToLang();
    return {ok: true};
}

module.exports = {list, playable, isAllowed, setAllowed, allowedState, getStats, nameOf, applyToLang, save, remove, grammar, STATS, MAX_RACES, THUMB_MAX, IMAGE_DIR};
