const fs = require('fs');
const {Player} = require("../models/player");
const allies = require("./allies");
const npcs = require("./npcs");
const loot = require("./loot");
const money = require("./money");

// Damage tiers, the same as the GM menu rolls
const DAMAGE = {
    faible: [1, 4],
    moyen: [5, 8],
    fort: [9, 12]
};
const LOG_SIZE = 20;
const LOOT_SIZE = 12;

// Health points of players and companions: 1 morale point = 10 HP.
// Morale (in the database, or in the companions file) is authoritative; we keep
// only the HP lost below the ten separately (wounds, from 0 to 9), so
// that 3 damage doesn't cost a whole morale point
const HP_PER_MORAL = 10;
const MAX_HP = 100 * HP_PER_MORAL;
let wounds = {};

// Ready-made statuses the GM can set on an enemy, a player or
// a companion, for a number of turns; they can also invent some (name,
// damage per turn, prevents attacking). They act on the next turn
const STATUSES = {
    saignement: {name: 'Saignement', damage: [1, 4]},
    poison: {name: 'Poison', damage: [3, 3]},
    etourdi: {name: 'Étourdi', stun: true}
};
const MAX_STATUS_TURNS = 9;

// Initiative (wiki: regles/combat.md, "Qui commence") chosen by the GM
// at the start of combat:
// - players: they start the combat, they go first;
// - opponents: the players are attacked or surprised;
// - random: heads or tails, unless no player has more than INITIATIVE_MORAL
//   morale (the opponents then go first);
// - manual: the GM sets the order themselves (players then opponents at first).
// Players, then companions on a tie, play from highest morale
// to lowest; on a tie, in order of arrival (P2 before P4)
const INITIATIVE_MORAL = 75;
const INITIATIVE_MODES = ['hasard', 'joueurs', 'adversaires', 'manuel'];

// State of the current combat, kept in memory: it is sent back on each
// action so the game screen and GM menu stay in sync
// pending: attack designated by the GM, waiting for the player's /roll Combat
// lootRevealed: all enemies are K.O., their loot is shown to the players
// turn: turn number, advanced by the GM (statuses act each turn)
// fighters: statuses of players and companions, by id
// order: turn order ({kind: player / ally / enemy, id, name}), current: whose turn it is
let state = {active: false, enemies: [], log: [], pending: null, lootRevealed: false, turn: 1, fighters: {}, order: [], current: 0};
let nextId = 1;

const rollRange = ([min, max]) => min + Math.floor(Math.random() * (max - min + 1));
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const toInt = (v, def) => Number.isFinite(parseInt(v)) ? parseInt(v) : def;

// Enemies prepared in the editor (/bestiaire)
const getBestiary = function () {
    return npcs.getEnemies();
}

// Items offered to the GM for loot: currency, then all those of
// items.json (qty: the quantity suggested by default when added to a loot)
const getLootList = function () {
    let pools = JSON.parse(fs.readFileSync(require('../config/paths').itemsFile(), 'utf8'));
    let coins = money.lootItem(10);
    let seen = new Set([coins.name.toLowerCase()]);
    let list = [coins];
    for (let item of Object.values(pools).flat()) {
        if (seen.has(item.name.toLowerCase()))
            continue;
        seen.add(item.name.toLowerCase());
        list.push({name: item.name, slug: item.slug, image: item.image ? '/img/items/' + item.image : '', qty: loot.qtyOf(item.qty)});
    }
    return list;
}

// Loot of an enemy or a choice: a known item (with its image) or a
// free GM input, in one or more copies (qty)
const makeLoot = function (raw) {
    let known = getLootList();
    let items = [];
    for (let e of (Array.isArray(raw) ? raw : []).slice(0, LOOT_SIZE).map(loot.entry)) {
        if (!e)
            continue;
        // Currency ("Crédits", "monnaie"…) goes into purses, not chests
        if (money.isMoney(e.name)) {
            items.push(money.lootItem(e.qty));
            continue;
        }
        let item = known.find(k => !k.money && k.name.toLowerCase() === e.name.toLowerCase());
        items.push(Object.assign(item ? Object.assign({}, item) : {name: e.name, slug: '', image: '', custom: true}, {qty: e.qty}));
    }
    return items;
}

