// Vue joueur : ce que le MJ envoie aux joueurs en ligne, par le relais.
//
// Après chaque action du jeu (tout passe par le WebSocket du MJ), l'état est
// recalculé ; seul ce qui a changé repart vers les joueurs :
//   {kind: 'game', phase, card, ship, statuses, alerts, team, races,
//    combat, score}                                                  à tous
//   {kind: 'you', character, inventory, money, creation}              à chacun
//   {kind: 'codex', races, items, statuses, totals, wiki}              à tous
//   {kind: 'codex-image', key, src}   images des fiches (customs, objets),
//                                     une fois par joueur
// Les secrets du MJ (révélations, suites des choix, butin, valeurs des
// planètes) ne sortent jamais d'ici.
const {Player} = require('../models/player');
const {Ship} = require('../models/ship');
const {Statuses} = require('../models/statuses');
const deck = require('./deck');
const lobby = require('./lobby');
const races = require('./races');
const inventory = require('./inventory');
const money = require('./money');
const shipAlerts = require('./shipAlerts');
const statRolls = require('./statRolls');
const roles = require('./roles');
const blankCard = require('./blankCard');
const votes = require('./votes');
const planetScan = require('./planetScan');
const itemUse = require('./itemUse');
const codex = require('./codex');
const combat = require('./combat');

const STATS = ['combat', 'pilotage', 'engineering', 'survival', 'recon'];
const MODULES = [
    ['motors', 'Moteurs'], ['scanner', 'Scanner de surface'], ['proximity', 'Détecteur de proximité'],
    ['oxygen', 'Oxygène'], ['energy', 'Énergie'], ['gravity', 'Gravité artificielle'], ['shield', 'Bouclier'],
    ['landing', 'Module d\'atterrissage'], ['construction', 'Module de construction'],
    ['dbscience', 'Base de donnée scientifique'], ['dbhistory', 'Base de donnée historique']
];

// Types de carte : constantes globales TYPE_* (src/config/constants.js)
const cardKind = function (card) {
    if (card.type === TYPE_PLANET)
        return 'planet';
    if (card.type === TYPE_PLACE)
        return 'place';
    return 'event';
};

const cleanText = (text) => String(text || '').replaceAll('{....}', '…');

// La carte telle que les joueurs la voient : le texte et les choix proposés.
// Si la page de jeu a annoncé ce qu'elle affiche pour cette carte (suite
// d'un choix, « Continuer votre chemin »…), c'est ce qui est montré, avec
// les votes ; sinon la carte telle que piochée, sans votes.
const publicCard = function (card) {
    if (!card)
        return null;
    let kind = cardKind(card);
    let screen = votes.screenFor(card.id);
    // Planète : scans faits, points de détection, et vote pour le scan suivant
    if (kind === 'planet') {
        let seen = {id: card.id, kind: kind, desc: '', choices: [], lastPlanet: card.lastPlanet ? LANG.last_planet : null,
            planet: planetScan.forCard(card)};
        if (screen)
            Object.assign(seen, {screen: screen.id, choices: screen.choices.map(cleanText), counts: screen.counts, chosen: screen.chosen});
        return seen;
    }
    if (screen)
        return {
            id: card.id,
            kind: kind,
            desc: cleanText(screen.text),
            timer: !!card.timer,
            screen: screen.id,
            choices: screen.choices.map(cleanText),
            counts: screen.counts,
            chosen: screen.chosen
        };
    return {
        id: card.id,
        kind: kind,
        desc: cleanText(card.desc),
        timer: !!card.timer,
        choices: (card.choices || []).map(c => cleanText(c.value)).filter(Boolean)
    };
};

const shipState = async function () {
    let ship = new Ship(1);
    if (!await ship.getData())
        return null;
    return {
        cryopods: ship.cryopods,
        modules: MODULES.map(([id, label]) => ({id, label, value: ship[id]}))
    };
};

const statusList = async function () {
    let list = await new Statuses().getAllStatuses(true);
    // Statut d'un seul joueur : son nom à côté de celui du statut
    return list.map(s => ({slug: s.slug, name: s.name + (s.player_id ? ' (' + (s.player_name || '?') + ')' : ''),
        desc: s.desc, duration: s.duration, player: s.player_id || ''}));
};

const roleName = (slug) => (roles.find(slug) || {}).name || '';

const team = async function () {
    let players = await DB.tables.players.findAll({raw: true});
    // Compte Discord du joueur, pour se reconnaître malgré les noms de persos
    return players.map(p => ({id: p.discord_id, name: p.name, race: races.nameOf(p.race), role: roleName(p.role),
        discord: lobby.discordOf(p.discord_id)}));
};

// Combat en cours, comme sur l'écran de jeu : adversaires et leurs PV,
// ordre de jeu, tour ; le butin une fois tous les adversaires à terre
const combatState = function () {
    let state = combat.getState();
    if (!state.active)
        return null;
    return {
        turn: state.turn,
        enemies: state.enemies.map(e => ({id: e.id, name: e.name, hp: e.hp, maxHp: e.maxHp, ko: e.hp <= 0})),
        order: (state.order || []).map(f => ({kind: f.kind, id: String(f.id), name: f.name})),
        current: state.current,
        loot: state.lootRevealed ? state.enemies.flatMap(e => e.loot).map(i => i.qty > 1 ? i.name + ' ×' + i.qty : i.name) : null
    };
};

