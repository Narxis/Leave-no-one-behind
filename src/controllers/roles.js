// Rôles des joueurs (capitaine, pilote…) : définis dans src/config/roles.json.
// Le MJ en donne un à chaque joueur sur la fiche des persos ; un rôle donne
// des dés en plus sur les jets de sa stat, et on garde le meilleur dé
const fs = require('fs');
const {Player} = require('../models/player');

const CONFIG_FILE = __dirname + '/../config/roles.json';

// Relu à chaque fois : un changement du fichier compte sans redémarrer
const load = function () {
    try {
        let conf = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        return {unique: conf.unique !== false, roles: Array.isArray(conf.roles) ? conf.roles : []};
    } catch (e) {
        log('[ROLES] ' + e);
        return {unique: true, roles: []};
    }
}

const list = () => load().roles;

const find = (slug) => slug ? list().find(r => r.slug === slug) || null : null;

// Ce que voient les pages et les joueurs
const publicRole = function (slug) {
    let role = find(slug);
    return role ? {slug: role.slug, name: role.name, effect: role.effect || '', icon: role.icon || ''} : null;
}

// Nombre de dés d'un jet : 1, plus le bonus du rôle si c'est sa stat
const diceCount = function (player, stat) {
    let role = find(player && player.role);
    if (!role || !role.stat || role.stat !== stat)
        return 1;
    return 1 + Math.max(0, parseInt(role.bonus) || 0);
}

// Lance les dés d'un jet (de 1 à 100) et garde le meilleur
const rollDice = function (count, random = Math.random) {
    let dice = [];
    for (let i = 0; i < Math.max(1, count); i++)
        dice.push(Math.floor(random() * 100) + 1);
    return {dice: dice, kept: Math.max(...dice)};
}

// Donne un rôle à un joueur ('' : aucun). Si le rôle est unique, le joueur
// qui l'avait le perd. Renvoie les joueurs modifiés, ou null si refusé
const assign = async function (discord_id, slug) {
    slug = slug || '';
    if (slug && !find(slug))
        return null;
    let player = await new Player().getData(discord_id);
    if (!player)
        return null;
    let changed = [];
    if (slug && load().unique) {
        let holders = await DB.tables.players.findAll({where: {role: slug}, raw: true});
        for (let holder of holders) {
            if (String(holder.discord_id) === String(discord_id))
                continue;
            changed.push(await new Player().update({role: ''}, holder.discord_id));
        }
    }
    changed.push(await new Player().update({role: slug}, discord_id));
    return changed;
}

module.exports = {list, find, publicRole, diceCount, rollDice, assign};