const lootLabel = (item) => item.qty > 1 ? item.name + ' ×' + item.qty : item.name;

const getState = function () {
    return JSON.parse(JSON.stringify(Object.assign({}, state, {wounds: wounds})));
}

const addLog = function (entry) {
    entry.at = Date.now();
    state.log.push(entry);
    state.log = state.log.slice(-LOG_SIZE);
    return entry;
}

// An enemy comes from the bestiary (by its slug or name) or from free input
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
        loot: makeLoot(raw.loot !== undefined ? raw.loot : base.loot),
        statuses: {}
    };
}

const findEnemy = function (id) {
    return state.enemies.find(e => e.id === toInt(id, -1));
}

// Turn order according to the initiative mode (see INITIATIVE_MODES)
const makeOrder = function (mode, players, allyList, enemies, random = Math.random) {
    let team = players.map((p, i) => ({kind: 'player', id: String(p.discord_id), name: p.name, moral: p.moral, rank: i}))
        .concat(allyList.map((a, i) => ({kind: 'ally', id: 'npc' + a.id, name: a.name, moral: a.moral, rank: players.length + i})));
    if (mode !== 'manuel')
        team.sort((a, b) => (b.moral - a.moral) || (a.rank - b.rank));
    team = team.map(f => ({kind: f.kind, id: f.id, name: f.name}));
    let foes = enemies.map(e => ({kind: 'enemy', id: e.id, name: e.name}));
    let reason = mode;
    if (mode === 'hasard' && !players.some(p => p.moral > INITIATIVE_MORAL))
        reason = 'moral';
    let first = ['joueurs', 'manuel'].includes(reason) ? 'joueurs'
        : (reason === 'hasard' ? (random() < 0.5 ? 'joueurs' : 'adversaires') : 'adversaires');
    return {first: first, reason: reason, order: first === 'joueurs' ? team.concat(foes) : foes.concat(team)};
}

const start = async function (data) {
    let enemies = (data.enemies || []).map(makeEnemy);
    let mode = INITIATIVE_MODES.includes(data.initiative) ? data.initiative : 'hasard';
    let players = await DB.tables.players.findAll({raw: true, order: [['id', 'ASC']]});
    let initiative = makeOrder(mode, players, allies.getAllies(), enemies);
    state = {active: true, enemies: enemies, log: [], pending: null, lootRevealed: false, turn: 1, fighters: {},
        order: initiative.order, current: 0};
    let entry = addLog({type: 'start'});
    addLog({type: 'initiative', first: initiative.first, reason: initiative.reason, order: initiative.order.map(f => f.name)});
    return entry;
}

const orderKey = (f) => f.kind + ':' + f.id;

// A K.O. (or departed) fighter skips their turn
const isDown = async function (f) {
    if (f.kind === 'enemy') {
        let enemy = findEnemy(f.id);
        return !enemy || enemy.hp <= 0;
    }
    let fighter = await findFighter(f.kind === 'ally' ? {ally_id: f.id.slice(3)} : {discord_id: f.id});
    return !fighter || hpOf(fighter) <= 0;
}

// First standing fighter starting from index from (-1: none)
const livingFrom = async function (from) {
    for (let i = from; i < state.order.length; i++)
        if (!(await isDown(state.order[i])))
            return i;
    return -1;
}

// To the next one in the turn order; after the last, the turn passes
// (statuses act) and the order resumes at the first standing one
const nextFighter = async function () {
    if (!state.active || !state.order.length)
        return null;
    let i = await livingFrom(state.current + 1);
    if (i < 0)
        return nextTurn();
    state.current = i;
    // Not in the log: the turn order is enough to show it
    return Object.assign({type: 'next', at: Date.now()}, state.order[i]);
}

