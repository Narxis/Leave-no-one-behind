// Stat roll at character creation, like the Discord bot button
// (src/commands/buttons/roll-stats.js), but dice rolled by the server:
// - each stat has |race bonus| + 1 dice from 1 to 50;
// - positive bonus: the best die is kept, negative: the worst;
// - final stat = kept die + 50, morale at 100.
// Dice already rolled stay in memory until the end of the roll.
const races = require('./races');

const STATS = ['combat', 'pilotage', 'engineering', 'survival', 'recon'];
const rolls = new Map(); // player id → {race, dice: {stat: [values]}}
// Last finished roll, kept so the player sees their last die
// before going to their sheet
const finished = new Map();

const dieCount = (mod) => Math.abs(parseInt(mod) || 0) + 1;
const modsOf = (race) => races.getStats()[race] || {};

// Stats already rolled: a created character has their stats above 50
const isDone = (player) => STATS.every(s => (parseInt(player[s]) || 0) > 0);

const kept = function (dice, mod) {
    if (!dice.length)
        return null;
    if (mod > 0)
        return Math.max(...dice);
    if (mod < 0)
        return Math.min(...dice);
    return dice[0];
};

const current = function (player) {
    let entry = rolls.get(player.discord_id);
    if (!entry || entry.race !== player.race) {
        entry = {race: player.race, dice: Object.fromEntries(STATS.map(s => [s, []]))};
        rolls.set(player.discord_id, entry);
    }
    return entry;
};

const statsOf = function (race, entry) {
    let mods = modsOf(race);
    return STATS.map(stat => {
        let mod = parseInt(mods[stat]) || 0;
        return {stat, mod, dice: entry.dice[stat], total: dieCount(mod), kept: kept(entry.dice[stat], mod)};
    });
};

// What the player sees: dice rolled, dice remaining and kept die per stat.
// Once finished, the last roll stays visible (stats) if it is known.
const state = function (player) {
    if (!player.race)
        return {step: 'race'};
    if (isDone(player)) {
        let last = finished.get(player.discord_id);
        return last && last.race === player.race ? {step: 'done', stats: statsOf(player.race, last)} : {step: 'done'};
    }
    return {step: 'stats', stats: statsOf(player.race, current(player))};
};

// Rolls the next die of this stat. Returns {dice} during the roll,
// {stats} when everything is rolled (to save), or {error}
const roll = function (player, stat, random = Math.random) {
    if (!STATS.includes(stat))
        return {error: 'Stat inconnue.'};
    if (!player.race)
        return {error: 'Choisis d\'abord ta race.'};
    if (isDone(player))
        return {error: 'Tes stats sont déjà tirées.'};
    let mods = modsOf(player.race);
    let entry = current(player);
    let dice = entry.dice[stat];
    if (dice.length >= dieCount(mods[stat]))
        return {error: 'Plus de dé à lancer pour cette stat.'};
    dice.push(Math.floor(random() * 50) + 1);

    if (STATS.some(s => entry.dice[s].length < dieCount(mods[s])))
        return {dice: entry.dice};
    let stats = {moral: 100};
    for (let s of STATS)
        stats[s] = kept(entry.dice[s], parseInt(mods[s]) || 0) + 50;
    rolls.delete(player.discord_id);
    finished.set(player.discord_id, entry);
    return {dice: entry.dice, stats: stats};
};

// First die rolled: the race no longer changes (otherwise changing race and
// coming back would re-roll the dice)
const started = function (player) {
    let entry = rolls.get(player.discord_id);
    return !!(entry && entry.race === player.race && STATS.some(s => entry.dice[s].length));
};

const reset = (id) => { rolls.delete(id); finished.delete(id); };

module.exports = {state, roll, reset, isDone, started, STATS};
