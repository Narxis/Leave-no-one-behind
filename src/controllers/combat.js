const fs = require('fs');
const {Player} = require("../models/player");

// Paliers de dégâts, les mêmes que les jets du menu MJ
const DAMAGE = {
    faible: [1, 4],
    moyen: [5, 8],
    fort: [9, 12]
};
const LOG_SIZE = 20;

// État du combat en cours, gardé en mémoire : il est renvoyé à chaque
// action pour que l'écran de jeu et le menu MJ restent synchronisés
let state = {active: false, enemies: [], log: []};
let nextId = 1;

const rollRange = ([min, max]) => min + Math.floor(Math.random() * (max - min + 1));
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const toInt = (v, def) => Number.isFinite(parseInt(v)) ? parseInt(v) : def;

const getBestiary = function () {
    return JSON.parse(fs.readFileSync(__dirname + '/../config/bestiary.json', 'utf8'));
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
        damage: DAMAGE[raw.damage] ? raw.damage : (base.damage || 'moyen')
    };
}

const findEnemy = function (id) {
    return state.enemies.find(e => e.id === toInt(id, -1));
}

const start = function (data) {
    let enemies = (data.enemies || []).map(makeEnemy);
    state = {active: true, enemies: enemies, log: []};
    return addLog({type: 'start'});
}

const end = function () {
    state.active = false;
    return addLog({type: 'end'});
}

// Le MJ corrige les PV d'un ennemi à la main
const setHp = function (data) {
    let enemy = findEnemy(data.enemy_id);
    if (!enemy)
        return null;
    enemy.hp = clamp(toInt(data.hp, enemy.hp), 0, enemy.maxHp);
    return addLog({type: 'hp', enemy_id: enemy.id, enemy: enemy.name, hp: enemy.hp});
}

// Attaque d'un joueur : son jet de combat habituel (Player.roll) doit
// atteindre la défense de l'ennemi ; plus la marge est grande, plus le
// palier de dégâts est élevé
const playerAttack = async function (data) {
    let enemy = findEnemy(data.enemy_id);
    if (!enemy || enemy.hp <= 0)
        return null;
    let dice = Math.floor(Math.random() * 100) + 1;
    let player = await new Player().getData(data.discord_id);
    let result;
    if (player) {
        result = await player.roll(dice, 'combat');
    }
    else {
        // Personnage absent de la base (page de démo /template-card) :
        // statistiques neutres, même calcul que Player.roll
        player = {discord_id: data.discord_id, name: String(data.name || 'Personnage').slice(0, 40)};
        result = Math.ceil(dice * 50 / 100);
    }
    let hit = result >= enemy.defense;
    let entry = {
        type: 'player-attack',
        discord_id: player.discord_id,
        player: player.name,
        enemy_id: enemy.id,
        enemy: enemy.name,
        dice: dice,
        result: result,
        hit: hit
    };
    if (hit) {
        let margin = result - enemy.defense;
        entry.tier = margin < 15 ? 'faible' : (margin < 30 ? 'moyen' : 'fort');
        entry.damage = rollRange(DAMAGE[entry.tier]);
        enemy.hp = Math.max(0, enemy.hp - entry.damage);
        entry.ko = enemy.hp === 0;
    }
    return addLog(entry);
}

// Attaque d'un ennemi, lancée par le MJ : l'offense est la chance de
// toucher en %. Les dégâts sont affichés, le MJ les applique au joueur
const enemyAttack = function (data) {
    let enemy = findEnemy(data.enemy_id);
    if (!enemy || enemy.hp <= 0)
        return null;
    let dice = Math.floor(Math.random() * 100) + 1;
    let entry = {
        type: 'enemy-attack',
        enemy_id: enemy.id,
        enemy: enemy.name,
        dice: dice,
        hit: dice <= enemy.offense
    };
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
    'combat-attack': playerAttack,
    'combat-enemy-attack': enemyAttack
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

module.exports = {handle, getState, getBestiary, ACTIONS};
