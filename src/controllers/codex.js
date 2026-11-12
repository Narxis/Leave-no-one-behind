// Codex: races, items and statuses of the game, read from the game files
// (races.js, config/items.json, config/statuses.json, config/raceAffinities.json).
//
// Players only see what the crew encountered during the game,
// like a logbook: the crew's races and those named by
// the cards they saw, the items that went through an inventory, the
// statuses suffered. This memory is specific to the game: kept in
// storage/cache/codex.json (a server restart doesn't lose it) and
// cleared on each new game (/persos). The GM sees everything on /codex.
const fs = require('fs');
const path = require('path');
const paths = require('../config/paths');
const races = require('./races');

// Rules wiki site (same address in public/player/player.js)
const WIKI_URL = 'https://narxis.github.io/Leave-no-one-behind-Wiki/';
// Site pages, relative to WIKI_URL. Race and item pages aren't
// published: players discover them here
const WIKI_PAGES = {
    creation: 'regles/creation-personnage/',
    statuses: 'regles/statuts/'
};

const FILE = paths.cache('codex.json');
const itemsFile = require('../config/paths').itemsFile;
const STATUSES_FILE = path.join(__dirname, '../config/statuses.json');
const AFFINITIES_FILE = path.join(__dirname, '../config/raceAffinities.json');
const ITEM_IMAGES = path.join(paths.ROOT, 'public');
// Image sent by the relay (64 KB per message, base64 included)
const IMAGE_MAX = 40 * 1024;
const KINDS = ['races', 'items', 'statuses'];

const readJson = function (file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        return fallback;
    }
};

// Plain text: no HTML tags or entities (race descriptions)
const plain = (text) => String(text || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();

// ---- Game memory ---------------------------------------------------

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

// New game: the crew hasn't encountered anything yet
const reset = function () {
    seen = {races: [], items: [], statuses: []};
    try {
        fs.unlinkSync(FILE);
    } catch (e) {}
};

// Adds what was just encountered; true if something is new
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

// ---- Game content ---------------------------------------------------------

const affinities = () => {
    let data = readJson(AFFINITIES_FILE, {});
    return Array.isArray(data.list) ? data.list : [];
};

// Forms of a race name in the card texts (Fnek, Fneks, Nek-eau…)
const raceForms = function (race) {
    let forms = [race.name, race.plural];
    let grammar = LANG.card_vars.race && LANG.card_vars.race[race.slug];
    if (grammar)
        forms.push(grammar.no, grammar.nos);
    return [...new Set(forms.filter(Boolean))].sort((a, b) => b.length - a.length);
};

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Races of the game named in a text seen by the players
const racesIn = function (text) {
    text = plain(text);
    if (!text)
        return [];
    return races.playable().filter(race => raceForms(race).some(form =>
        new RegExp('(^|[^\\p{L}\\-])' + escapeRegex(form) + '($|[^\\p{L}\\-])', 'iu').test(text)
    )).map(r => r.slug);
};

// Item catalog, plus loot added by hand by the GM (in the database only)
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

// Race sheet. withAll: all its affinities (character creation);
// otherwise only those whose races have all been encountered
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
        // Nothing defined in the game or the wiki for this race
        noAffinity: !all.length,
        moreAffinities: all.length - shown.length
    };
    // Base races: thumbnail shipped with the player page; customs: sent by the GM
    if (race.custom)
        card.imageKey = 'race:' + race.slug;
    else
        card.image = 'img/races/' + race.slug + '.webp';
    return card;
};

// Sheets of the playable races for character creation, with their starting
// items (given to any race whose name starts with the item's,
// like giveAllStarters: the "nek" items go to the four Neks)
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

// ---- What the crew encounters ------------------------------------------

// Survey made on each game change (playerView) and on /codex.
// texts: card texts as the players see them (never the GM's)
const observe = async function (texts) {
    let found = {races: [], items: [], statuses: []};
    if (global.DB) {
        // The crew's races, once creation is finished (not the attempts)
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

// Players' Codex: only what has been encountered
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

// Full GM page: everything, with what the crew has already encountered
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

// Sheet image, as a data URL to go through the relay (null: too
// heavy or missing, the app shows a default image)
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