// Score de fin de partie, posé par l'écran de fin (default.js) : montré aux
// joueurs tant que la partie est finie
let score = null;
const setScore = function (value) {
    score = value || null;
    changed();
};

// Tout ce qui est commun aux joueurs
const gameState = async function () {
    let alerts = shipAlerts.getState();
    let phase = CONFIG.gameState;
    return {
        kind: 'game',
        phase: phase,
        // Une carte blanche en cours passe devant la carte du paquet
        card: phase === 'gameLive' ? (blankCard.publicCard() || publicCard(deck.getCurrentCard())) : null,
        ship: await shipState(),
        statuses: await statusList(),
        alerts: {blink: alerts.blink || [], showMap: !!alerts.showMap, alert: alerts.alert ? {room: alerts.alert.room, name: alerts.alert.name, message: alerts.alert.message} : null},
        team: await team(),
        // Pour la création du perso : fiches des races de la partie (bonus et malus, affinités)
        races: phase === 'creation' ? races.playable().map(r => codex.raceCard(r)) : [],
        combat: phase === 'gameLive' ? combatState() : null,
        score: phase === 'postGame' ? score : null
    };
};

// Ce qui ne concerne qu'un joueur : son perso, son inventaire, sa création
const playerState = async function (id) {
    let player = await new Player().getData(id);
    let character = null;
    if (player) {
        character = {name: player.name, race: player.race, raceName: races.nameOf(player.race), role: roles.publicRole(player.role)};
        for (let stat of STATS.concat('moral'))
            character[stat] = player[stat];
    }
    lobby.setCharacter(id, character ? character.name : null);
    return {
        kind: 'you',
        character: character,
        inventory: player ? await inventory.getInventory(id) : [],
        // Bourse : « 20 crédits »
        money: player ? money.label(await money.balance({type: 'player', id: id}) || 0) : null,
        creation: player && CONFIG.gameState === 'creation' ? statRolls.state(player) : null,
        vote: votes.voteOf(id),
        // Objets dont l'utilisation attend la réponse du MJ
        pendingItems: itemUse.pendingFor(id)
    };
};

// Codex : relève ce que l'équipage voit (carte affichée comprise), puis la
// liste de ce qu'il a rencontré
const codexState = async function (game) {
    let card = game.card;
    await codex.observe(card ? [card.desc].concat(card.choices || []) : []);
    return codex.forPlayers();
};

// Images des fiches (Codex et création) pas encore envoyées à ce joueur
const imagesSent = new Map();
const sendImages = async function (id, game, codexMessage) {
    let keys = new Set();
    for (let card of [...game.races, ...codexMessage.races, ...codexMessage.items])
        if (card.imageKey)
            keys.add(card.imageKey);
    let sent = imagesSent.get(id) || new Set();
    imagesSent.set(id, sent);
    for (let key of keys) {
        if (sent.has(key))
            continue;
        sent.add(key);
        let src = await codex.imageData(key);
        if (src)
            lobby.sendTo(id, {kind: 'codex-image', key: key, src: src});
    }
};

// Derniers états envoyés, pour n'envoyer que ce qui change
let lastGame = null;
let lastCodex = null;
const lastYou = new Map();
let timer = null;
let running = false;
let again = false;

const send = async function (force) {
    let game = await gameState();
    let json = JSON.stringify(game);
    if (force === true || json !== lastGame) {
        lastGame = json;
        lobby.sendTo('*', game);
    }
    let book = await codexState(game);
    let bookJson = JSON.stringify(book);
    if (force === true || bookJson !== lastCodex) {
        lastCodex = bookJson;
        lobby.sendTo('*', book);
    }
    for (let p of lobby.getState().players) {
        if (!p.online)
            continue;
        await sendImages(p.id, game, book);
        let you = JSON.stringify(await playerState(p.id));
        if (force === p.id || force === true || lastYou.get(p.id) !== you) {
            lastYou.set(p.id, you);
            lobby.sendTo(p.id, JSON.parse(you));
        }
    }
};

const flush = async function () {
    if (running) {
        again = true;
        return;
    }
    running = true;
    try {
        await send(false);
    } catch (e) {
        log('[LOBBY] ' + e);
    }
    running = false;
    if (again) {
        again = false;
        changed();
    }
};

// Une action a eu lieu : on recalcule un peu plus tard (plusieurs actions
// rapprochées ne donnent qu'un envoi)
const changed = function () {
    if (lobby.getState().status !== 'open')
        return;
    clearTimeout(timer);
    timer = setTimeout(flush, 150);
};

// Un joueur arrive ou revient : il reçoit tout, même ce qui n'a pas changé
const welcome = async function (player) {
    let game = await gameState();
    lastGame = JSON.stringify(game);
    lobby.sendTo(player.id, game);
    let book = await codexState(game);
    lobby.sendTo(player.id, book);
    // Quelque chose de nouveau rencontré : les autres aussi
    if (JSON.stringify(book) !== lastCodex)
        changed();
    // Page rechargée : les images sont à renvoyer
    imagesSent.delete(player.id);
    await sendImages(player.id, game, book);
    let you = await playerState(player.id);
    lastYou.set(player.id, JSON.stringify(you));
    lobby.sendTo(player.id, you);
};

const init = function () {
    lobby.onPlayerJoin(player => welcome(player).catch(e => log('[LOBBY] ' + e)));
};

module.exports = {init, changed, welcome, publicCard, gameState, playerState, combatState, setScore, MODULES};
