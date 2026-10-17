const fs = require('fs');
const {Player} = require("../models/player");
const allies = require("./allies");
const npcs = require("./npcs");
const loot = require("./loot");

// Paliers de dégâts, les mêmes que les jets du menu MJ
const DAMAGE = {
    faible: [1, 4],
    moyen: [5, 8],
    fort: [9, 12]
};
const LOG_SIZE = 20;
const LOOT_SIZE = 12;

// Points de vie des joueurs et compagnons : 1 point de moral = 10 PV.
// Le moral (en base, ou dans le fichier des compagnons) fait foi ; on garde
// seulement à part les PV perdus sous la dizaine (wounds, de 0 à 9), pour
// que 3 dégâts ne fassent pas perdre un point de moral entier
const HP_PER_MORAL = 10;
const MAX_HP = 100 * HP_PER_MORAL;
let wounds = {};

// Statuts prêts à l'emploi que le MJ peut poser sur un ennemi, un joueur ou
// un compagnon, pour un nombre de tours ; il peut aussi en inventer (nom,
// dégâts par tour, empêche d'attaquer). Ils agissent au tour suivant
const STATUSES = {
    saignement: {name: 'Saignement', damage: [1, 4]},
    poison: {name: 'Poison', damage: [3, 3]},
    etourdi: {name: 'Étourdi', stun: true}
};
const MAX_STATUS_TURNS = 9;

// Initiative (wiki : regles/combat.md, « Qui commence ») choisie par le MJ
// au début du combat :
// - joueurs : ils lancent le combat, ils commencent ;
// - adversaires : les joueurs sont attaqués ou surpris ;
// - hasard : pile ou face, sauf si aucun joueur n'a plus de INITIATIVE_MORAL
//   de moral (les adversaires commencent alors) ;
// - manuel : le MJ range lui-même l'ordre (joueurs puis adversaires au départ).
// Les joueurs, puis les compagnons à égalité, jouent du moral le plus haut
// au plus bas ; à égalité, dans l'ordre d'arrivée (P2 avant P4)
const INITIATIVE_MORAL = 75;
const INITIATIVE_MODES = ['hasard', 'joueurs', 'adversaires', 'manuel'];

// État du combat en cours, gardé en mémoire : il est renvoyé à chaque
// action pour que l'écran de jeu et le menu MJ restent synchronisés
// pending : attaque désignée par le MJ, en attente du /roll Combat du joueur
// lootRevealed : tous les ennemis sont K.O., leur butin est montré aux joueurs
// turn : numéro du tour, avancé par le MJ (les statuts agissent à chaque tour)
// fighters : statuts des joueurs et compagnons, par id
// order : ordre de jeu ({kind: player / ally / enemy, id, name}), current : à qui le tour
let state = {active: false, enemies: [], log: [], pending: null, lootRevealed: false, turn: 1, fighters: {}, order: [], current: 0};
let nextId = 1;

const rollRange = ([min, max]) => min + Math.floor(Math.random() * (max - min + 1));
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const toInt = (v, def) => Number.isFinite(parseInt(v)) ? parseInt(v) : def;

// Ennemis préparés dans l'éditeur (/bestiaire)
const getBestiary = function () {
    return npcs.getEnemies();
}

// Objets proposés au MJ pour le butin : tous ceux de items.json (qty : la
// quantité proposée d'office quand on l'ajoute à un butin)
const getLootList = function () {
    let pools = JSON.parse(fs.readFileSync(__dirname + '/../config/items.json', 'utf8'));
    let seen = new Set();
    let list = [];
    for (let item of Object.values(pools).flat()) {
        if (seen.has(item.name.toLowerCase()))
            continue;
        seen.add(item.name.toLowerCase());
        list.push({name: item.name, slug: item.slug, image: item.image ? '/img/items/' + item.image : '', qty: loot.qtyOf(item.qty)});
    }
    return list;
}

