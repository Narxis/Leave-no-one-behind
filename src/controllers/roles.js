// Player roles (captain, pilot…): defined in src/config/roles.json.
// The GM gives one to each player on the characters sheet; a role gives
// extra dice on rolls of its stat, and the best die is kept
const fs = require('fs');
const {Player} = require('../models/player');

const CONFIG_FILE = __dirname + '/../config/roles.json';

// Re-read each time: a file change counts without restarting
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

// What the pages and the players see
const publicRole = function (slug) {
    let role = find(slug);
    return role ? {slug: role.slug, name: role.name, effect: role.effect || '', icon: role.icon || ''} : null;
}

// Number of dice for a roll: 1, plus the role bonus if it is its stat
const diceCount = function (player, stat) {
    let role = find(player && player.role);
    if (!role || !role.stat || role.stat !== stat)
        return 1;
    return 1 + Math.max(0, parseInt(role.bonus) || 0);
}

// Rolls the dice of a roll (from 1 to 100) and keeps the best
const rollDice = function (count, random = Math.random) {
    let dice = [];
    for (let i = 0; i < Math.max(1, count); i++)
        dice.push(Math.floor(random() * 100) + 1);
    return {dice: dice, kept: Math.max(...dice)};
}

// Gives a role to a player ('': none). If the role is unique, the player
// who had it loses it. Returns the changed players, or null if refused
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
