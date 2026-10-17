// Scans de planète vus par les joueurs en ligne.
//
// La page planète du MJ (planet.js) annonce son état à l'ouverture et après
// chaque scan (action « planet-screen ») : points de détection restants,
// drones, scans faits avec leur texte. Les joueurs voient la planète se
// dessiner couche par couche, comme sur l'écran principal : ils ne reçoivent
// que les valeurs des stats déjà scannées. Ils votent pour le scan suivant
// (votes.js) ; le MJ scanne sur sa page.
const SCANS = {
    oxy: {label: 'Oxygène', modules: ['oxy']},
    cli: {label: 'Climat', modules: ['cli']},
    ff: {label: 'Faune & flore', modules: ['fau', 'flo', 'civ']},
    res: {label: 'Ressources & minerais', modules: ['res']},
    wtr: {label: 'Présence d\'eau', modules: ['wtr']},
    grv: {label: 'Gravité', modules: ['grv']}
};
const KEYS = Object.keys(SCANS);

let screen = null; // {cardId, points, drones, done, scans: {key: {cost, revealed, text}}}

const num = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

const setScreen = function (data) {
    data = data && typeof data === 'object' ? data : {};
    let scans = {};
    for (let scan of Array.isArray(data.scans) ? data.scans : []) {
        if (!scan || !KEYS.includes(scan.key))
            continue;
        scans[scan.key] = {
            cost: num(scan.cost),
            revealed: !!scan.revealed,
            text: scan.revealed ? String(scan.text || '').slice(0, 600) : ''
        };
    }
    screen = {
        cardId: data.cardId === undefined || data.cardId === null ? null : String(data.cardId),
        // Labo de planètes : points illimités (null)
        points: num(data.points),
        drones: Math.max(0, parseInt(data.drones) || 0),
        done: !!data.done,
        scans
    };
    return null; // rien pour les pages du MJ : la vue joueur suit (playerView)
};

// Ce que voient les joueurs de la planète en cours (card : la carte du paquet)
const forCard = function (card) {
    if (!card || !screen || screen.cardId !== String(card.id))
        return {id: card ? card.id : null, points: null, drones: 0, done: false, modules: {},
            scans: KEYS.map(key => ({key, label: SCANS[key].label, cost: null, revealed: false, text: ''}))};
    let modules = {};
    let source = card.modules || {};
    for (let key of KEYS) {
        let s = screen.scans[key];
        if (!s || !s.revealed)
            continue;
        for (let m of SCANS[key].modules)
            if (source[m])
                modules[m] = {val: source[m].val};
    }
    return {
        id: card.id,
        points: screen.points,
        drones: screen.drones,
        done: screen.done,
        modules,
        scans: KEYS.map(key => {
            let s = screen.scans[key] || {};
            return {key, label: SCANS[key].label, cost: s.cost === undefined ? null : s.cost, revealed: !!s.revealed, text: s.text || ''};
        })
    };
};

const clear = function () {
    screen = null;
};

module.exports = {setScreen, forCard, clear, SCANS, KEYS};