// The GM changes the turn order (order: "kind:id" keys in the new
// order) or hands the turn to a fighter (current: their key)
const setOrder = function (data) {
    if (!state.active)
        return null;
    let acting = state.order[state.current];
    if (Array.isArray(data.order)) {
        let rest = new Map(state.order.map(f => [orderKey(f), f]));
        let order = [];
        for (let key of data.order) {
            let f = rest.get(String(key));
            if (f) {
                order.push(f);
                rest.delete(String(key));
            }
        }
        state.order = order.concat([...rest.values()]);
    }
    if (data.current !== undefined)
        acting = state.order.find(f => orderKey(f) === String(data.current)) || acting;
    state.current = Math.max(0, state.order.indexOf(acting));
    return {type: 'order', at: Date.now()};
}

// A newcomer (reinforcement) plays last
const joinOrder = function (f) {
    if (!state.order.some(o => orderKey(o) === orderKey(f)))
        state.order.push(f);
}

// Enemy reinforcement mid-combat: the loot is hidden again until the
// next victory (what wasn't distributed stays in it)
const reinforce = function (data) {
    if (!state.active || !data.enemy)
        return null;
    let enemy = makeEnemy(data.enemy);
    state.enemies.push(enemy);
    joinOrder({kind: 'enemy', id: enemy.id, name: enemy.name});
    state.lootRevealed = false;
    return addLog({type: 'reinforcement', enemy_id: enemy.id, name: enemy.name});
}

// A companion created during combat is announced as an allied reinforcement
const allyJoined = function (ally) {
    if (!state.active)
        return null;
    joinOrder({kind: 'ally', id: 'npc' + ally.id, name: ally.name});
    return {action: 'combat', error: false, data: {state: getState(),
        event: addLog({type: 'reinforcement', name: ally.name, ally: true})}};
}

// Statuses of a fighter: enemy (in its sheet) or player / companion
// (state.fighters, by id: discord_id or "npc<id>"). Each status:
// {name, turns, damage: [min, max] or null, stun: can't attack}
const statusesOf = function (data, create = false) {
    if (data.enemy_id !== undefined) {
        let enemy = findEnemy(data.enemy_id);
        return enemy && enemy.hp > 0 ? enemy.statuses : null;
    }
    let id = data.ally_id !== undefined ? 'npc' + toInt(data.ally_id, -1) : (data.discord_id ? String(data.discord_id) : null);
    if (!id)
        return null;
    if (!state.fighters[id] && create)
        state.fighters[id] = {};
    return state.fighters[id] || null;
}

const isStunned = (statuses) => Object.values(statuses || {}).some(s => s.stun);

