const combat = require('./combat');

// Card loot: when a choice yields items, they wait here
// for the GM to distribute them (drag onto a player, like combat loot)
// or store them all in the ship. The next card only arrives once
// the loot is empty. Kept in memory, like the combat state
let state = {items: []};

const getState = function () {
    return JSON.parse(JSON.stringify(state));
}

const message = function (event) {
    return {action: 'card-loot', error: false, data: {state: getState(), event: event || null}};
}

// The choice was just clicked: its loot replaces any forgotten loot
const offer = function (items) {
    state = {items: combat.makeLoot(items)};
    return message({type: 'offer'});
}

// An item leaves the loot (same lookup as combat.takeLoot)
const take = function (index, slug, name) {
    let i = parseInt(index);
    let item = state.items[i];
    if (!item || (slug && item.slug !== slug) || (name && item.name !== name))
        return null;
    return state.items.splice(i, 1)[0];
}

// All the loot at once ("Tout récupérer")
const takeAll = function () {
    let items = state.items;
    state = {items: []};
    return items;
}

const handle = function (response) {
    if (response.action === 'card-loot-offer')
        return offer((response.data && response.data.items) || []);
    return message(null);
}

module.exports = {getState, offer, take, takeAll, message, handle};
