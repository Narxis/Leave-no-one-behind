// Online players' actions, received from the relay by the lobby (lobby.js).
//
// GM pages talk to the server through the local WebSocket and are allowed
// all actions. An online player, however, only gets a fixed list,
// and always in their own name: their app id (the lobby one) fills the
// game's discord_id field, whatever their message contains.
//
// As with the bot, character creation is only open during
// creation (GM characters page) and game dice only during the game.
//
// Player → GM: {kind: 'action', action, data}
// GM → player: {kind: 'result', action, data}  action done
//               {kind: 'refused', action, message}
// (the game and character state goes out from playerView.js)
const {Player} = require('../models/player');
const lobby = require('./lobby');
const races = require('./races');
const statRolls = require('./statRolls');
const chat = require('./chat');
const votes = require('./votes');
const itemUse = require('./itemUse');
const intro = require('./intro');
const inventory = require('./inventory');
const itemRequests = require('./itemRequests');
const dice = require('./dice');

const STATS = ['combat', 'pilotage', 'engineering', 'survival', 'recon'];
const MODULES = ['', 'scanner', 'proximity', 'motors', 'oxygen', 'energy', 'gravity'];

const refuse = (message) => ({refused: message});
const NOT_CREATION = 'La création des persos n\'est pas ouverte : le MJ doit être sur la page des personnages.';
const NOT_LIVE = 'Les dés se lancent pendant la partie.';
const inCreation = () => CONFIG.gameState === 'creation';
const text = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

// What the player sees of their character
const characterOf = async function (id) {
    let player = await new Player().getData(id);
    if (!player)
        return null;
    let character = {name: player.name, race: player.race};
    for (let stat of STATS.concat('moral'))
        character[stat] = player[stat];
    return character;
};

