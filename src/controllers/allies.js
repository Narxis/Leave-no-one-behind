const fs = require('fs');

// Alliés (PNJ) créés par le MJ : ils ont les mêmes stats que les joueurs et
// s'affichent sous la carte comme eux. Ils ne sont pas en base : on les garde
// dans un fichier pour qu'ils survivent à un redémarrage du serveur
// Dans le dossier de données (voir config/paths.js)
const FILE = require('../config/paths').cache('allies.json');
const STATS = ['combat', 'pilotage', 'engineering', 'survival', 'recon', 'moral'];
const MAX_ALLIES = 6;

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

// Le MJ modifie un champ : nom, rôle (affiché à la place de la race) ou stat
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

// Même formule que Player.roll pour un jet sans module
const roll = function (ally, stat) {
    let dice = Math.floor(Math.random() * 100) + 1;
    let result = Math.ceil(dice * ally[stat] / 100 + (ally.moral - 50) / 4);
    return {dice_result: dice, result: result, success: result >= 50};
}

const ACTIONS = {
    'ally-add': add,
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

// Nouvelle équipe : plus aucun compagnon
const clear = function () {
    allies = [];
    nextId = 1;
    save();
}

load();

module.exports = {handle, getAllies, clear, findAlly, roll, STATS, ACTIONS};
