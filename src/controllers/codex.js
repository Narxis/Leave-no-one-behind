// Codex : races, objets et statuts du jeu, lus dans les fichiers du jeu
// (races.js, config/items.json, config/statuses.json, config/raceAffinities.json).
//
// Les joueurs ne voient que ce que l'équipage a rencontré pendant la partie,
// comme un journal de bord : les races de l'équipage et celles nommées par
// les cartes qu'ils ont vues, les objets passés dans un inventaire, les
// statuts subis. Cette mémoire est propre à la partie : gardée dans
// storage/cache/codex.json (un redémarrage du serveur ne la perd pas) et
// vidée à chaque nouvelle partie (/persos). Le MJ voit tout sur /codex.
const fs = require('fs');
const path = require('path');
const paths = require('../config/paths');
const races = require('./races');

// Site du wiki des règles (même adresse dans public/player/player.js)
const WIKI_URL = 'https://narxis.github.io/Leave-no-one-behind-Wiki/';
// Pages du site, relatives à WIKI_URL. Les pages des races et des objets ne
// sont pas publiées : les joueurs les découvrent ici
const WIKI_PAGES = {
    creation: 'regles/creation-personnage/',
    statuses: 'regles/statuts/'
};

const FILE = paths.cache('codex.json');
const itemsFile = require('../config/paths').itemsFile;
const STATUSES_FILE = path.join(__dirname, '../config/statuses.json');
const AFFINITIES_FILE = path.join(__dirname, '../config/raceAffinities.json');
const ITEM_IMAGES = path.join(paths.ROOT, 'public');
// Image envoyée par le relais (64 Ko par message, base64 compris)
const IMAGE_MAX = 40 * 1024;
const KINDS = ['races', 'items', 'statuses'];

const readJson = function (file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        return fallback;
    }
};