// Game message, in the player's name, for each allowed action.
// Returns the message to run, or {refused} with the reason.
const RULES = {
    // Joining the crew: creates their character with the lobby nickname
    join: async (player) => {
        if (!inCreation())
            return refuse(NOT_CREATION);
        if (await characterOf(player.id))
            return refuse('Tu as déjà un personnage dans cette partie.');
        return {action: 'join', uid: player.id, nick: player.name};
    },
    'set-name': async (player, data) => {
        if (!inCreation())
            return refuse(NOT_CREATION);
        let nick = text(data.nick, 30);
        if (!nick)
            return refuse('Nom vide.');
        return {action: 'set-name', uid: player.id, nick: nick};
    },
    'set-race': async (player, data) => {
        if (!inCreation())
            return refuse(NOT_CREATION);
        let me = await new Player().getData(player.id);
        if (!me)
            return refuse('Crée d\'abord ton personnage.');
        if (statRolls.isDone(me))
            return refuse('Tes stats sont déjà tirées : demande au MJ pour changer de race.');
        if (statRolls.started(me) && String(data.race) !== me.race)
            return refuse('Tu as commencé à lancer tes dés : demande au MJ pour changer de race.');
        // Base races and customs checked by the GM for the game
        if (!races.isAllowed(String(data.race || '')))
            return refuse('Race inconnue.');
        return {action: 'set-race', uid: player.id, race: data.race};
    },
    // Next die of a stat, drawn by the server (character creation)
    'roll-stat': async (player, data) => {
        if (!inCreation())
            return refuse(NOT_CREATION);
        let me = await new Player().getData(player.id);
        if (!me)
            return refuse('Crée d\'abord ton personnage.');
        let result = statRolls.roll(me, data.stat);
        if (result.error)
            return refuse(result.error);
        if (!result.stats)
            return {action: 'roll-stats', uid: player.id, data: result.dice};
        await me.update(result.stats, player.id);
        return {action: 'roll-stats-done', uid: player.id, data: await new Player().getData(player.id)};
    },
    roll: async (player, data) => {
        if (CONFIG.gameState !== 'gameLive')
            return refuse(NOT_LIVE);
        if (!STATS.includes(data.stat) || !MODULES.includes(data.module || ''))
            return refuse('Lancer invalide.');
        return {action: 'roll', data: {discord_id: player.id, stat: data.stat, module: data.module || ''}};
    },
    // Emoji only: the text is shown as is on the GM screen
    emote: async (player, data) => {
        let emoji = text(data.emoji, 16);
        if (!emoji || /[<>&"']/.test(emoji))
            return refuse('Emote invalide.');
        return {action: 'emote', emoji: emoji, type: 'glyph', uid: player.id};
    },
    // Vote for a choice of the displayed card (null: withdraw the vote).
    // The GM sees the votes and chooses themselves.
    vote: async (player, data) => {
        if (CONFIG.gameState !== 'gameLive')
            return refuse('On vote pendant la partie.');
        let index = data.index === null ? null : Number(data.index);
        let character = await characterOf(player.id);
        let result = votes.vote(player.id, character ? character.name : player.name, index);
        if (result.error)
            return refuse(result.error);
        return {action: 'passThrough', data: result.payload};
    },
    // Synopsis and ship sheet: ready to continue (or no longer)
    'intro-ready': async (player, data) => {
        if (!await characterOf(player.id))
            return refuse('Il faut un perso pour voter.');
        let result = intro.vote(player.id, !!data.ready);
        if (result.error)
            return refuse(result.error);
        return {action: 'passThrough', data: result.payload};
    },
    // Using an item from their inventory: request to the GM, who accepts or not
    'item-use': async (player, data) => {
        if (CONFIG.gameState !== 'gameLive')
            return refuse('Les objets s\'utilisent pendant la partie.');
        let character = await characterOf(player.id);
        if (!character)
            return refuse('Il faut un perso pour utiliser un objet.');
        let result = await itemUse.request(player, character.name, data.slug);
        if (result.error)
            return refuse(result.error);
        return {action: 'passThrough', data: result.payload};
    },
    // Neutral dice of the dice window: rolled here, announced in the room (or to the
    // GM only if secret); the player also receives the result
    dice: async (player, data) => {
        let result = dice.roll(data.sides, data.count);
        if (result.error)
            return refuse(result.error);
        let character = await characterOf(player.id);
        let said = chat.playerDice(player, character ? character.name : player.name, result, !!data.secret);
        if (said.error)
            return refuse(said.error);
        return {done: true, action: 'dice', result: Object.assign(result, {secret: !!data.secret})};
    },
    // Chat: common room, or private (only the GM reads it). Signed with the
    // character name if they have one, otherwise the lobby nickname.
    chat: async (player, data) => {
        let character = await characterOf(player.id);
        let result = chat.fromPlayer(player, character ? character.name : player.name, data);
        if (result.error)
            return refuse(result.error);
        return {done: true, action: 'chat'};
    },
    // Giving an item from their inventory to another player (like /donner) or
    // storing it in the ship; always from their own, never from someone
    // else's (all: the whole stack)
    'inventory-move': async (player, data) => {
        let to = data.to || {};
        if (to.type === 'ship')
            return {action: 'inventory-move', data: {slug: String(data.slug || ''), from: {type: 'player', id: player.id}, to: {type: 'ship'}, all: !!data.all}};
        if (to.type !== 'player' || String(to.id || '') === player.id)
            return refuse('On ne peut donner un objet qu\'à un autre joueur ou au vaisseau.');
        return {action: 'inventory-move', data: {slug: String(data.slug || ''), from: {type: 'player', id: player.id}, to: {type: 'player', id: String(to.id)}, all: !!data.all}};
    },
    // Requesting an item from another player (or from the ship): it isn't
    // taken, their role logo shows next to it and a message goes to the
    // room. A second request for the same item withdraws it.
    'item-request': async (player, data) => {
        let character = await characterOf(player.id);
        if (!character)
            return refuse('Il faut un perso pour demander un objet.');
        let owner = data.owner || {};
        if (owner.type !== 'ship' && owner.type !== 'player')
            return refuse('Inventaire inconnu.');
        owner = owner.type === 'ship' ? {type: 'ship'} : {type: 'player', id: String(owner.id || '')};
        if (owner.type === 'player' && owner.id === player.id)
            return refuse('Cet objet est déjà à toi.');
        let slug = String(data.slug || '');
        if (!(await inventory.countOf(slug, owner)))
            return refuse('Cet objet n\'est plus là.');
        let result = itemRequests.toggle({id: player.id, name: character.name}, owner, slug);
        if (result.error)
            return refuse(result.error);
        if (result.active) {
            let row = await DB.tables.items.findOne({raw: true, where: {slug: slug}});
            let item = '« ' + (row ? row.name : slug) + ' »';
            let holder = owner.type === 'player' ? await characterOf(owner.id) : null;
            chat.fromPlayer(player, character.name, {text: owner.type === 'ship'
                ? 'MJ : je voudrais prendre ' + item + ' dans le vaisseau, s\'il te plaît.'
                : '@' + (holder ? holder.name : 'toi') + ' : je voudrais ton objet ' + item + ', s\'il te plaît.'});
        }
        return {action: 'passThrough', data: itemRequests.payload()};
    }
};

const ACTIONS = Object.keys(RULES);

// Turns a player's message into a game action (exported for the tests)
const translate = async function (player, message) {
    if (!message || message.kind !== 'action' || typeof message.action !== 'string')
        return null;
    let rule = RULES[message.action];
    if (!rule)
        return refuse('Action réservée au MJ.');
    let data = message.data && typeof message.data === 'object' ? message.data : {};
    return rule(player, data);
};

// run(message) runs an action as if it came from a GM page and
// returns its messages; broadcast(message) sends them to the GM pages
const init = function ({run, broadcast}) {
    lobby.onPlayerMessage(async (player, message) => {
        if (!player.name)
            return; // not (or no longer) in the lobby
        let action = await translate(player, message);
        if (!action)
            return;
        if (action.refused)
            return lobby.sendTo(player.id, {kind: 'refused', action: message.action, message: action.refused});

        if (action.done)
            // Already done and broadcast (chat); a dice roll returns its result
            return action.result ? lobby.sendTo(player.id, {kind: 'result', action: message.action, data: action.result}) : undefined;
        log('[LOBBY] ' + player.name + ' : ' + action.action, '#4fd8e0');
        let results = [].concat(await run(action));
        for (let result of results)
            broadcast(result);

        let first = results[0] || {};
        if (first.error || first.action === 'inventory-error')
            return lobby.sendTo(player.id, {kind: 'refused', action: message.action, message: first.error_msg || first.message || (first.data && first.data.message) || 'Action impossible.'});
        lobby.sendTo(player.id, {kind: 'result', action: message.action, data: action.action === 'roll' ? first.data : null});
    });
};

module.exports = {init, translate, characterOf, ACTIONS};