const slugify = (name) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Status described by the GM: known (data.status) or custom (name,
// damage per turn, prevents attacking). Returns {key, status} or null
const makeStatus = function (data, statuses) {
    if (STATUSES[data.status]) {
        let base = STATUSES[data.status];
        return {key: data.status, status: {name: base.name, damage: base.damage || null, stun: !!base.stun}};
    }
    let label = String(data.name || '').trim().slice(0, 30);
    if (!label)
        return null;
    let damage = clamp(toInt(data.damage, 0), 0, 99);
    return {
        key: data.status && statuses[data.status] ? data.status : 'c-' + slugify(label),
        status: {name: label, damage: damage > 0 ? [damage, damage] : null, stun: !!data.stun, custom: true}
    };
}

// Status set by an attack that hits (set by the GM before confirming
// the attack): returns {key, name, turns} for the log, or undefined
const applyHitStatus = function (spec, statuses) {
    let made = spec && statuses && makeStatus(spec, statuses);
    if (!made)
        return undefined;
    let turns = clamp(toInt(spec.turns, 3), 1, MAX_STATUS_TURNS);
    statuses[made.key] = Object.assign(made.status, {turns: turns});
    return {key: made.key, name: made.status.name, turns: turns};
}

// The GM sets a status (known or custom) on an enemy, a player or
// a companion, or removes it with 0 turns
const setStatus = async function (data) {
    if (!state.active)
        return null;
    let target = data.target || {};
    let name;
    if (target.enemy_id !== undefined) {
        let enemy = findEnemy(target.enemy_id);
        if (!enemy || enemy.hp <= 0)
            return null;
        name = enemy.name;
    }
    else {
        let fighter = await findFighter(target);
        if (!fighter)
            return null;
        name = fighter.name;
    }
    let statuses = statusesOf(target, true);
    let turns = clamp(toInt(data.turns, 3), 0, MAX_STATUS_TURNS);
    let made = makeStatus(data, statuses);
    if (!made)
        return null;
    let {key, status} = made;
    if (turns > 0)
        statuses[key] = Object.assign(status, {turns: turns});
    else {
        status = statuses[key] || status;
        delete statuses[key];
    }
    return addLog(Object.assign({type: 'status-change', target: name, status: key, name: status.name, turns: turns,
        npc_target: target.ally_id !== undefined}, target));
}

// Next turn: harmful statuses act (enemies, players and
// companions), then each status loses a turn
const nextTurn = async function () {
    if (!state.active)
        return null;
    let ticks = [];
    let extra = [];
    const tick = function (statuses, hurt) {
        let total = 0;
        for (let key of Object.keys(statuses)) {
            let status = statuses[key];
            if (status.damage) {
                let damage = rollRange(status.damage);
                total += damage;
                ticks.push(Object.assign({status: key, name: status.name, damage: damage}, hurt));
            }
            if (--status.turns <= 0)
                delete statuses[key];
        }
        return total;
    };
    for (let enemy of state.enemies) {
        if (enemy.hp <= 0) {
            enemy.statuses = {};
            continue;
        }
        let damage = tick(enemy.statuses, {enemy_id: enemy.id, target: enemy.name});
        if (damage) {
            enemy.hp = Math.max(0, enemy.hp - damage);
            if (enemy.hp === 0) {
                enemy.statuses = {};
                ticks[ticks.length - 1].ko = true;
            }
        }
    }
    for (let id of Object.keys(state.fighters)) {
        let target = id.startsWith('npc') ? {ally_id: toInt(id.slice(3), -1)} : {discord_id: id};
        let fighter = await findFighter(target);
        if (!fighter) {
            delete state.fighters[id];
            continue;
        }
        let damage = tick(state.fighters[id], Object.assign({target_id: id, target: fighter.name, npc_target: !!fighter.ally}));
        if (damage) {
            let hp = hpOf(fighter) - damage;
            extra = extra.concat(await setFighterHp(fighter, hp));
            if (hp <= 0) {
                state.fighters[id] = {};
                ticks[ticks.length - 1].ko = true;
            }
        }
    }
    state.turn++;
    state.current = Math.max(0, await livingFrom(0));
    let entry = addLog({type: 'turn', turn: state.turn, ticks: ticks});
    checkVictory();
    return {entry: entry, extra: extra};
}

const end = function () {
    state.active = false;
    state.pending = null;
    return addLog({type: 'end'});
}

// When the last enemy falls, the loot of all enemies is revealed
const checkVictory = function () {
    if (state.lootRevealed || !state.enemies.length || state.enemies.some(e => e.hp > 0))
        return;
    state.lootRevealed = true;
    let items = state.enemies.flatMap(e => e.loot);
    addLog({type: 'loot', items: items.map(lootLabel)});
}

// The GM chooses an enemy's loot (before or during combat)
const setLoot = function (data) {
    let enemy = findEnemy(data.enemy_id);
    if (!enemy)
        return null;
    enemy.loot = makeLoot(data.loot);
    return {type: 'set-loot', enemy_id: enemy.id};
}

// Once the combat is won, the GM distributes the loot: item no. index
// (in display order, all enemies together) leaves the loot. The name
// avoids taking another item if the list changed in the meantime
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

// The GM fixes an enemy's HP by hand
const setHp = function (data) {
    let enemy = findEnemy(data.enemy_id);
    if (!enemy)
        return null;
    enemy.hp = clamp(toInt(data.hp, enemy.hp), 0, enemy.maxHp);
    let entry = addLog({type: 'hp', enemy_id: enemy.id, enemy: enemy.name, hp: enemy.hp});
    checkVictory();
    return entry;
}

// The GM designates the targeted enemy and the attacking player; the attack then waits
// for that player's /roll Combat on Discord
const target = async function (data) {
    let enemy = findEnemy(data.enemy_id);
    if (!state.active || !enemy || enemy.hp <= 0)
        return null;
    let player = await new Player().getData(data.discord_id);
    // A stunned player (or under a status preventing attacks) skips their turn
    if (!player || isStunned(state.fighters[String(player.discord_id)]))
        return null;
    state.pending = {enemy_id: enemy.id, enemy: enemy.name, discord_id: player.discord_id, player: player.name};
    let entry = addLog(Object.assign({type: 'target'}, state.pending));
    // Status to set if the attack hits, set by the GM with the target
    let s = data.status;
    if (s && typeof s === 'object')
        state.pending.status = {status: String(s.status || ''), name: String(s.name || '').slice(0, 30),
            damage: toInt(s.damage, 0), stun: !!s.stun, turns: toInt(s.turns, 3)};
    return entry;
}

const cancelTarget = function () {
    let pending = state.pending;
    if (!pending)
        return null;
    state.pending = null;
    return addLog({type: 'target-cancel', enemy: pending.enemy, player: pending.player});
}

// Resolves an attack on an enemy: the roll must reach its defense;
// the bigger the margin, the higher the damage tier
const applyAttack = function (attacker, enemy, data, status) {
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
        if (!entry.ko)
            entry.status = applyHitStatus(status, enemy.statuses);
    }
    addLog(entry);
    checkVictory();
    return {
        action: 'combat',
        error: false,
        data: {state: getState(), event: entry}
    };
}

