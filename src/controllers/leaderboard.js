const fs = require('fs');
const allies = require('./allies');
const gameSettings = require('./gameSettings');

// Classement des équipes. Le MJ nomme l'équipe avant de lancer la partie ;
// son score est enregistré à l'écran de fin. Gardé dans un fichier (comme les
// alliés) : la configuration en base est remise à zéro à chaque démarrage du
// serveur, le classement doit survivre aux parties et aux redémarrages.
// Dans le dossier de données (voir config/paths.js)
const FILE = require('../config/paths').cache('leaderboard.json');
const NAME_MAX = 40;

let data = {current: null, entries: []};

const load = function () {
    try {
        let raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        data = {current: raw.current || null, entries: Array.isArray(raw.entries) ? raw.entries : []};
    } catch (e) {
        data = {current: null, entries: []};
    }
}

const save = function () {
    try {
        fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        log('[LEADERBOARD] ' + e);
    }
}

const cleanName = (v) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);

// Nouvelle partie pour cette équipe : un nouvel identifiant, pour que deux
// parties de la même équipe donnent deux lignes au classement
const setTeam = function (name) {
    name = cleanName(name);
    if (!name)
        return null;
    data.current = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        team: name,
        startedAt: new Date().toISOString(),
        // Réglages de la partie, pour comparer les scores à réglages égaux
        settings: gameSettings.get()
    };
    save();
    return data.current;
}

const getCurrent = () => data.current ? Object.assign({}, data.current) : null;

const STATS = ['combat', 'pilotage', 'engineering', 'survival', 'recon', 'moral'];

// Pseudo Discord d'un joueur, demandé au bot (s'il tourne), 2 s au plus
const discordName = async function (discord_id) {
    let client;
    try {
        client = require('./discord').getClient();
    } catch (e) {
        return '';
    }
    if (!client || !client.isReady || !client.isReady())
        return '';
    try {
        let user = await Promise.race([
            client.users.fetch(String(discord_id)),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
        ]);
        return user.globalName && user.globalName !== user.username
            ? user.globalName + ' (@' + user.username + ')'
            : '@' + user.username;
    } catch (e) {
        return '';
    }
}

// Composition de l'équipe au moment du score : personnages et compagnons
const teamMembers = async function () {
    let players = await DB.tables.players.findAll({raw: true});
    let members = await Promise.all(players.map(async (p) => ({
        name: p.name || '',
        race: p.race || '',
        discord: await discordName(p.discord_id),
        stats: Object.fromEntries(STATS.map(s => [s, Number(p[s]) || 0]))
    })));
    let npcs = allies.getAllies().map(a => ({name: a.name, race: a.race || ''}));
    return {members, npcs};
}

// Score de la partie en cours (écran de fin). Recharger l'écran met à jour
// la même ligne au lieu d'en ajouter une (la durée reste celle du premier
// affichage). Renvoie l'identifiant de la ligne
const record = async function (result) {
    if (!data.current)
        return null;
    let at = data.entries.findIndex(e => e.id === data.current.id);
    let previous = at >= 0 ? data.entries[at] : null;
    let team = {members: [], npcs: []};
    try {
        team = await teamMembers();
    } catch (e) {
        log('[LEADERBOARD] ' + e);
    }
    let now = new Date();
    let entry = {
        id: data.current.id,
        team: data.current.team,
        score: Math.round(Number(result.score) || 0),
        cryopods: Math.round(Number(result.cryopods) || 0),
        planet: String(result.planet || ''),
        breakdown: {
            ship: Math.round(Number(result.scoreShip) || 0),
            planet: Math.round(Number(result.scorePlanet) || 0),
            cards: Math.round(Number(result.scoreCards) || 0)
        },
        startedAt: data.current.startedAt,
        duration: previous && previous.duration ? previous.duration : now - new Date(data.current.startedAt),
        // Pseudo déjà trouvé gardé si le bot ne répond pas cette fois-ci
        members: team.members.map(m => {
            let old = previous && previous.members && previous.members.find(o => o.name === m.name);
            return m.discord || !old ? m : Object.assign(m, {discord: old.discord});
        }),
        npcs: team.npcs,
        settings: data.current.settings || (previous && previous.settings) || null,
        date: previous ? previous.date : now.toISOString()
    };
    if (at >= 0)
        data.entries[at] = entry;
    else
        data.entries.push(entry);
    save();
    return entry.id;
}

const list = function () {
    return data.entries.slice().sort((a, b) => b.score - a.score);
}

load();

module.exports = {setTeam, getCurrent, record, list, NAME_MAX};
