// Planet scans seen by online players.
//
// The GM's planet page (planet.js) announces its state on opening and after
// each scan ("planet-screen" action): remaining detection points,
// drones, scans done with their text. Players see the planet being
// drawn layer by layer, as on the main screen: they only receive
// the values of the stats already scanned. They vote for the next scan
// (votes.js); the GM scans on their page.
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
        // Planet lab: unlimited points (null)
        points: num(data.points),
        drones: Math.max(0, parseInt(data.drones) || 0),
        done: !!data.done,
        scans
    };
    return null; // nothing for the GM pages: the player view follows (playerView)
};

// What the players see of the current planet (card: the deck card)
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