// Butin d'un ennemi ou d'un choix : un objet connu (avec son image) ou une
// saisie libre du MJ, en un ou plusieurs exemplaires (qty)
const makeLoot = function (raw) {
    let known = getLootList();
    let items = [];
    for (let e of (Array.isArray(raw) ? raw : []).slice(0, LOOT_SIZE).map(loot.entry)) {
        if (!e)
            continue;
        let item = known.find(k => k.name.toLowerCase() === e.name.toLowerCase());
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
        loot: makeLoot(raw.loot !== undefined ? raw.loot : base.loot),
        statuses: {}
    };
}

const findEnemy = function (id) {
    return state.enemies.find(e => e.id === toInt(id, -1));
}

// Ordre de jeu selon le mode d'initiative (voir INITIATIVE_MODES)
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

// Un combattant K.O. (ou parti) passe son tour
const isDown = async function (f) {
    if (f.kind === 'enemy') {
        let enemy = findEnemy(f.id);
        return !enemy || enemy.hp <= 0;
    }
    let fighter = await findFighter(f.kind === 'ally' ? {ally_id: f.id.slice(3)} : {discord_id: f.id});
    return !fighter || hpOf(fighter) <= 0;
}

// Premier combattant debout à partir de l'index from (-1 : aucun)
const livingFrom = async function (from) {
    for (let i = from; i < state.order.length; i++)
        if (!(await isDown(state.order[i])))
            return i;
    return -1;
}

// Au suivant dans l'ordre de jeu ; après le dernier, le tour passe
// (les statuts agissent) et l'ordre reprend au premier debout
const nextFighter = async function () {
    if (!state.active || !state.order.length)
        return null;
    let i = await livingFrom(state.current + 1);
    if (i < 0)
        return nextTurn();
    state.current = i;
    // Pas dans le journal : l'ordre de jeu suffit à le montrer
    return Object.assign({type: 'next', at: Date.now()}, state.order[i]);
}

// Le MJ change l'ordre de jeu (order : clés « kind:id » dans le nouvel
// ordre) ou donne la main à un combattant (current : sa clé)
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

// Un nouveau venu (renfort) joue en dernier
const joinOrder = function (f) {
    if (!state.order.some(o => orderKey(o) === orderKey(f)))
        state.order.push(f);
}

// Renfort ennemi en plein combat : le butin redevient caché jusqu'à la
// nouvelle victoire (ce qui n'a pas été distribué reste dedans)
const reinforce = function (data) {
    if (!state.active || !data.enemy)
        return null;
    let enemy = makeEnemy(data.enemy);
    state.enemies.push(enemy);
    joinOrder({kind: 'enemy', id: enemy.id, name: enemy.name});
    state.lootRevealed = false;
    return addLog({type: 'reinforcement', enemy_id: enemy.id, name: enemy.name});
}

// Un compagnon créé pendant le combat est annoncé comme renfort allié
const allyJoined = function (ally) {
    if (!state.active)
        return null;
    joinOrder({kind: 'ally', id: 'npc' + ally.id, name: ally.name});
    return {action: 'combat', error: false, data: {state: getState(),
        event: addLog({type: 'reinforcement', name: ally.name, ally: true})}};
}

// Statuts d'un combattant : ennemi (dans sa fiche) ou joueur / compagnon
// (state.fighters, par id : discord_id ou « npc<id> »). Chaque statut :
// {name, turns, damage: [min, max] ou null, stun: ne peut pas attaquer}
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

// Statut décrit par le MJ : connu (data.status) ou personnalisé (nom,
// dégâts par tour, empêche d'attaquer). Renvoie {key, status} ou null
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

// Statut posé par une attaque qui touche (réglé par le MJ avant de valider
// l'attaque) : renvoie {key, name, turns} pour le journal, ou undefined
const applyHitStatus = function (spec, statuses) {
    let made = spec && statuses && makeStatus(spec, statuses);
    if (!made)
        return undefined;
    let turns = clamp(toInt(spec.turns, 3), 1, MAX_STATUS_TURNS);
    statuses[made.key] = Object.assign(made.status, {turns: turns});
    return {key: made.key, name: made.status.name, turns: turns};
}

