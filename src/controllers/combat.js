const fs = require('fs');
const {Player} = require("../models/player");
const allies = require("./allies");

// Paliers de dégâts, les mêmes que les jets du menu MJ
const DAMAGE = {
    faible: [1, 4],
    moyen: [5, 8],
    fort: [9, 12]
};
const LOG_SIZE = 20;
const LOOT_SIZE = 12;

// État du combat en cours, gardé en mémoire : il est renvoyé à chaque
// action pour que l'écran de jeu et le menu MJ restent synchronisés
// pending : attaque désignée par le MJ, en attente du /roll Combat du joueur
// lootRevealed : tous les ennemis sont K.O., leur butin est montré aux joueurs
let state = {active: false, enemies: [], log: [], pending: null, lootRevealed: false};
let nextId = 1;

const rollRange = ([min, max]) => min + Math.floor(Math.random() * (max - min + 1));
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const toInt = (v, def) => Number.isFinite(parseInt(v)) ? parseInt(v) : def;

const getBestiary = function () {
    return JSON.parse(fs.readFileSync(__dirname + '/../config/bestiary.json', 'utf8'));
}

// Objets proposés au MJ pour le butin : tous ceux de items.json
const getLootList = function () {
    let pools = JSON.parse(fs.readFileSync(__dirname + '/../config/items.json', 'utf8'));
    let seen = new Set();
    let list = [];
    for (let item of Object.values(pools).flat()) {
        if (seen.has(item.name.toLowerCase()))
            continue;
        seen.add(item.name.toLowerCase());
        list.push({name: item.name, slug: item.slug, image: item.image ? '/img/items/' + item.image : ''});
    }
    return list;
}

// Butin d'un ennemi : un objet connu (avec son image) ou une saisie libre du MJ
const makeLoot = function (raw) {
    let known = getLootList();
    let items = [];
    for (let entry of (Array.isArray(raw) ? raw : []).slice(0, LOOT_SIZE)) {
        let name = String((entry && entry.name) || entry || '').trim().slice(0, 60);
        if (!name)
            continue;
        let item = known.find(k => k.name.toLowerCase() === name.toLowerCase());
        items.push(item ? Object.assign({}, item) : {name: name, slug: '', image: '', custom: true});
    }
    return items;
}

const getState = function () {
    return JSON.parse(JSON.stringify(state));
}

const addLog = function (entry) {
    entry.at = Date.now();
    state.log.push(entry);
    state.log = state.log.slice(-LOG_SIZE);
    return entry;
}

// Un ennemi vient du bestiaire (par son slug ou son nom) ou d'une saisie libre
const makeEnemy = function (raw) {
    let base = getBestiary().find(b => b.slug === raw.slug || b.name === raw.name) || {};
    let maxHp = clamp(toInt(raw.hp, base.hp || 10), 1, 999);
    return {
        id: nextId++,
        name: String(raw.name || base.name || 'Adversaire').slice(0, 60),
        maxHp: maxHp,
        hp: maxHp,
        offense: clamp(toInt(raw.offense, base.offense || 50), 0, 100),
        defense: clamp(toInt(raw.defense, base.defense || 50), 0, 100),
        damage: DAMAGE[raw.damage] ? raw.damage : (base.damage || 'moyen'),
        loot: makeLoot(raw.loot)
    };
}

const findEnemy = function (id) {
    return state.enemies.find(e => e.id === toInt(id, -1));
}

const start = function (data) {
    let enemies = (data.enemies || []).map(makeEnemy);
    state = {active: true, enemies: enemies, log: [], pending: null, lootRevealed: false};
    return addLog({type: 'start'});
}

const end = function () {
    state.active = false;
    state.pending = null;
    return addLog({type: 'end'});
}

// Quand le dernier ennemi tombe, le butin de tous les ennemis est révélé
const checkVictory = function () {
    if (state.lootRevealed || !state.enemies.length || state.enemies.some(e => e.hp > 0))
        return;
    state.lootRevealed = true;
    let items = state.enemies.flatMap(e => e.loot);
    addLog({type: 'loot', items: items.map(i => i.name)});
}

// Le MJ choisit le butin d'un ennemi (avant ou pendant le combat)
const setLoot = function (data) {
    let enemy = findEnemy(data.enemy_id);
    if (!enemy)
        return null;
    enemy.loot = makeLoot(data.loot);
    return {type: 'set-loot', enemy_id: enemy.id};
}

// Une fois le combat gagné, le MJ distribue le butin : l'objet n° index
// (dans l'ordre affiché, tous ennemis confondus) quitte le butin. Le nom
// évite de prendre un autre objet si la liste a changé entre-temps
const takeLoot = function (index, slug, name) {
    if (!state.lootRevealed)
        return null;
    let i = toInt(index, -1);
    for (let enemy of state.enemies) {
        if (i >= 0 && i < enemy.loot.length) {
            let item = enemy.loot[i];
            if ((slug && item.slug !== slug) || (name && item.name !== name))
                return null;
            return enemy.loot.splice(i, 1)[0];
        }
        i -= enemy.loot.length;
    }
    return null;
}

