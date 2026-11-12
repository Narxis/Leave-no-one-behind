const fs = require('fs');

// Allies (NPCs) created by the GM: they have the same stats as the players and
// show under the card like them. They aren't in the database: we keep them
// in a file so they survive a server restart
// In the data folder (see config/paths.js)
const FILE = require('../config/paths').cache('allies.json');
const STATS = ['combat', 'pilotage', 'engineering', 'survival', 'recon', 'moral'];
const MAX_ALLIES = 6;
// Companion names drawn at random, per race
const NAMES_FILE = require('path').join(__dirname, '../config/companionNames.json');
const races = require('./races');

let allies = [];
let nextId = 1;

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const toInt = (v, def) => Number.isFinite(parseInt(v)) ? parseInt(v) : def;
const cleanText = (v, max) => String(v || '').trim().slice(0, max);

const load = function () {
    try {
        allies = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        nextId = allies.reduce((max, a) => Math.max(max, a.id), 0) + 1;
    } catch (e) {
        allies = [];
    }
}

const save = function () {
    try {
        fs.writeFileSync(FILE, JSON.stringify(allies, null, 2));
    } catch (e) {
        log('[ALLIES] ' + e);
    }
}

const getAllies = function () {
    return JSON.parse(JSON.stringify(allies));
}

const findAlly = function (id) {
    return allies.find(a => a.id === toInt(id, -1));
}

const add = function (data) {
    let name = cleanText(data.name, 20);
    if (!name || allies.length >= MAX_ALLIES)
        return null;
    let ally = {id: nextId++, name: name, race: cleanText(data.race, 30)};
    for (let stat of STATS)
        ally[stat] = clamp(toInt(data[stat], 50), 0, 100);
    allies.push(ally);
    return {type: 'add', id: ally.id};
}

// The GM edits a field: name, role (shown instead of the race) or stat
const update = function (data) {
    let ally = findAlly(data.id);
    if (!ally)
        return null;
    if (data.field === 'name') {
        let name = cleanText(data.value, 20);
        if (name)
            ally.name = name;
    }
    else if (data.field === 'race')
        ally.race = cleanText(data.value, 30);
    else if (STATS.includes(data.field))
        ally[data.field] = clamp(toInt(data.value, ally[data.field]), 0, 100);
    else
        return null;
    return {type: 'update', id: ally.id, field: data.field};
}

const remove = function (data) {
    let ally = findAlly(data.id);
    if (!ally)
        return null;
    allies = allies.filter(a => a !== ally);
    return {type: 'remove', id: ally.id};
}

// Companion drawn with a click: random race (or the requested one), stats
// drawn like a player character (statRolls: 50 + the best or worst
// of |bonus|+1 50-sided dice, morale 100) and name taken from its race's list
const randomCompanion = function (data = {}, random = Math.random) {
    let list = races.list();
    let race = list.find(r => r.slug === data.race) || list[Math.floor(random() * list.length)];
    let ally = {race: race ? race.name : ''};
    for (let stat of STATS) {
        if (stat === 'moral') {
            ally.moral = 100;
            continue;
        }
        let mod = race ? parseInt(race.stats[stat]) || 0 : 0;
        let dice = Array.from({length: Math.abs(mod) + 1}, () => Math.floor(random() * 50) + 1);
        ally[stat] = 50 + (mod > 0 ? Math.max(...dice) : (mod < 0 ? Math.min(...dice) : dice[0]));
    }
    let names = readNames();
    let pool = (race && names[race.slug]) || names.default || [];
    let taken = allies.map(a => a.name.toLowerCase());
    let free = pool.filter(n => !taken.includes(String(n).toLowerCase()));
    let name = (free.length ? free : pool)[Math.floor(random() * (free.length || pool.length))] || 'Compagnon';
    // All names already taken: a number tells them apart
    if (!free.length)
        name = String(name).slice(0, 17) + ' ' + (allies.length + 1);
    ally.name = String(name).slice(0, 20);
    return ally;
}

const readNames = function () {
    try {
        return JSON.parse(fs.readFileSync(NAMES_FILE, 'utf8'));
    } catch (e) {
        return {};
    }
}

const addRandom = (data) => add(randomCompanion(data));

// Same formula as Player.roll for a roll without a module
const roll = function (ally, stat) {
    let dice = Math.floor(Math.random() * 100) + 1;
    let result = Math.ceil(dice * ally[stat] / 100 + (ally.moral - 50) / 4);
    return {dice_result: dice, result: result, success: result >= 50};
}

// Companion roll outside combat, made by the GM: shown like
// a player's (tab under the card, GM panel)
const ROLL_STATS = ['combat', 'pilotage', 'engineering', 'survival', 'recon'];
const rollAction = function (data = {}) {
    let ally = findAlly(data.id);
    if (!ally || !ROLL_STATS.includes(data.stat))
        return {action: 'roll', error: true, error_msg: 'compagnon ou stat inconnu', data: {}};
    return {action: 'roll', error: false,
        data: Object.assign({discord_id: 'npc' + ally.id, name: ally.name, stat: data.stat, module: ''}, roll(ally, data.stat))};
}

const ACTIONS = {
    'ally-add': add,
    'ally-random': addRandom,
    'ally-update': update,
    'ally-remove': remove
};

const handle = function (response) {
    let action = ACTIONS[response.action];
    let event = action ? action(response.data || {}) : null;
    if (event)
        save();
    return {
        action: 'allies',
        error: false,
        data: {allies: getAllies(), event: event}
    };
}

// New team: no more companions
const clear = function () {
    allies = [];
    nextId = 1;
    save();
}

load();

module.exports = {handle, getAllies, clear, findAlly, roll, rollAction, randomCompanion, STATS, ACTIONS};
