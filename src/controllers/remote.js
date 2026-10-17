// Actions des joueurs en ligne, reçues du relais par le lobby (lobby.js).
//
// Les pages du MJ parlent au serveur par le WebSocket local et ont droit à
// toutes les actions. Un joueur en ligne, lui, n'a droit qu'à une liste fixe,
// et toujours en son nom : son identifiant d'app (celui du lobby) remplit le
// champ discord_id du jeu, quoi que contienne son message.
//
// Joueur → MJ : {kind: 'action', action, data}
// MJ → joueur : {kind: 'you', character}        son perso (null s'il n'en a pas)
//               {kind: 'result', action, data}  action faite
//               {kind: 'refused', action, message}
const {Player} = require('../models/player');
const lobby = require('./lobby');
const races = require('./races');

const STATS = ['combat', 'pilotage', 'engineering', 'survival', 'recon'];
const MODULES = ['', 'scanner', 'proximity', 'motors', 'oxygen', 'energy', 'gravity'];

const refuse = (message) => ({refused: message});
const text = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

// Ce que le joueur voit de son perso
const characterOf = async function (id) {
    let player = await new Player().getData(id);
    if (!player)
        return null;
    let character = {name: player.name, race: player.race};
    for (let stat of STATS.concat('moral'))
        character[stat] = player[stat];
    return character;
};

// Message de jeu, au nom du joueur, pour chaque action permise.
// Renvoie le message à exécuter, ou {refused} avec la raison.
const RULES = {
    // Rejoindre l'équipage : crée son perso avec le pseudo du lobby
    join: async (player) => {
        if (await characterOf(player.id))
            return refuse('Tu as déjà un personnage dans cette partie.');
        return {action: 'join', uid: player.id, nick: player.name};
    },
    'set-name': async (player, data) => {
        let nick = text(data.nick, 30);
        if (!nick)
            return refuse('Nom vide.');
        return {action: 'set-name', uid: player.id, nick: nick};
    },
    'set-race': async (player, data) => {
        if (!Object.prototype.hasOwnProperty.call(races.getStats(), data.race))
            return refuse('Race inconnue.');
        return {action: 'set-race', uid: player.id, race: data.race};
    },
    roll: async (player, data) => {
        if (!STATS.includes(data.stat) || !MODULES.includes(data.module || ''))
            return refuse('Lancer invalide.');
        return {action: 'roll', data: {discord_id: player.id, stat: data.stat, module: data.module || ''}};
    },
    // Emoji seulement : le texte est affiché tel quel sur l'écran du MJ
    emote: async (player, data) => {
        let emoji = text(data.emoji, 16);
        if (!emoji || /[<>&"']/.test(emoji))
            return refuse('Emote invalide.');
        return {action: 'emote', emoji: emoji, type: 'glyph', uid: player.id};
    },
    // Donner un objet de son inventaire à un autre joueur (comme /donner)
    'inventory-move': async (player, data) => {
        let to = data.to || {};
        if (to.type !== 'player' || String(to.id || '') === player.id)
            return refuse('On ne peut donner un objet qu\'à un autre joueur.');
        return {action: 'inventory-move', data: {slug: String(data.slug || ''), from: {type: 'player', id: player.id}, to: {type: 'player', id: String(to.id)}}};
    }
};

const ACTIONS = Object.keys(RULES);

// Traduit le message d'un joueur en action de jeu (exporté pour les tests)
const translate = async function (player, message) {
    if (!message || message.kind !== 'action' || typeof message.action !== 'string')
        return null;
    let rule = RULES[message.action];
    if (!rule)
        return refuse('Action réservée au MJ.');
    let data = message.data && typeof message.data === 'object' ? message.data : {};
    return rule(player, data);
};

// Le perso du joueur, à son arrivée et quand il change
const sendCharacter = async function (player) {
    let character = await characterOf(player.id);
    lobby.setCharacter(player.id, character ? character.name : null);
    lobby.sendTo(player.id, {kind: 'you', character: character});
};

// run(message) exécute une action comme si elle venait d'une page du MJ et
// renvoie ses messages ; broadcast(message) les envoie aux pages du MJ
const init = function ({run, broadcast}) {
    lobby.onPlayerJoin(player => sendCharacter(player).catch(e => log('[LOBBY] ' + e)));

    lobby.onPlayerMessage(async (player, message) => {
        if (!player.name)
            return; // pas (ou plus) dans le lobby
        let action = await translate(player, message);
        if (!action)
            return;
        if (action.refused)
            return lobby.sendTo(player.id, {kind: 'refused', action: message.action, message: action.refused});

        log('[LOBBY] ' + player.name + ' : ' + action.action, '#4fd8e0');
        let results = [].concat(await run(action));
        for (let result of results)
            broadcast(result);

        let first = results[0] || {};
        if (first.error || first.action === 'inventory-error')
            return lobby.sendTo(player.id, {kind: 'refused', action: message.action, message: first.error_msg || first.message || (first.data && first.data.message) || 'Action impossible.'});
        lobby.sendTo(player.id, {kind: 'result', action: message.action, data: action.action === 'roll' ? first.data : null});
        if (['join', 'set-name', 'set-race'].includes(action.action))
            await sendCharacter(player);
    });
};

module.exports = {init, translate, characterOf, ACTIONS};