// Texte brut : sans balises ni entités HTML (descriptions des races)
const plain = (text) => String(text || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();

// ---- Mémoire de la partie ---------------------------------------------------

let seen = null;

const load = function () {
    if (seen)
        return seen;
    let saved = readJson(FILE, {});
    seen = {};
    for (let kind of KINDS)
        seen[kind] = Array.isArray(saved[kind]) ? saved[kind].map(String) : [];
    return seen;
};

const save = function () {
    try {
        fs.writeFileSync(FILE, JSON.stringify(seen, null, 2));
    } catch (e) {
        log('[CODEX] ' + e);
    }
};

// Nouvelle partie : l'équipage n'a encore rien rencontré
const reset = function () {
    seen = {races: [], items: [], statuses: []};
    try {
        fs.unlinkSync(FILE);
    } catch (e) {}
};

// Ajoute ce qui vient d'être rencontré ; true si quelque chose est nouveau
const remember = function (found) {
    load();
    let changed = false;
    for (let kind of KINDS)
        for (let slug of found[kind] || []) {
            slug = String(slug);
            if (slug && !seen[kind].includes(slug)) {
                seen[kind].push(slug);
                changed = true;
            }
        }
    if (changed)
        save();
    return changed;
};

const known = () => structuredClone(load());

// ---- Contenu du jeu ---------------------------------------------------------

const affinities = () => {
    let data = readJson(AFFINITIES_FILE, {});
    return Array.isArray(data.list) ? data.list : [];
};

// Formes d'un nom de race dans les textes des cartes (Fnek, Fneks, Nek-eau…)
const raceForms = function (race) {
    let forms = [race.name, race.plural];
    let grammar = LANG.card_vars.race && LANG.card_vars.race[race.slug];
    if (grammar)
        forms.push(grammar.no, grammar.nos);
    return [...new Set(forms.filter(Boolean))].sort((a, b) => b.length - a.length);
};

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Races de la partie nommées dans un texte vu par les joueurs
const racesIn = function (text) {
    text = plain(text);
    if (!text)
        return [];
    return races.playable().filter(race => raceForms(race).some(form =>
        new RegExp('(^|[^\\p{L}\\-])' + escapeRegex(form) + '($|[^\\p{L}\\-])', 'iu').test(text)
    )).map(r => r.slug);
};

// Catalogue des objets, plus les butins ajoutés à la main par le MJ (en base seulement)
const itemCatalog = async function () {
    let items = new Map();
    for (let [pool, list] of Object.entries(readJson(itemsFile(), {})))
        for (let item of list)
            items.set(item.slug, {slug: item.slug, name: item.name, desc: item.desc || '', type: item.type || '', rarity: item.rarity || '', pool: pool,
                race: item.race || '', image: item.image ? '/img/items/' + item.image : ''});
    if (global.DB)
        for (let row of await DB.tables.items.findAll({raw: true}))
            if (!items.has(row.slug))
                items.set(row.slug, {slug: row.slug, name: row.name, desc: row.desc || '', type: '', rarity: '', pool: row.pool || '', race: row.race || '', image: row.image || ''});
    return [...items.values()];
};

const statusCatalog = () => readJson(STATUSES_FILE, []).map(s => ({slug: s.slug, name: s.name, desc: s.desc || ''}));

// Fiche d'une race. withAll : toutes ses affinités (création du perso) ;
// sinon seulement celles dont toutes les races ont été rencontrées
const raceCard = function (race, seenRaces) {
    let all = affinities().filter(a => a.races.includes(race.slug));
    let shown = seenRaces ? all.filter(a => a.races.every(r => seenRaces.includes(r))) : all;
    let card = {
        slug: race.slug,
        name: race.name,
        custom: !!race.custom,
        desc: plain(race.desc),
        stats: race.stats,
        affinities: shown.map(a => a.text),
        // Rien de défini dans le jeu ni dans le wiki pour cette race
        noAffinity: !all.length,
        moreAffinities: all.length - shown.length
    };
    // Races de base : vignette livrée avec la page joueur ; customs : envoyée par le MJ
    if (race.custom)
        card.imageKey = 'race:' + race.slug;
    else
        card.image = 'img/races/' + race.slug + '.webp';
    return card;
};

// Fiches des races jouables pour la création du perso, avec leurs objets de
// départ (donnés à toute race dont le nom commence par celui de l'objet,
// comme giveAllStarters : les objets « nek » vont aux quatre Neks)
const creationCards = async function () {
    let starters = (await itemCatalog()).filter(i => i.pool === 'starter' && i.race);
    return races.playable().map(r => Object.assign(raceCard(r), {
        starterItems: starters.filter(i => r.slug.startsWith(i.race)).map(i => ({name: i.name, desc: plain(i.desc)}))
    }));
};

const itemCard = (item) => ({
    slug: item.slug, name: item.name, desc: plain(item.desc), type: item.type, rarity: item.rarity,
    race: item.race ? races.nameOf(item.race) : '',
    imageKey: item.image ? 'item:' + item.slug : null
});

const statusCard = (status) => ({slug: status.slug, name: status.name, desc: plain(status.desc), link: WIKI_URL + WIKI_PAGES.statuses});

// ---- Ce que l'équipage rencontre ------------------------------------------

// Relevé fait à chaque changement du jeu (playerView) et sur /codex.
// texts : textes de la carte tels que les joueurs les voient (jamais ceux du MJ)
const observe = async function (texts) {
    let found = {races: [], items: [], statuses: []};
    if (global.DB) {
        // Races de l'équipage, une fois la création finie (pas les essais)
        if (CONFIG.gameState !== 'creation')
            for (let p of await DB.tables.players.findAll({raw: true}))
                if (p.race && races.isAllowed(p.race))
                    found.races.push(p.race);
        for (let row of await DB.tables.items.findAll({raw: true}))
            if (row.owners || row.quantity > 0)
                found.items.push(row.slug);
        for (let s of await DB.tables.statuses.findAll({raw: true}))
            if (s.duration > 0)
                found.statuses.push(s.slug);
    }
    for (let text of texts || [])
        found.races.push(...racesIn(text));
    return remember(found);
};

// Codex des joueurs : seulement ce qui a été rencontré
const forPlayers = async function () {
    let memory = load();
    let raceList = races.playable();
    let items = await itemCatalog();
    let statuses = statusCatalog();
    return {
        kind: 'codex',
        wiki: WIKI_URL,
        races: raceList.filter(r => memory.races.includes(r.slug)).map(r => raceCard(r, memory.races)),
        items: items.filter(i => memory.items.includes(i.slug)).map(itemCard).sort((a, b) => a.name.localeCompare(b.name)),
        statuses: statuses.filter(s => memory.statuses.includes(s.slug)).map(statusCard),
        totals: {races: raceList.length, items: items.length, statuses: statuses.length}
    };
};

// Page complète du MJ : tout, avec ce que l'équipage a déjà rencontré
const forGm = async function () {
    let memory = load();
    let items = await itemCatalog();
    return {
        wiki: WIKI_URL,
        affinitySource: readJson(AFFINITIES_FILE, {}).source || '',
        races: races.list().map(r => Object.assign(raceCard(r), {
            image: r.image, seen: memory.races.includes(r.slug), allowed: races.isAllowed(r.slug)
        })),
        items: items.map(i => Object.assign(itemCard(i), {image: i.image, pool: i.pool, seen: memory.items.includes(i.slug)}))
            .sort((a, b) => a.name.localeCompare(b.name)),
        statuses: statusCatalog().map(s => Object.assign(statusCard(s), {
            seen: memory.statuses.includes(s.slug),
            icon: fs.existsSync(path.join(paths.ROOT, 'public/views/svg', s.slug + '.ejs'))
        }))
    };
};

// Image d'une fiche, en data URL pour passer par le relais (null : trop
// lourde ou absente, l'app affiche une image par défaut)
const imageData = async function (key) {
    let [kind, slug] = String(key).split(':');
    let file = null, type = 'image/png';
    if (kind === 'race') {
        let thumb = path.join(races.IMAGE_DIR, slug + '-thumb.jpg');
        if (fs.existsSync(thumb)) {
            file = thumb;
            type = 'image/jpeg';
        }
        else
            file = path.join(races.IMAGE_DIR, slug + '.png');
    }
    else if (kind === 'item') {
        let item = (await itemCatalog()).find(i => i.slug === slug);
        if (item && /^\/img\/items\/[\w.-]+\.png$/.test(item.image))
            file = path.join(ITEM_IMAGES, item.image);
    }
    try {
        let buffer = fs.readFileSync(file);
        return buffer.length <= IMAGE_MAX ? 'data:' + type + ';base64,' + buffer.toString('base64') : null;
    } catch (e) {
        return null;
    }
};

module.exports = {WIKI_URL, WIKI_PAGES, observe, remember, reset, known, racesIn, raceCard, creationCards, forPlayers, forGm, imageData, IMAGE_MAX};
