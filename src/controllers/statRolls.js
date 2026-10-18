// Tirage des stats à la création du perso, comme le bouton du bot Discord
// (src/commands/buttons/roll-stats.js), mais dés lancés par le serveur :
// - chaque stat a |bonus de race| + 1 dés de 1 à 50 ;
// - bonus positif : on garde le meilleur dé, négatif : le pire ;
// - stat finale = dé gardé + 50, moral à 100.
// Les dés déjà lancés restent en mémoire jusqu'à la fin du tirage.
const races = require('./races');

const STATS = ['combat', 'pilotage', 'engineering', 'survival', 'recon'];
const rolls = new Map(); // id du joueur → {race, dice: {stat: [valeurs]}}
// Dernier tirage terminé, gardé pour que le joueur voie son dernier dé
// avant de passer à sa fiche
const finished = new Map();

const dieCount = (mod) => Math.abs(parseInt(mod) || 0) + 1;
const modsOf = (race) => races.getStats()[race] || {};

// Stats déjà tirées : un perso créé a ses stats au-dessus de 50
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

// Ce que voit le joueur : dés lancés, dés restants et dé gardé par stat.
// Une fois fini, le dernier tirage reste visible (stats) s'il est connu.
const state = function (player) {
    if (!player.race)
        return {step: 'race'};
    if (isDone(player)) {
        let last = finished.get(player.discord_id);
        return last && last.race === player.race ? {step: 'done', stats: statsOf(player.race, last)} : {step: 'done'};
    }
    return {step: 'stats', stats: statsOf(player.race, current(player))};
};

// Lance le dé suivant de cette stat. Renvoie {dice} pendant le tirage,
// {stats} quand tout est tiré (à enregistrer), ou {error}
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

// Premier dé lancé : la race ne change plus (sinon changer de race et
// revenir relancerait les dés)
const started = function (player) {
    let entry = rolls.get(player.discord_id);
    return !!(entry && entry.race === player.race && STATS.some(s => entry.dice[s].length));
};

const reset = (id) => { rolls.delete(id); finished.delete(id); };

module.exports = {state, roll, reset, isDone, started, STATS};