// Le MJ pose un statut (connu ou personnalisé) sur un ennemi, un joueur ou
// un compagnon, ou le retire avec 0 tour
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

// Tour suivant : les statuts qui blessent agissent (ennemis, joueurs et
// compagnons), puis chaque statut perd un tour
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

// Quand le dernier ennemi tombe, le butin de tous les ennemis est révélé
const checkVictory = function () {
    if (state.lootRevealed || !state.enemies.length || state.enemies.some(e => e.hp > 0))
        return;
    state.lootRevealed = true;
    let items = state.enemies.flatMap(e => e.loot);
    addLog({type: 'loot', items: items.map(lootLabel)});
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
    // Un joueur étourdi (ou sous un statut qui empêche d'attaquer) passe son tour
    if (!player || isStunned(state.fighters[String(player.discord_id)]))
        return null;
    state.pending = {enemy_id: enemy.id, enemy: enemy.name, discord_id: player.discord_id, player: player.name};
    let entry = addLog(Object.assign({type: 'target'}, state.pending));
    // Statut à poser si l'attaque touche, réglé par le MJ avec la cible
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

// Règle une attaque sur un ennemi : le jet doit atteindre sa défense ;
// plus la marge est grande, plus le palier de dégâts est élevé
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
    return applyAttack({discord_id: pending.discord_id, player: pending.player}, enemy, data, pending.status);
}

// Un allié (PNJ) n'a pas de Discord : quand le MJ le désigne, le serveur
// lance son dé tout de suite. Renvoie le jet (affiché sur son onglet) puis l'attaque
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

// Attaque d'un ennemi, lancée par le MJ : l'offense est la chance de
// toucher en %. Les dégâts sont affichés, le MJ les applique au joueur
// La cible est un joueur (discord_id) ou un compagnon (ally_id) choisi par le MJ
const enemyAttack = async function (data) {
    let enemy = findEnemy(data.enemy_id);
    // Un ennemi étourdi ne peut pas attaquer
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
    // Le MJ peut imposer l'issue (touché / raté) et les dégâts, par exemple
    // pour épargner un joueur. Le dé affiché reste cohérent avec l'issue
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
    // Les dégâts sont retirés tout de suite des PV de la cible
    let extra = [];
    if (entry.hit && entry.target_id) {
        let fighter = await findFighter(data);
        let hp = fighter ? hpOf(fighter) - entry.damage : 0;
        if (fighter && entry.damage > 0) {
            extra = await setFighterHp(fighter, hp);
            entry.hp = Math.max(0, hp);
        }
        // Statut réglé par le MJ avec l'attaque, posé si la cible tient debout
        if (fighter && hp > 0 && state.active)
            entry.status = applyHitStatus(data.status, statusesOf(fighter.ally ? {ally_id: fighter.ally.id} : {discord_id: fighter.id}, true));
    }
    return {entry: addLog(entry), extra: extra};
}

// Joueur (discord_id) ou compagnon (ally_id) dont on gère les PV
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

// Fixe les PV : le moral devient le nombre de dizaines entamées. Renvoie
// les messages qui mettent à jour les onglets (stat du joueur ou compagnons)
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

// Le MJ fixe les PV d'un joueur ou d'un compagnon, à tout moment
const setPlayerHp = async function (data) {
    let fighter = await findFighter(data);
    if (!fighter)
        return null;
    let before = hpOf(fighter);
    let extra = await setFighterHp(fighter, toInt(data.hp, before));
    let entry = {type: 'player-hp', target_id: fighter.id, target: fighter.name, npc_target: !!fighter.ally,
        hp: hpOf(fighter), change: hpOf(fighter) - before};
    // Hors combat, pas de journal : seuls les onglets se mettent à jour
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

// Point d'entrée des actions websocket « combat-* » : renvoie l'état
// complet et l'événement qui vient de se produire
// Une action peut aussi produire d'autres messages ({entry, extra}) : les
// PV d'un joueur ou d'un compagnon touché, à mettre à jour sous la carte
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
