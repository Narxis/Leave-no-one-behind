const fs = require('fs');
const path = require('path');

// Classement des équipes. Le MJ nomme l'équipe avant de lancer la partie ;
// son score est enregistré à l'écran de fin. Gardé dans un fichier (comme les
// alliés) : la configuration en base est remise à zéro à chaque démarrage du
// serveur, le classement doit survivre aux parties et aux redémarrages.
// Chemin relatif au dossier du serveur, pour qu'un serveur de test lancé
// ailleurs avec sa copie de storage n'écrive pas dans celle du jeu
const FILE = path.join(process.cwd(), 'storage/cache/leaderboard.json');
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
        startedAt: new Date().toISOString()
    };
    save();
    return data.current;
}

const getCurrent = () => data.current ? Object.assign({}, data.current) : null;

// Score de la partie en cours (écran de fin). Recharger l'écran met à jour
// la même ligne au lieu d'en ajouter une. Renvoie l'identifiant de la ligne
const record = function (result) {
    if (!data.current)
        return null;
    let entry = {
        id: data.current.id,
        team: data.current.team,
        score: Math.round(Number(result.score) || 0),
        cryopods: Math.round(Number(result.cryopods) || 0),
        planet: String(result.planet || ''),
        date: new Date().toISOString()
    };
    let at = data.entries.findIndex(e => e.id === entry.id);
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
