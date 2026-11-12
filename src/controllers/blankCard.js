const {Player} = require('../models/player');
const gameSettings = require('./gameSettings');

// Blank card: the players suggest a free action ("Autre…" choice
// of RP cards), the GM writes the follow-up on the spot from their menu (text,
// up to 4 choices with their result, morale, humans, loot) and shows it on
// the game screen. After it, drawing resumes normally.
// Kept in memory, like the combat state:
//   null                          nothing in progress
//   {status: 'waiting', from}     the players are waiting for the GM's follow-up
//   {status: 'shown', card}       shown, waiting for the choice
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

// Cards that get "Autre…": events and places with at least two
// choices, without a timer (the last choice there is the time-out one, and a
// free action would go against the urgency), if the game option is checked
const eligible = function (card) {
    if (!card || !Array.isArray(card.choices) || card.choices.length < 2)
        return false;
    if (![TYPE_NEUTRAL, TYPE_POSITIVE, TYPE_NEGATIVE, TYPE_PLACE].includes(card.type))
        return false;
    if (card.timer === 1 || card.timer === true || card.timer === '1')
        return false;
    return !!gameSettings.get().otherChoice;
};

// Adds "Autre…" to the card (only once)
const addOther = function (card) {
    if (eligible(card) && !card.choices.some(c => c.other))
        card.choices.push({value: OTHER_LABEL, other: true, reveal: '', mjreveal: '', next: '', humans: 0, loot: []});
    return card;
};

// Card written by the GM, clamped. null if it is empty
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

// The card as online players see it (without the results)
const publicCard = function () {
    if (!state)
        return null;
    if (state.status === 'waiting')
        return {id: 'blank', kind: 'blank', desc: 'Action libre proposée : le MJ prépare la suite.', timer: false, choices: []};
    return {id: 'blank', kind: 'blank', desc: state.card.desc, timer: false, choices: state.card.choices.map(c => c.value)};
};

const message = (action, data) => ({action, error: false, data});

// Each player's morale moves by the same amount (clamped to 0–100, like the
// tabs). Returns the messages that update the tabs
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
        // Game screen: the players chose "Autre…"
        case 'blank-card-request':
            state = {status: 'waiting', from: text(data.desc, MAX_DESC)};
            return message('blank-card-request', getState());
        // GM menu: the card is ready
        case 'blank-card-show': {
            let card = clean(data);
            if (!card)
                return {action: 'blank-card-show', error: true, error_msg: 'Carte blanche vide', data: {}};
            state = {status: 'shown', card};
            return message('blank-card-show', card);
        }
        // Game screen: choice made (-1: card without choices, "Continuer")
        case 'blank-card-choice': {
            if (!state || state.status !== 'shown')
                return {action: 'blank-card-choice', error: true, error_msg: 'Pas de carte blanche affichée', data: {}};
            let choice = state.card.choices[parseInt(data.index)] || null;
            state = null;
            let stats = await changeMoral(choice ? choice.moral : 0);
            return [message('blank-card-choice', {index: parseInt(data.index), choice})].concat(stats);
        }
        // GM menu: forget it, the game screen goes back to the previous card
        case 'blank-card-cancel':
            state = null;
            return message('blank-card-cancel', {});
    }
    return null;
};

// New game
const reset = function () {
    state = null;
};

module.exports = {OTHER_LABEL, MAX_CHOICES, eligible, addOther, clean, handle, getState, publicCard, reset};
