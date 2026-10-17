// Vue joueur : ce que le MJ envoie aux joueurs en ligne, par le relais.
//
// Après chaque action du jeu (tout passe par le WebSocket du MJ), l'état est
// recalculé ; seul ce qui a changé repart vers les joueurs :
//   {kind: 'game', phase, card, ship, statuses, alerts, team, races}  à tous
//   {kind: 'you', character, inventory, creation}                     à chacun
// Les secrets du MJ (révélations, suites des choix, butin, valeurs des
// planètes) ne sortent jamais d'ici.
const {Player} = require('../models/player');
const {Ship} = require('../models/ship');
const {Statuses} = require('../models/statuses');
const deck = require('./deck');
const lobby = require('./lobby');
const races = require('./races');
const inventory = require('./inventory');
const shipAlerts = require('./shipAlerts');
const statRolls = require('./statRolls');
const roles = require('./roles');

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

// La carte telle que les joueurs la voient : le texte et les choix proposés
const publicCard = function (card) {
    if (!card)
        return null;
    let kind = cardKind(card);
    if (kind === 'planet')
        return {id: card.id, kind: kind, desc: '', choices: []};
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
    return list.map(s => ({slug: s.slug, name: s.name, desc: s.desc, duration: s.duration}));
};

const roleName = (slug) => (roles.find(slug) || {}).name || '';

const team = async function () {
    let players = await DB.tables.players.findAll({raw: true});
    return players.map(p => ({id: p.discord_id, name: p.name, race: races.nameOf(p.race), role: roleName(p.role)}));
};

// Tout ce qui est commun aux joueurs
const gameState = async function () {
    let alerts = shipAlerts.getState();
    let phase = CONFIG.gameState;
    return {
        kind: 'game',
        phase: phase,
        card: phase === 'gameLive' ? publicCard(deck.getCurrentCard()) : null,
        ship: await shipState(),
        statuses: await statusList(),
        alerts: {blink: alerts.blink || [], showMap: !!alerts.showMap, alert: alerts.alert ? {room: alerts.alert.room, name: alerts.alert.name, message: alerts.alert.message} : null},
        team: await team(),
        // Pour la création du perso : races avec leurs bonus et malus
        races: phase === 'creation' ? races.list().map(r => ({slug: r.slug, name: r.name, desc: r.desc, stats: r.stats})) : []
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
        creation: player && CONFIG.gameState === 'creation' ? statRolls.state(player) : null
    };
};

// Derniers états envoyés, pour n'envoyer que ce qui change
let lastGame = null;
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
    for (let p of lobby.getState().players) {
        if (!p.online)
            continue;
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
    let you = await playerState(player.id);
    lastYou.set(player.id, JSON.stringify(you));
    lobby.sendTo(player.id, you);
};

const init = function () {
    lobby.onPlayerJoin(player => welcome(player).catch(e => log('[LOBBY] ' + e)));
};

module.exports = {init, changed, welcome, publicCard, gameState, playerState, MODULES};
