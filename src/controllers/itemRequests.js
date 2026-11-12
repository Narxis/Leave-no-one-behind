// Item requests between online players. A player gives what they have, but
// never takes from someone else's inventory or from the ship: they
// request. Their request puts their role logo next to the item (game screen
// and ported screen, inventory.js) and a message goes to the chat in their name.
// It drops by itself when the item leaves that inventory.
//
// GM pages and ported screen: {action: 'item-requests', data: {requests}}
//   requests: [{owner: {type: 'player', id} | {type: 'ship'}, slug, from: [{id, name}]}]

const requests = new Map(); // key (inventory|item) → {owner, slug, from: Map(id → name)}

const keyOf = (owner, slug) => (owner.type === 'ship' ? 'ship' : 'player:' + owner.id) + '|' + slug;

const cleanOwner = (owner) => owner && owner.type === 'ship' ? {type: 'ship'}
    : owner && owner.type === 'player' && owner.id ? {type: 'player', id: String(owner.id)} : null;

// A player's request (or withdrawal of it). Returns {active} or {error}
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

// Requests on a player's items (their page: "Mira te demande…")
const forOwner = (id) => list().filter(r => r.owner.type === 'player' && r.owner.id === String(id))
    .map(r => ({slug: r.slug, from: r.from}));

// Items gone (given, used, discarded): their requests drop.
// inventories: {id: [{slug}]}, ship: [{slug}]. Returns true if something changed
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
