// Vue joueur : ce que le MJ envoie aux joueurs en ligne, par le relais.
//
// Après chaque action du jeu (tout passe par le WebSocket du MJ), l'état est
// recalculé ; seul ce qui a changé repart vers les joueurs :
//   {kind: 'game', phase, card, ship, statuses, alerts, team, races,
//    combat, score}                                                  à tous
//   {kind: 'you', character, inventory, money, creation}              à chacun
//   {kind: 'codex', races, items, statuses, totals, wiki}              à tous
//   {kind: 'leaderboard', entries, current}   classement des équipes, à tous
//   {kind: 'timer', timer: {cardId, left, paused} | null}   compte à rebours
//   {kind: 'codex-image', key, src}   images des fiches (customs, objets),
//                                     une fois par joueur
//   {kind: 'card-text', text, seq} | {kind: 'card-text', fast, seq}
//                                     texte de la carte, écrit au rythme du MJ
//   {kind: 'mj-event', payload}      événements de l'écran de jeu repris tels
//                                     quels par l'écran porté (MIRRORED)
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
const intro = require('./intro');
const allies = require('./allies');
const leaderboard = require('./leaderboard');

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
// Texte de la carte : les pauses {....} restent, la page joueur les anime
// comme l'écran de jeu (points, puis le texte repart à zéro)
const cardText = (text) => String(text || '');

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
            Object.assign(seen, {screen: screen.id, choices: screen.choices.map(cleanText), counts: screen.counts, voters: screen.voters, chosen: screen.chosen});
        return seen;
    }
    if (screen)
        return {
            id: card.id,
            kind: kind,
            desc: cardText(screen.text),
            timer: !!card.timer,
            screen: screen.id,
            choices: screen.choices.map(cleanText),
            counts: screen.counts,
            voters: screen.voters,
            chosen: screen.chosen
        };
    return {
        id: card.id,
        kind: kind,
        desc: cardText(card.desc),
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
    // roleInfo et stats : pour les onglets des joueurs de l'écran de jeu porté
    return players.map(p => ({id: p.discord_id, name: p.name, race: races.nameOf(p.race), role: roleName(p.role),
        discord: lobby.discordOf(p.discord_id), roleInfo: roles.publicRole(p.role),
        stats: Object.fromEntries(STATS.concat('moral').map(stat => [stat, p[stat]]))}));
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

// Compte à rebours des choix, tenu par la page de jeu (card.js) : envoyé
// à part, à chaque seconde, sans recalculer tout l'état
let choiceTimer = null;
const setTimer = function (data) {
    data = data && typeof data === 'object' ? data : {};
    let left = Math.floor(Number(data.left));
    choiceTimer = left > 0 && left <= 60 ? {cardId: String(data.cardId), left: left, paused: !!data.paused} : null;
    if (lobby.getState().status === 'open')
        lobby.sendTo('*', {kind: 'timer', timer: choiceTimer});
    return null; // rien à renvoyer aux pages du MJ
};

// Texte de la carte tel que la page de jeu l'écrit (card.js, writeCardDesc) :
// les joueurs l'écrivent en même temps que le MJ, pas avant lui
let cardWriting = null;
const setCardText = function (data) {
    data = data && typeof data === 'object' ? data : {};
    let msg;
    if (data.fast) {
        if (!cardWriting)
            return null;
        cardWriting.fast = true;
        msg = {kind: 'card-text', fast: true, seq: cardWriting.seq};
    }
    else {
        cardWriting = {text: String(data.text || '').slice(0, 20000), seq: (cardWriting ? cardWriting.seq : 0) + 1, at: Date.now(), fast: false};
        msg = {kind: 'card-text', text: cardWriting.text, seq: cardWriting.seq};
    }
    if (lobby.getState().status === 'open')
        lobby.sendTo('*', msg);
    return null; // rien à renvoyer aux pages du MJ
};

// Événements de l'écran de jeu que l'écran porté des joueurs reprend tels
// quels (mêmes scripts : players.js, inventory.js) : jets, emotes, stats et
// rôles des joueurs, inventaires, butin d'une carte, combat (combat.js),
// onglets des compagnons (npc-tabs.js)
const MIRRORED = ['roll', 'emote', 'playerStat', 'player-role', 'inventory', 'card-loot', 'combat', 'allies'];
// Combat : ce que l'écran de jeu montre, sans le butin caché ni les
// caractéristiques d'attaque des adversaires
const publicCombat = function (state) {
    return Object.assign({}, state, {
        enemies: (state.enemies || []).map(e => ({id: e.id, name: e.name, hp: e.hp, maxHp: e.maxHp, defense: e.defense,
            statuses: e.statuses || {}, loot: state.lootRevealed ? e.loot || [] : []}))
    });
};
const mirrorPayload = function (payload) {
    if (payload.action !== 'combat' || !payload.data)
        return payload;
    return Object.assign({}, payload, {data: Object.assign({}, payload.data, {state: publicCombat(payload.data.state || {})})});
};
const mirror = function (payload) {
    if (!payload || payload.error || !MIRRORED.includes(payload.action) || lobby.getState().status !== 'open')
        return;
    lobby.sendTo('*', {kind: 'mj-event', payload: mirrorPayload(payload)});
};

// Carte blanche affichée par le MJ : ses choix, avec les votes, dès que la
// page de jeu les montre (elle l'annonce sous le numéro « blank », card.js)
const publicBlankCard = function () {
    let card = blankCard.publicCard();
    let screen = card && card.choices.length ? votes.screenFor('blank') : null;
    if (screen)
        Object.assign(card, {desc: cardText(screen.text), screen: screen.id, choices: screen.choices.map(cleanText),
            counts: screen.counts, voters: screen.voters, chosen: screen.chosen});
    return card;
};

// Tout ce qui est commun aux joueurs
const gameState = async function () {
    let alerts = shipAlerts.getState();
    // Atterrissage : l'écran de score est affiché sans que la partie passe
    // en postGame (seul le paquet vide le fait) ; le score posé suffit
    let phase = score ? 'postGame' : CONFIG.gameState;
    return {
        kind: 'game',
        phase: phase,
        // Lancement (synopsis, fiche du vaisseau) ; sinon une carte blanche
        // en cours passe devant la carte du paquet
        card: intro.publicCard() || (phase === 'gameLive' ? (publicBlankCard() || publicCard(deck.getCurrentCard())) : null),
        ship: await shipState(),
        statuses: await statusList(),
        alerts: {blink: alerts.blink || [], showMap: !!alerts.showMap, alert: alerts.alert ? {room: alerts.alert.room, name: alerts.alert.name, message: alerts.alert.message} : null},
        team: await team(),
        // Pour la création du perso : fiches des races de la partie (bonus et
        // malus, affinités, objets de départ)
        races: phase === 'creation' ? await codex.creationCards() : [],
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
        // Prêt à quitter le synopsis ou la fiche du vaisseau
        introReady: intro.isReady(id),
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

// Classement des équipes, comme la page du MJ (leaderboard.ejs), sans les
// pseudos Discord des joueurs
const leaderboardState = function () {
    let current = leaderboard.getCurrent();
    return {
        kind: 'leaderboard',
        current: current ? current.id : null,
        entries: leaderboard.list().slice(0, 200).map(e => Object.assign({}, e, {
            members: Array.isArray(e.members) ? e.members.map(m => ({name: m.name, race: m.race, stats: m.stats})) : undefined
        }))
    };
};

// Derniers états envoyés, pour n'envoyer que ce qui change
let lastGame = null;
let lastCodex = null;
let lastRanks = null;
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
    let ranks = leaderboardState();
    let ranksJson = JSON.stringify(ranks);
    if (force === true || ranksJson !== lastRanks) {
        lastRanks = ranksJson;
        lobby.sendTo('*', ranks);
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
    lobby.phaseChanged();
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
    lobby.sendTo(player.id, leaderboardState());
    // Quelque chose de nouveau rencontré : les autres aussi
    if (JSON.stringify(book) !== lastCodex)
        changed();
    // Page rechargée : les images sont à renvoyer
    imagesSent.delete(player.id);
    await sendImages(player.id, game, book);
    let you = await playerState(player.id);
    lastYou.set(player.id, JSON.stringify(you));
    lobby.sendTo(player.id, you);
    if (choiceTimer)
        lobby.sendTo(player.id, {kind: 'timer', timer: choiceTimer});
    // Inventaires (coffres des onglets, objets du vaisseau) et combat en cours
    let stock = (await inventory.payload())[0];
    lobby.sendTo(player.id, {kind: 'mj-event', payload: stock});
    lobby.sendTo(player.id, {kind: 'mj-event', payload: {action: 'allies', error: false, data: {allies: allies.getAllies(), event: null}}});
    lobby.sendTo(player.id, {kind: 'mj-event', payload: mirrorPayload({action: 'combat', error: false, data: {state: combat.getState(), event: null}})});
    // Arrivée en cours de carte : le texte déjà écrit par le MJ, sans l'animer
    if (cardWriting)
        lobby.sendTo(player.id, {kind: 'card-text', text: cardWriting.text, seq: cardWriting.seq, late: true});
};

const init = function () {
    lobby.onPlayerJoin(player => welcome(player).catch(e => log('[LOBBY] ' + e)));
};

module.exports = {init, changed, welcome, publicCard, gameState, playerState, combatState, setScore, setTimer, setCardText, mirror, publicCombat, leaderboardState, MIRRORED, MODULES};
