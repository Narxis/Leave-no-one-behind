const fs = require('fs');
const path = require('path');

// Game settings, chosen by the GM before character creation
// (/parametres). Kept in a file like the leaderboard: the database
// configuration is reset on each server start, the GM's settings
// must survive restarts. Config.hydrateDB applies them on top of
// baseConf.json, the card deck is drawn with them when the game starts
const FILE = require('../config/paths').cache('gameSettings.json');

// Editable settings, with their bounds
const FIELDS = [
    {key: 'planetCount', label: 'Planètes', min: 1, max: 10},
    {key: 'negativeByStep', label: 'Cartes négatives par étape', min: 0, max: 6},
    {key: 'positiveByStep', label: 'Cartes positives par étape', min: 0, max: 6},
    {key: 'neutralByStep', label: 'Cartes neutres par étape', min: 0, max: 6},
    {key: 'placeByStep', label: 'Lieux par étape', min: 0, max: 3}
];

// Maximum deviation of the ship's starting stats when the
// "Vaisseau aléatoire" option is checked (0.1 = ±10%)
const SHIP_START_VARIATION = 0.1;

// Checkbox options, except difficulty (the presets don't touch them).
// Missing from older saved settings: default value
const OPTIONS = [
    {key: 'clearStatusesAfterPlanet', label: 'Retirer les statuts après une planète', default: true,
        hint: 'Blackout, Anticipation, Affaibli et Recherché sont remis à zéro en reprenant le voyage. Sinon ils continuent de baisser d\'un à chaque carte.'},
    {key: 'randomShipStats', label: 'Vaisseau aléatoire', default: false,
        hint: 'Les modules du vaisseau démarrent à une valeur tirée au hasard entre ' + Math.round(100 * (1 - SHIP_START_VARIATION))
            + ' et 100 % (±' + Math.round(SHIP_START_VARIATION * 100) + ' %, plafonné à 100 %) au lieu de 100 %.'},
    {key: 'otherChoice', label: 'Choix « Autre… » sur les cartes', default: true,
        hint: 'Les cartes à choix (sans chrono) proposent aussi « Autre… » : les joueurs décrivent une action libre et le MJ écrit la suite dans une carte blanche, depuis son menu.'}
];

// Difficulty presets. Normal uses the values of baseConf.json
const PRESETS = [
    {slug: 'facile', name: 'Facile', values: {planetCount: 3, negativeByStep: 1, positiveByStep: 2, neutralByStep: 2, placeByStep: 1}},
    {slug: 'normal', name: 'Normal', values: {planetCount: 3, negativeByStep: 2, positiveByStep: 2, neutralByStep: 2, placeByStep: 1}},
    {slug: 'difficile', name: 'Difficile', values: {planetCount: 3, negativeByStep: 3, positiveByStep: 1, neutralByStep: 2, placeByStep: 1}}
];
const CUSTOM = {slug: 'perso', name: 'Personnalisé'};
const DEFAULT = 'normal';

let saved = null;

const load = function () {
    try {
        let raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        saved = clean(raw);
    } catch (e) {
        saved = null;
    }
}

const save = function () {
    try {
        fs.writeFileSync(FILE, JSON.stringify(saved, null, 2));
    } catch (e) {
        log('[SETTINGS] ' + e);
    }
}

const clamp = (v, field) => Math.min(field.max, Math.max(field.min, Math.round(v)));

// Clamped values; null if a value is missing or isn't a number
const clean = function (input) {
    if (!input || typeof input !== 'object')
        return null;
    let values = {};
    for (let field of FIELDS) {
        let v = Number(input[field.key]);
        if (input[field.key] === '' || input[field.key] === null || !Number.isFinite(v))
            return null;
        values[field.key] = clamp(v, field);
    }
    for (let option of OPTIONS) {
        let v = input[option.key];
        values[option.key] = (v === undefined || v === null) ? option.default : (v === true || v === 'true' || v === 'on' || v === 1);
    }
    return values;
}

// Preset whose values are exactly these, otherwise "Personnalisé"
const presetOf = function (values) {
    let found = PRESETS.find(p => FIELDS.every(f => p.values[f.key] === values[f.key]));
    return found ? {slug: found.slug, name: found.name} : Object.assign({}, CUSTOM);
}

// Current settings: the GM's, otherwise the Normal preset
const get = function () {
    let values = Object.assign({}, saved || clean(PRESETS.find(p => p.slug === DEFAULT).values));
    return Object.assign(values, {preset: presetOf(values)});
}

// Values to write into the configuration (stored as text, like baseConf.json)
const asConfig = function () {
    if (!saved)
        return {};
    return Object.fromEntries(FIELDS.map(f => [f.key, String(saved[f.key])]));
}

// Saves the GM's settings and applies them to the current configuration
const set = async function (input) {
    let values = clean(input);
    if (!values)
        return {error: 'Réglages incomplets : chaque valeur doit être un nombre.'};
    saved = values;
    save();
    if (global.CONFIG) {
        for (let [key, val] of Object.entries(asConfig()))
            await CONFIG.upsert(key, val);
    }
    return get();
}

// Number of cards of each type in the game, to warn the GM when
// a game asks for more than exist (the extra steps get fewer).
// Read from baseCards.json, which the game launch reloads into the database.
// Only places marked "start" open a place, the others follow from them
const available = function () {
    try {
        let cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/baseCards.json'), 'utf8'));
        let count = (type) => Object.values(cards[type] || {}).length;
        return {
            negativeByStep: count('negative'),
            positiveByStep: count('positive'),
            neutralByStep: count('neutral'),
            placeByStep: Object.values(cards.place || {}).filter(c => c.start).length
        };
    } catch (e) {
        return {};
    }
}

load();

module.exports = {FIELDS, OPTIONS, PRESETS, SHIP_START_VARIATION, get, set, asConfig, available, presetOf};
