// Player view: what the GM sends to online players, through the relay.
//
// After each game action (everything goes through the GM's WebSocket), the state is
// recomputed; only what changed goes back out to the players:
//   {kind: 'game', phase, card, ship, statuses, alerts, team, races,
//    combat, score}                                                  to all
//   {kind: 'you', character, inventory, money, creation}              to each
//   {kind: 'codex', races, items, statuses, totals, wiki}              to all
//   {kind: 'leaderboard', entries, current}   team leaderboard, to all
//   {kind: 'timer', timer: {cardId, left, paused} | null}   countdown
//   {kind: 'codex-image', key, src}   sheet images (customs, items),
//                                     once per player
//   {kind: 'card-text', text, seq} | {kind: 'card-text', fast, seq}
//                                     card text, written at the GM's pace
//   {kind: 'mj-event', payload}      game screen events replayed as
//                                     is by the ported screen (MIRRORED)
// The GM's secrets (reveals, choice follow-ups, loot, planet
// values) never leave here.
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
const itemRequests = require('./itemRequests');

const STATS = ['combat', 'pilotage', 'engineering', 'survival', 'recon'];
const MODULES = [
    ['motors', 'Moteurs'], ['scanner', 'Scanner de surface'], ['proximity', 'Détecteur de proximité'],
    ['oxygen', 'Oxygène'], ['energy', 'Énergie'], ['gravity', 'Gravité artificielle'], ['shield', 'Bouclier'],
    ['landing', 'Module d\'atterrissage'], ['construction', 'Module de construction'],
    ['dbscience', 'Base de donnée scientifique'], ['dbhistory', 'Base de donnée historique']
];

// Card types: global TYPE_* constants (src/config/constants.js)
const cardKind = function (card) {
    if (card.type === TYPE_PLANET)
        return 'planet';
    if (card.type === TYPE_PLACE)
        return 'place';
    return 'event';
};

const cleanText = (text) => String(text || '').replaceAll('{....}', '…');
// Card text: the {....} pauses stay, the player page animates them
// like the game screen (dots, then the text starts over)
const cardText = (text) => String(text || '');

// The card as the players see it: the text and the offered choices.
// If the game page announced what it shows for this card (follow-up
// of a choice, "Continuer votre chemin"…), that is what is shown, with
// the votes; otherwise the card as drawn, without votes.
const publicCard = function (card) {
    if (!card)
        return null;
    let kind = cardKind(card);
    let screen = votes.screenFor(card.id);
    // Planet: scans done, detection points, and vote for the next scan
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
    // Status of a single player: their name next to the status name
    return list.map(s => ({slug: s.slug, name: s.name + (s.player_id ? ' (' + (s.player_name || '?') + ')' : ''),
        desc: s.desc, duration: s.duration, player: s.player_id || ''}));
};

const roleName = (slug) => (roles.find(slug) || {}).name || '';

const team = async function () {
    let players = await DB.tables.players.findAll({raw: true});
    // Player's Discord account, to recognize each other despite character names
    // roleInfo and stats: for the player tabs of the ported game screen
    return players.map(p => ({id: p.discord_id, name: p.name, race: races.nameOf(p.race), role: roleName(p.role),
        discord: lobby.discordOf(p.discord_id), roleInfo: roles.publicRole(p.role),
        stats: Object.fromEntries(STATS.concat('moral').map(stat => [stat, p[stat]]))}));
};

// Current combat, as on the game screen: opponents and their HP,
// turn order, turn; the loot once all opponents are down
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

// End of game score, set by the end screen (default.js): shown to the
// players as long as the game is over
let score = null;
const setScore = function (value) {
    score = value || null;
    changed();
};

// Choices countdown, kept by the game page (card.js): sent
// separately, each second, without recomputing the whole state
let choiceTimer = null;
const setTimer = function (data) {
    data = data && typeof data === 'object' ? data : {};
    let left = Math.floor(Number(data.left));
    choiceTimer = left > 0 && left <= 60 ? {cardId: String(data.cardId), left: left, paused: !!data.paused} : null;
    if (lobby.getState().status === 'open')
        lobby.sendTo('*', {kind: 'timer', timer: choiceTimer});
    return null; // nothing to send back to the GM pages
};

// Card text as the game page writes it (card.js, writeCardDesc):
// the players write it at the same time as the GM, not before them
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
    return null; // nothing to send back to the GM pages
};

// Game screen events that the players' ported screen replays as
// is (same scripts: players.js, inventory.js): rolls, emotes, players' stats and
// roles, inventories, card loot, combat (combat.js),
// companion tabs (npc-tabs.js)
const MIRRORED = ['roll', 'emote', 'playerStat', 'player-role', 'inventory', 'item-requests', 'card-loot', 'combat', 'allies'];
// Combat: what the game screen shows, without the hidden loot or the
// opponents' attack characteristics
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

