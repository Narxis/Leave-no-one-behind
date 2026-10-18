// Demandes d'objets entre joueurs en ligne. Un joueur donne ce qu'il a, mais
// ne prend jamais dans l'inventaire d'un autre ni dans le vaisseau : il
// demande. Sa demande pose le logo de son rôle à côté de l'objet (écran de jeu
// et écran porté, inventory.js) et un message part en son nom dans le chat.
// Elle tombe d'elle-même quand l'objet quitte cet inventaire.
//
// Pages du MJ et écran porté : {action: 'item-requests', data: {requests}}
//   requests : [{owner: {type: 'player', id} | {type: 'ship'}, slug, from: [{id, name}]}]

const requests = new Map(); // clé (inventaire|objet) → {owner, slug, from: Map(id → nom)}

const keyOf = (owner, slug) => (owner.type === 'ship' ? 'ship' : 'player:' + owner.id) + '|' + slug;

const cleanOwner = (owner) => owner && owner.type === 'ship' ? {type: 'ship'}
    : owner && owner.type === 'player' && owner.id ? {type: 'player', id: String(owner.id)} : null;

// Demande (ou retire la demande) d'un joueur. Renvoie {active} ou {error}
const toggle = function (requester, owner, slug) {
    owner = cleanOwner(owner);
    slug = String(slug || '');
    if (!owner || !slug)
        return {error: 'Objet inconnu.'};
    if (owner.type === 'player' && owner.id === String(requester.id))
        return {error: 'Cet objet est déjà à toi.'};
    let key = keyOf(owner, slug);
    let entry = requests.get(key);
    if (entry && entry.from.has(String(requester.id))) {
        entry.from.delete(String(requester.id));
        if (!entry.from.size)
            requests.delete(key);
        return {active: false};
    }
    if (!entry)
        requests.set(key, entry = {owner, slug, from: new Map()});
    entry.from.set(String(requester.id), String(requester.name || ''));
    return {active: true};
};

const list = () => Array.from(requests.values()).map(r => ({
    owner: Object.assign({}, r.owner), slug: r.slug,
    from: Array.from(r.from, ([id, name]) => ({id, name}))
}));

// Demandes sur les objets d'un joueur (sa page : « Mira te demande… »)
const forOwner = (id) => list().filter(r => r.owner.type === 'player' && r.owner.id === String(id))
    .map(r => ({slug: r.slug, from: r.from}));

// Objets partis (donnés, utilisés, jetés) : leurs demandes tombent.
// inventories : {id: [{slug}]}, ship : [{slug}]. Renvoie true si ça a changé
const prune = function (inventories, ship) {
    let changed = false;
    for (let [key, r] of requests) {
        let items = r.owner.type === 'ship' ? ship || [] : (inventories || {})[r.owner.id] || [];
        if (!items.some(item => item.slug === r.slug)) {
            requests.delete(key);
            changed = true;
        }
    }
    return changed;
};

const payload = () => ({action: 'item-requests', error: false, data: {requests: list()}});

const clear = () => requests.clear();

module.exports = {toggle, list, forOwner, prune, payload, clear};
