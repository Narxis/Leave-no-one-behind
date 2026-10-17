// Entrées de butin (choix des cartes, ennemis, combat) : un nom seul vaut un
// exemplaire, {name, qty} en donne plusieurs d'un coup (« 3 Munitions »)
const MAX_QTY = 999;
const NAME_MAX = 60;

const qtyOf = function (value) {
    let n = parseInt(value);
    return Number.isFinite(n) ? Math.min(Math.max(n, 1), MAX_QTY) : 1;
}

// {name, qty} ou null si le nom est vide
const entry = function (raw) {
    let obj = raw && typeof raw === 'object';
    let name = String((obj ? raw.name : raw) || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
    if (!name)
        return null;
    return {name: name, qty: qtyOf(obj ? raw.qty : 1)};
}

// Forme enregistrée : le nom seul pour un exemplaire (comme avant)
const stored = (e) => e.qty > 1 ? {name: e.name, qty: e.qty} : e.name;

module.exports = {entry, stored, qtyOf, MAX_QTY};