// Le MJ corrige les PV d'un ennemi à la main
const setHp = function (data) {
    let enemy = findEnemy(data.enemy_id);
    if (!enemy)
        return null;
    enemy.hp = clamp(toInt(data.hp, enemy.hp), 0, enemy.maxHp);
    let entry = addLog({type: 'hp', enemy_id: enemy.id, enemy: enemy.name, hp: enemy.hp});
    checkVictory();
    return entry;
}

// Le MJ désigne l'ennemi visé et le joueur qui attaque ; l'attaque attend
// ensuite le /roll Combat de ce joueur sur Discord
const target = async function (data) {
    let enemy = findEnemy(data.enemy_id);
    if (!state.active || !enemy || enemy.hp <= 0)
        return null;
    let player = await new Player().getData(data.discord_id);
    if (!player)
        return null;
    state.pending = {enemy_id: enemy.id, enemy: enemy.name, discord_id: player.discord_id, player: player.name};
    return addLog(Object.assign({type: 'target'}, state.pending));
}

const cancelTarget = function () {
    let pending = state.pending;
    if (!pending)
        return null;
    state.pending = null;
    return addLog({type: 'target-cancel', enemy: pending.enemy, player: pending.player});
}

// Règle une attaque sur un ennemi : le jet doit atteindre sa défense ;
// plus la marge est grande, plus le palier de dégâts est élevé
const applyAttack = function (attacker, enemy, data) {
    let entry = Object.assign({
        type: 'player-attack',
        enemy_id: enemy.id,
        enemy: enemy.name,
        dice: data.dice_result,
        result: data.result,
        hit: data.result >= enemy.defense
    }, attacker);
    if (entry.hit) {
        let margin = entry.result - enemy.defense;
        entry.tier = margin < 15 ? 'faible' : (margin < 30 ? 'moyen' : 'fort');
        entry.damage = rollRange(DAMAGE[entry.tier]);
        enemy.hp = Math.max(0, enemy.hp - entry.damage);
        entry.ko = enemy.hp === 0;
    }
    addLog(entry);
    checkVictory();
    return {
        action: 'combat',
        error: false,
        data: {state: getState(), event: entry}
    };
}

// Appelé après chaque /roll : si c'est le jet de combat attendu, il règle l'attaque
const resolveRoll = function (roll) {
    let data = roll && roll.data;
    let pending = state.pending;
    if (!state.active || !pending || !data || roll.error)
        return null;
    if (String(data.discord_id) !== String(pending.discord_id) || data.stat !== 'combat' || data.module)
        return null;

    state.pending = null;
    let enemy = findEnemy(pending.enemy_id);
    if (!enemy || enemy.hp <= 0)
        return null;
    return applyAttack({discord_id: pending.discord_id, player: pending.player}, enemy, data);
}

// Un allié (PNJ) n'a pas de Discord : quand le MJ le désigne, le serveur
// lance son dé tout de suite. Renvoie le jet (affiché sur son onglet) puis l'attaque
const allyAttack = function (data) {
    let enemy = findEnemy(data.enemy_id);
    let ally = allies.findAlly(data.ally_id);
    if (!state.active || !enemy || enemy.hp <= 0 || !ally)
        return null;
    state.pending = null;
    let roll = Object.assign({discord_id: 'npc' + ally.id, stat: 'combat', module: ''}, allies.roll(ally, 'combat'));
    return [
        {action: 'roll', error: false, data: roll},
        applyAttack({discord_id: roll.discord_id, player: ally.name, npc: true}, enemy, roll)
    ];
}

// Attaque d'un ennemi, lancée par le MJ : l'offense est la chance de
// toucher en %. Les dégâts sont affichés, le MJ les applique au joueur
// La cible est un joueur (discord_id) ou un compagnon (ally_id) choisi par le MJ
const enemyAttack = async function (data) {
    let enemy = findEnemy(data.enemy_id);
    if (!enemy || enemy.hp <= 0)
        return null;
    let target = {};
    if (data.ally_id !== undefined) {
        let ally = allies.findAlly(data.ally_id);
        if (ally)
            target = {target_id: 'npc' + ally.id, target: ally.name, npc_target: true};
    }
    else if (data.discord_id) {
        let player = await new Player().getData(data.discord_id);
        if (player)
            target = {target_id: String(player.discord_id), target: player.name};
    }
    let dice = Math.floor(Math.random() * 100) + 1;
    let entry = Object.assign({
        type: 'enemy-attack',
        enemy_id: enemy.id,
        enemy: enemy.name,
        dice: dice,
        hit: dice <= enemy.offense
    }, target);
    if (entry.hit) {
        entry.tier = enemy.damage;
        entry.damage = rollRange(DAMAGE[enemy.damage]);
    }
    return addLog(entry);
}

const ACTIONS = {
    'combat-start': start,
    'combat-end': end,
    'combat-hp': setHp,
    'combat-target': target,
    'combat-cancel': cancelTarget,
    'combat-enemy-attack': enemyAttack,
    'combat-loot': setLoot
};

// Point d'entrée des actions websocket « combat-* » : renvoie l'état
// complet et l'événement qui vient de se produire
const handle = async function (response) {
    let action = ACTIONS[response.action];
    let event = action ? await action(response.data || {}) : null;
    return {
        action: 'combat',
        error: false,
        data: {state: getState(), event: event}
    };
}

module.exports = {handle, getState, getBestiary, getLootList, makeLoot, resolveRoll, allyAttack, takeLoot, ACTIONS};