// Called after each /roll: if it is the expected combat roll, it resolves the attack
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
    return applyAttack({discord_id: pending.discord_id, player: pending.player}, enemy, data, pending.status);
}

// An ally (NPC) has no Discord: when the GM designates it, the server
// rolls its die right away. Returns the roll (shown on its tab) then the attack
const allyAttack = function (data) {
    let enemy = findEnemy(data.enemy_id);
    let ally = allies.findAlly(data.ally_id);
    if (!state.active || !enemy || enemy.hp <= 0 || !ally || isStunned(state.fighters['npc' + ally.id]))
        return null;
    state.pending = null;
    let roll = Object.assign({discord_id: 'npc' + ally.id, stat: 'combat', module: ''}, allies.roll(ally, 'combat'));
    return [
        {action: 'roll', error: false, data: roll},
        applyAttack({discord_id: roll.discord_id, player: ally.name, npc: true}, enemy, roll, data.status)
    ];
}

// An enemy's attack, launched by the GM: the offense is the chance to
// hit in %. The damage is shown, the GM applies it to the player
// The target is a player (discord_id) or a companion (ally_id) chosen by the GM
const enemyAttack = async function (data) {
    let enemy = findEnemy(data.enemy_id);
    // A stunned enemy can't attack
    if (!enemy || enemy.hp <= 0 || isStunned(enemy.statuses))
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
    // The GM can force the outcome (hit / miss) and the damage, for example
    // to spare a player. The displayed die stays consistent with the outcome
    let dice = Math.floor(Math.random() * 100) + 1;
    let forced = false;
    if (data.outcome === 'hit' && dice > enemy.offense) {
        dice = enemy.offense > 0 ? rollRange([1, enemy.offense]) : 1;
        forced = true;
    }
    else if (data.outcome === 'miss' && dice <= enemy.offense) {
        dice = enemy.offense < 100 ? rollRange([enemy.offense + 1, 100]) : 100;
        forced = true;
    }
    let entry = Object.assign({
        type: 'enemy-attack',
        enemy_id: enemy.id,
        enemy: enemy.name,
        dice: dice,
        hit: data.outcome === 'hit' || (data.outcome !== 'miss' && dice <= enemy.offense)
    }, target);
    if (entry.hit) {
        entry.tier = enemy.damage;
        let damage = parseInt(data.damage);
        if (Number.isFinite(damage)) {
            entry.damage = clamp(damage, 0, 99);
            forced = true;
        }
        else
            entry.damage = rollRange(DAMAGE[enemy.damage]);
    }
    if (forced)
        entry.forced = true;
    // The damage is taken off the target's HP right away
    let extra = [];
    if (entry.hit && entry.target_id) {
        let fighter = await findFighter(data);
        let hp = fighter ? hpOf(fighter) - entry.damage : 0;
        if (fighter && entry.damage > 0) {
            extra = await setFighterHp(fighter, hp);
            entry.hp = Math.max(0, hp);
        }
        // Status set by the GM with the attack, applied if the target is still standing
        if (fighter && hp > 0 && state.active)
            entry.status = applyHitStatus(data.status, statusesOf(fighter.ally ? {ally_id: fighter.ally.id} : {discord_id: fighter.id}, true));
    }
    return {entry: addLog(entry), extra: extra};
}

