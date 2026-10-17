const fs = require('fs');
const path = require('path');

// Monnaie du jeu : son nom et ses taux sont dans config/currency.json (à
// changer là, sans toucher au code). Chaque joueur a sa bourse (colonne
// players.credits) et le vaisseau une caisse de bord commune (ship.credits).
// Les cryopods restent un paiement possible chez les marchands, au cours
// cryopodsPerCredit (5 cryopods pour 1 crédit par défaut).
// Dans un butin, la monnaie est une entrée comme les objets : son nom (ou
// « monnaie ») et sa quantité, ex. {name: 'Crédits', qty: 30}.

const FILE = path.join(__dirname, '../config/currency.json');
const DEFAULTS = {name: 'crédit', plural: 'crédits', short: 'cr', lore: '', cryopodsPerCredit: 5, sellRatio: 0.5, startPlayer: 0, startShip: 0};
const SLUG = 'monnaie';
const IMAGE = '/img/monnaie.svg';
const MAX = 999999;

const config = function () {
    let cfg;
    try {
        cfg = Object.assign({}, DEFAULTS, JSON.parse(fs.readFileSync(FILE, 'utf8')));
    } catch (e) {
        cfg = Object.assign({}, DEFAULTS);
    }
    for (let key of ['cryopodsPerCredit', 'sellRatio', 'startPlayer', 'startShip'])
        cfg[key] = Number.isFinite(Number(cfg[key])) && Number(cfg[key]) >= 0 ? Number(cfg[key]) : DEFAULTS[key];
    return cfg;
}

const toInt = (v) => Number.isFinite(parseInt(v)) ? parseInt(v) : 0;
const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// « 1 crédit », « 30 crédits » (0 et 1 au singulier)
const label = function (amount, cfg) {
    cfg = cfg || config();
    return amount + ' ' + (Math.abs(amount) >= 2 ? cfg.plural : cfg.name);
}

// Le nom d'une entrée de butin désigne-t-il la monnaie ?
const isMoney = function (name) {
    let cfg = config();
    return [cfg.name, cfg.plural, cfg.short, SLUG].map(norm).includes(norm(name));
}

// La monnaie telle qu'elle apparaît dans un butin
const lootItem = function (qty) {
    return {name: capitalize(config().plural), slug: SLUG, image: IMAGE, money: true, qty: qty || 1};
}

// Prix en cryopods d'un prix en crédits, et prix de rachat par un marchand
const cryopodPrice = (credits, cfg) => Math.ceil(credits * (cfg || config()).cryopodsPerCredit);
const sellPrice = (credits, cfg) => Math.floor(credits * (cfg || config()).sellRatio);

// Ce que les pages affichent de la monnaie
const publicConfig = function () {
    let cfg = config();
    return {name: cfg.name, plural: cfg.plural, short: cfg.short, lore: cfg.lore, cryopodsPerCredit: cfg.cryopodsPerCredit, sellRatio: cfg.sellRatio, image: IMAGE};
}

/* ---------- Bourses ---------- */

// Une seule ligne de vaisseau par partie (son id change à chaque partie)
const shipRow = () => DB.tables.ship.findOne({raw: true, order: [['id', 'ASC']]});

// {players: {discord_id: montant}, ship: montant}
const wallets = async function () {
    let out = {players: {}, ship: 0};
    for (let p of await DB.tables.players.findAll({raw: true}))
        out.players[p.discord_id] = p.credits || 0;
    let ship = await shipRow();
    out.ship = ship ? ship.credits || 0 : 0;
    return out;
}

// target : {type: 'player', id} ou {type: 'ship'}. null si inconnu
const balance = async function (target) {
    target = target || {};
    if (target.type === 'ship') {
        let ship = await shipRow();
        return ship ? ship.credits || 0 : null;
    }
    if (target.type === 'player') {
        let p = await DB.tables.players.findOne({raw: true, where: {discord_id: String(target.id || '')}});
        return p ? p.credits || 0 : null;
    }
    return null;
}

const write = async function (target, value) {
    if (target.type === 'ship')
        await DB.tables.ship.update({credits: value}, {where: {id: (await shipRow()).id}});
    else
        await DB.tables.players.update({credits: value}, {where: {discord_id: String(target.id)}});
}

// Ajoute (ou retire, si négatif) de la monnaie. Une bourse ne passe jamais
// sous zéro : {error} si elle n'a pas assez. Renvoie {balance}
const add = async function (target, amount) {
    amount = toInt(amount);
    let current = await balance(target);
    if (current === null)
        return {error: 'Bourse introuvable'};
    if (current + amount < 0)
        return {error: 'Pas assez de ' + config().plural + ' (' + label(current) + ')'};
    let value = Math.min(current + amount, MAX);
    await write(target, value);
    return {balance: value};
}

// Donne de l'argent d'une bourse à une autre
const transfer = async function (from, to, amount) {
    amount = toInt(amount);
    if (amount <= 0)
        return {error: 'Montant invalide'};
    if (await balance(to) === null)
        return {error: 'Bourse introuvable'};
    let out = await add(from, -amount);
    if (out.error)
        return out;
    await add(to, amount);
    return {ok: true};
}

// Début de partie : chaque joueur reçoit startPlayer, la caisse startShip
const reset = async function () {
    let cfg = config();
    await DB.tables.players.update({credits: Math.round(cfg.startPlayer)}, {where: {}});
    await DB.tables.ship.update({credits: Math.round(cfg.startShip)}, {where: {}});
}

/* ---------- Cryopods ---------- */

const cryopods = async function () {
    let ship = await shipRow();
    return ship ? ship.cryopods : 0;
}

// Retire des cryopods (paiement). {error} s'il n'y en a pas assez
const spendCryopods = async function (amount) {
    let ship = await shipRow();
    let current = ship ? ship.cryopods : 0;
    if (!ship || amount > current)
        return {error: 'Pas assez de cryopods (' + current + ')'};
    await DB.tables.ship.update({cryopods: current - amount}, {where: {id: ship.id}});
    return {cryopods: current - amount};
}

module.exports = {config, publicConfig, label, isMoney, lootItem, cryopodPrice, sellPrice,
    wallets, balance, add, transfer, reset, cryopods, spendCryopods, SLUG, IMAGE, MAX};