// Blank card shown by the GM: its choices, with the votes, as soon as the
// game page shows them (it announces it under the number "blank", card.js)
const publicBlankCard = function () {
    let card = blankCard.publicCard();
    let screen = card && card.choices.length ? votes.screenFor('blank') : null;
    if (screen)
        Object.assign(card, {desc: cardText(screen.text), screen: screen.id, choices: screen.choices.map(cleanText),
            counts: screen.counts, voters: screen.voters, chosen: screen.chosen});
    return card;
};

// Everything common to the players
const gameState = async function () {
    let alerts = shipAlerts.getState();
    // Landing: the score screen is shown without the game switching
    // to postGame (only the empty deck does that); the set score is enough
    let phase = score ? 'postGame' : CONFIG.gameState;
    return {
        kind: 'game',
        phase: phase,
        // Launch (synopsis, ship sheet); otherwise a blank card
        // in progress takes precedence over the deck card
        card: intro.publicCard() || (phase === 'gameLive' ? (publicBlankCard() || publicCard(deck.getCurrentCard())) : null),
        ship: await shipState(),
        statuses: await statusList(),
        alerts: {blink: alerts.blink || [], showMap: !!alerts.showMap, alert: alerts.alert ? {room: alerts.alert.room, name: alerts.alert.name, message: alerts.alert.message} : null},
        team: await team(),
        // For character creation: sheets of the game's races (bonuses and
        // maluses, affinities, starting items)
        races: phase === 'creation' ? await codex.creationCards() : [],
        combat: phase === 'gameLive' ? combatState() : null,
        score: phase === 'postGame' ? score : null
    };
};

// What only concerns one player: their character, their inventory, their creation
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
        // Purse: "20 crédits"
        money: player ? money.label(await money.balance({type: 'player', id: id}) || 0) : null,
        creation: player && CONFIG.gameState === 'creation' ? statRolls.state(player) : null,
        vote: votes.voteOf(id),
        // Ready to leave the synopsis or the ship sheet
        introReady: intro.isReady(id),
        // Items whose use is waiting for the GM's answer
        pendingItems: itemUse.pendingFor(id),
        // Items in their inventory that other players are requesting
        requested: itemRequests.forOwner(id)
    };
};

// Codex: records what the crew sees (displayed card included), then the
// list of what it has encountered
const codexState = async function (game) {
    let card = game.card;
    await codex.observe(card ? [card.desc].concat(card.choices || []) : []);
    return codex.forPlayers();
};

// Sheet images (Codex and creation) not yet sent to this player
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

// Team leaderboard, like the GM page (leaderboard.ejs), without the
// players' Discord nicknames
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

// Last states sent, to only send what changes
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

// An action happened: recompute a bit later (several actions
// close together result in a single send)
const changed = function () {
    lobby.phaseChanged();
    if (lobby.getState().status !== 'open')
        return;
    clearTimeout(timer);
    timer = setTimeout(flush, 150);
};

// A player arrives or comes back: they get everything, even what hasn't changed
const welcome = async function (player) {
    let game = await gameState();
    lastGame = JSON.stringify(game);
    lobby.sendTo(player.id, game);
    let book = await codexState(game);
    lobby.sendTo(player.id, book);
    lobby.sendTo(player.id, leaderboardState());
    // Something new encountered: the others too
    if (JSON.stringify(book) !== lastCodex)
        changed();
    // Page reloaded: the images must be sent again
    imagesSent.delete(player.id);
    await sendImages(player.id, game, book);
    let you = await playerState(player.id);
    lastYou.set(player.id, JSON.stringify(you));
    lobby.sendTo(player.id, you);
    if (choiceTimer)
        lobby.sendTo(player.id, {kind: 'timer', timer: choiceTimer});
    // Inventories (tab chests, ship items) and current combat
    let stock = (await inventory.payload())[0];
    lobby.sendTo(player.id, {kind: 'mj-event', payload: stock});
    lobby.sendTo(player.id, {kind: 'mj-event', payload: itemRequests.payload()});
    lobby.sendTo(player.id, {kind: 'mj-event', payload: {action: 'allies', error: false, data: {allies: allies.getAllies(), event: null}}});
    lobby.sendTo(player.id, {kind: 'mj-event', payload: mirrorPayload({action: 'combat', error: false, data: {state: combat.getState(), event: null}})});
    // Arriving mid-card: the text already written by the GM, without animating it
    if (cardWriting)
        lobby.sendTo(player.id, {kind: 'card-text', text: cardWriting.text, seq: cardWriting.seq, late: true});
};

const init = function () {
    lobby.onPlayerJoin(player => welcome(player).catch(e => log('[LOBBY] ' + e)));
};

module.exports = {init, changed, welcome, publicCard, gameState, playerState, combatState, setScore, setTimer, setCardText, mirror, publicCombat, leaderboardState, MIRRORED, MODULES};
