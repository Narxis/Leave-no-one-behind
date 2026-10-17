const fs = require('fs');
const path = require('path');

// Paramètres d'une partie, choisis par le MJ avant la création des persos
// (/parametres). Gardés dans un fichier comme le classement : la configuration
// en base est remise à zéro à chaque démarrage du serveur, les réglages du MJ
// doivent survivre aux redémarrages. Config.hydrateDB les applique par-dessus
// baseConf.json, le paquet de cartes est tiré avec au lancement de la partie
const FILE = require('../config/paths').cache('gameSettings.json');

// Réglages modifiables, avec leurs bornes
const FIELDS = [
    {key: 'planetCount', label: 'Planètes', min: 1, max: 10},
    {key: 'negativeByStep', label: 'Cartes négatives par étape', min: 0, max: 6},
    {key: 'positiveByStep', label: 'Cartes positives par étape', min: 0, max: 6},
    {key: 'neutralByStep', label: 'Cartes neutres par étape', min: 0, max: 6},
    {key: 'placeByStep', label: 'Lieux par étape', min: 0, max: 3}
];

// Options à cocher, hors difficulté (les préréglages n'y touchent pas).
// Absente d'anciens réglages enregistrés : valeur par défaut
const OPTIONS = [
    {key: 'clearStatusesAfterPlanet', label: 'Retirer les statuts après une planète', default: true,
        hint: 'Blackout, Anticipation, Affaibli et Recherché sont remis à zéro en reprenant le voyage. Sinon ils continuent de baisser d\'un à chaque carte.'}
];

// Préréglages de difficulté. Normal reprend les valeurs de baseConf.json
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

// Valeurs bornées ; null si une valeur manque ou n'est pas un nombre
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

// Préréglage dont les valeurs sont exactement celles-ci, sinon « Personnalisé »
const presetOf = function (values) {
    let found = PRESETS.find(p => FIELDS.every(f => p.values[f.key] === values[f.key]));
    return found ? {slug: found.slug, name: found.name} : Object.assign({}, CUSTOM);
}

// Réglages en cours : ceux du MJ, sinon le préréglage Normal
const get = function () {
    let values = Object.assign({}, saved || clean(PRESETS.find(p => p.slug === DEFAULT).values));
    return Object.assign(values, {preset: presetOf(values)});
}

// Valeurs à écrire dans la configuration (stockée en texte, comme baseConf.json)
const asConfig = function () {
    if (!saved)
        return {};
    return Object.fromEntries(FIELDS.map(f => [f.key, String(saved[f.key])]));
}

// Enregistre les réglages du MJ et les applique à la configuration en cours
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

// Nombre de cartes de chaque type dans le jeu, pour prévenir le MJ quand
// une partie en demande plus qu'il n'en existe (les étapes en trop en ont moins).
// Lu dans baseCards.json, que le lancement de la partie recharge en base.
// Seuls les lieux marqués « start » ouvrent un lieu, les autres en sont la suite
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

module.exports = {FIELDS, OPTIONS, PRESETS, get, set, asConfig, available, presetOf};
