const {Player} = require('../models/player');
const gameSettings = require('./gameSettings');

// Carte blanche : les joueurs proposent une action libre (choix « Autre… »
// des cartes RP), le MJ écrit la suite sur le moment depuis son menu (texte,
// jusqu'à 4 choix avec leur résultat, moral, humains, butin) et l'affiche sur
// l'écran de jeu. Après elle, la pioche reprend normalement.
// Gardée en mémoire, comme l'état du combat :
//   null                          rien en cours
//   {status: 'waiting', from}     les joueurs attendent la suite du MJ
//   {status: 'shown', card}       affichée, en attente du choix
let state = null;

const OTHER_LABEL = 'Autre…';
const MAX_CHOICES = 4;
const MAX_DESC = 2000;
const MAX_VALUE = 80;
const MAX_REVEAL = 1000;
const MAX_LOOT = 3;
const MORAL_LIMIT = 100;
const HUMANS_LIMIT = 1000;

const text = (v, max) => String(v === undefined || v === null ? '' : v).trim().slice(0, max);
const bounded = function (v, limit) {
    let n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(-limit, Math.min(limit, n)) : 0;
};

// Cartes qui reçoivent « Autre… » : événements et lieux avec au moins deux
// choix, sans chrono (le dernier choix y est celui du temps écoulé, et une
// action libre irait contre l'urgence), si l'option de partie est cochée
const eligible = function (card) {
    if (!card || !Array.isArray(card.choices) || card.choices.length < 2)
        return false;
    if (![TYPE_NEUTRAL, TYPE_POSITIVE, TYPE_NEGATIVE, TYPE_PLACE].includes(card.type))
        return false;
    if (card.timer === 1 || card.timer === true || card.timer === '1')
        return false;
    return !!gameSettings.get().otherChoice;
};

// Ajoute « Autre… » à la carte (une seule fois)
const addOther = function (card) {
    if (eligible(card) && !card.choices.some(c => c.other))
        card.choices.push({value: OTHER_LABEL, other: true, reveal: '', mjreveal: '', next: '', humans: 0, loot: []});
    return card;
};

// Carte écrite par le MJ, bornée. null si elle est vide
const clean = function (input) {
    if (!input || typeof input !== 'object')
        return null;
    let choices = (Array.isArray(input.choices) ? input.choices : [])
        .map(c => c && typeof c === 'object' ? {
            value: text(c.value, MAX_VALUE),
            reveal: text(c.reveal, MAX_REVEAL),
            moral: bounded(c.moral, MORAL_LIMIT),
            humans: bounded(c.humans, HUMANS_LIMIT),
            loot: (Array.isArray(c.loot) ? c.loot : [c.loot]).map(l => text(l, 60)).filter(Boolean).slice(0, MAX_LOOT)
        } : null)
        .filter(c => c && c.value)
        .slice(0, MAX_CHOICES);
    let desc = text(input.desc, MAX_DESC);
    if (!desc && !choices.length)
        return null;
    return {desc, choices};
};

const getState = () => state ? JSON.parse(JSON.stringify(state)) : null;

// La carte telle que les joueurs en ligne la voient (sans les résultats)
const publicCard = function () {
    if (!state)
        return null;
    if (state.status === 'waiting')
        return {id: 'blank', kind: 'blank', desc: 'Action libre proposée : le MJ prépare la suite.', timer: false, choices: []};
    return {id: 'blank', kind: 'blank', desc: state.card.desc, timer: false, choices: state.card.choices.map(c => c.value)};
};

const message = (action, data) => ({action, error: false, data});

// Le moral de chaque joueur bouge du même nombre (borné à 0–100, comme les
// onglets). Renvoie les messages qui mettent les onglets à jour
const changeMoral = async function (delta) {
    if (!delta)
        return [];
    let out = [];
    let players = await DB.tables.players.findAll({raw: true});
    for (let p of players) {
        let moral = Math.max(0, Math.min(100, (parseInt(p.moral) || 0) + delta));
        let player = await new Player().update({moral}, p.discord_id);
        if (player) {
            delete player['accepted_datas'];
            out.push(message('playerStat', player));
        }
    }
    return out;
};

const handle = async function (response) {
    let data = response.data || {};
    switch (response.action) {
        // Écran de jeu : les joueurs ont choisi « Autre… »
        case 'blank-card-request':
            state = {status: 'waiting', from: text(data.desc, MAX_DESC)};
            return message('blank-card-request', getState());
        // Menu MJ : la carte est prête
        case 'blank-card-show': {
            let card = clean(data);
            if (!card)
                return {action: 'blank-card-show', error: true, error_msg: 'Carte blanche vide', data: {}};
            state = {status: 'shown', card};
            return message('blank-card-show', card);
        }
        // Écran de jeu : choix fait (-1 : carte sans choix, « Continuer »)
        case 'blank-card-choice': {
            if (!state || state.status !== 'shown')
                return {action: 'blank-card-choice', error: true, error_msg: 'Pas de carte blanche affichée', data: {}};
            let choice = state.card.choices[parseInt(data.index)] || null;
            state = null;
            let stats = await changeMoral(choice ? choice.moral : 0);
            return [message('blank-card-choice', {index: parseInt(data.index), choice})].concat(stats);
        }
        // Menu MJ : on oublie, l'écran de jeu reprend la carte d'avant
        case 'blank-card-cancel':
            state = null;
            return message('blank-card-cancel', {});
    }
    return null;
};

// Nouvelle partie
const reset = function () {
    state = null;
};

module.exports = {OTHER_LABEL, MAX_CHOICES, eligible, addOther, clean, handle, getState, publicCard, reset};