// Player (discord_id) or companion (ally_id) whose HP are managed
const findFighter = async function (data) {
    if (data.ally_id !== undefined) {
        let ally = allies.findAlly(data.ally_id);
        return ally ? {id: 'npc' + ally.id, name: ally.name, moral: ally.moral, ally: ally} : null;
    }
    if (!data.discord_id)
        return null;
    let player = await new Player().getData(data.discord_id);
    return player ? {id: String(player.discord_id), name: player.name, moral: player.moral} : null;
}

const hpOf = function (fighter) {
    return Math.max(0, fighter.moral * HP_PER_MORAL - (wounds[fighter.id] || 0));
}

// Sets the HP: morale becomes the number of started tens. Returns
// the messages that update the tabs (player stat or companions)
const setFighterHp = async function (fighter, hp) {
    hp = clamp(Math.round(hp), 0, MAX_HP);
    let moral = Math.ceil(hp / HP_PER_MORAL);
    wounds[fighter.id] = moral * HP_PER_MORAL - hp;
    if (!wounds[fighter.id])
        delete wounds[fighter.id];
    fighter.moral = moral;
    if (fighter.ally)
        return [allies.handle({action: 'ally-update', data: {id: fighter.ally.id, field: 'moral', value: moral}})];
    let player = await new Player().update({moral: moral}, fighter.id);
    if (player)
        delete player['accepted_datas'];
    return [{action: 'playerStat', error: false, data: player}];
}

// The GM sets the HP of a player or companion, at any time
const setPlayerHp = async function (data) {
    let fighter = await findFighter(data);
    if (!fighter)
        return null;
    let before = hpOf(fighter);
    let extra = await setFighterHp(fighter, toInt(data.hp, before));
    let entry = {type: 'player-hp', target_id: fighter.id, target: fighter.name, npc_target: !!fighter.ally,
        hp: hpOf(fighter), change: hpOf(fighter) - before};
    // Outside combat, no log: only the tabs update
    return {entry: state.active ? addLog(entry) : Object.assign({at: Date.now()}, entry), extra: extra};
}

const ACTIONS = {
    'combat-start': start,
    'combat-end': end,
    'combat-hp': setHp,
    'combat-target': target,
    'combat-cancel': cancelTarget,
    'combat-enemy-attack': enemyAttack,
    'combat-loot': setLoot,
    'combat-add': reinforce,
    'combat-status': setStatus,
    'combat-turn': nextTurn,
    'combat-player-hp': setPlayerHp,
    'combat-next': nextFighter,
    'combat-order': setOrder
};

// Entry point of the "combat-*" websocket actions: returns the full
// state and the event that just happened
// An action can also produce other messages ({entry, extra}): the
// HP of a hit player or companion, to update under the card
const handle = async function (response) {
    let action = ACTIONS[response.action];
    let event = action ? await action(response.data || {}) : null;
    let extra = [];
    if (event && event.entry) {
        extra = event.extra || [];
        event = event.entry;
    }
    let payload = {
        action: 'combat',
        error: false,
        data: {state: getState(), event: event}
    };
    return extra.length ? extra.concat([payload]) : payload;
}

module.exports = {handle, getState, getBestiary, getLootList, makeLoot, resolveRoll, allyAttack, allyJoined, takeLoot, makeOrder, ACTIONS, STATUSES, HP_PER_MORAL, MAX_HP};
