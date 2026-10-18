// Actions des joueurs en ligne, reçues du relais par le lobby (lobby.js).
//
// Les pages du MJ parlent au serveur par le WebSocket local et ont droit à
// toutes les actions. Un joueur en ligne, lui, n'a droit qu'à une liste fixe,
// et toujours en son nom : son identifiant d'app (celui du lobby) remplit le
// champ discord_id du jeu, quoi que contienne son message.
//
// Comme avec le bot, la création du perso n'est ouverte que pendant la
// création (page des persos du MJ) et les dés de jeu que pendant la partie.
//
// Joueur → MJ : {kind: 'action', action, data}
// MJ → joueur : {kind: 'result', action, data}  action faite
//               {kind: 'refused', action, message}
// (l'état du jeu et du perso part de playerView.js)
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

const STATS = ['combat', 'pilotage', 'engineering', 'survival', 'recon'];
const MODULES = ['', 'scanner', 'proximity', 'motors', 'oxygen', 'energy', 'gravity'];

const refuse = (message) => ({refused: message});
const NOT_CREATION = 'La création des persos n\'est pas ouverte : le MJ doit être sur la page des personnages.';
const NOT_LIVE = 'Les dés se lancent pendant la partie.';
const inCreation = () => CONFIG.gameState === 'creation';
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
        // Races de base et customs cochées par le MJ pour la partie
        if (!races.isAllowed(String(data.race || '')))
            return refuse('Race inconnue.');
        return {action: 'set-race', uid: player.id, race: data.race};
    },
    // Dé suivant d'une stat, tiré par le serveur (création du perso)
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
    // Emoji seulement : le texte est affiché tel quel sur l'écran du MJ
    emote: async (player, data) => {
        let emoji = text(data.emoji, 16);
        if (!emoji || /[<>&"']/.test(emoji))
            return refuse('Emote invalide.');
        return {action: 'emote', emoji: emoji, type: 'glyph', uid: player.id};
    },
    // Vote pour un choix de la carte affichée (null : retirer son vote).
    // Le MJ voit les votes et choisit lui-même.
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
    // Synopsis et fiche du vaisseau : prêt à continuer (ou plus)
    'intro-ready': async (player, data) => {
        if (!await characterOf(player.id))
            return refuse('Il faut un perso pour voter.');
        let result = intro.vote(player.id, !!data.ready);
        if (result.error)
            return refuse(result.error);
        return {action: 'passThrough', data: result.payload};
    },
    // Utiliser un objet de son inventaire : demande au MJ, qui accepte ou non
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
    // Chat : salon commun, ou privé (seul le MJ le lit). Signé du nom du
    // perso s'il en a un, sinon du pseudo du lobby.
    chat: async (player, data) => {
        let character = await characterOf(player.id);
        let result = chat.fromPlayer(player, character ? character.name : player.name, data);
        if (result.error)
            return refuse(result.error);
        return {done: true, action: 'chat'};
    },
    // Donner un objet de son inventaire à un autre joueur (comme /donner) ou
    // le ranger dans le vaisseau ; toujours depuis le sien, jamais celui d'un
    // autre (all : toute la pile)
    'inventory-move': async (player, data) => {
        let to = data.to || {};
        if (to.type === 'ship')
            return {action: 'inventory-move', data: {slug: String(data.slug || ''), from: {type: 'player', id: player.id}, to: {type: 'ship'}, all: !!data.all}};
        if (to.type !== 'player' || String(to.id || '') === player.id)
            return refuse('On ne peut donner un objet qu\'à un autre joueur ou au vaisseau.');
        return {action: 'inventory-move', data: {slug: String(data.slug || ''), from: {type: 'player', id: player.id}, to: {type: 'player', id: String(to.id)}, all: !!data.all}};
    },
    // Demander un objet à un autre joueur (ou au vaisseau) : on ne le prend
    // pas, le logo de son rôle s'affiche à côté et un message part dans le
    // salon. Une seconde demande du même objet la retire.
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

// run(message) exécute une action comme si elle venait d'une page du MJ et
// renvoie ses messages ; broadcast(message) les envoie aux pages du MJ
const init = function ({run, broadcast}) {
    lobby.onPlayerMessage(async (player, message) => {
        if (!player.name)
            return; // pas (ou plus) dans le lobby
        let action = await translate(player, message);
        if (!action)
            return;
        if (action.refused)
            return lobby.sendTo(player.id, {kind: 'refused', action: message.action, message: action.refused});

        if (action.done)
            return; // déjà fait et diffusé (chat)
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
