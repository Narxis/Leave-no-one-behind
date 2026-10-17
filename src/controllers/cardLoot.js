const combat = require('./combat');

// Butin d'une carte : quand un choix rapporte des objets, ils attendent ici
// que le MJ les distribue (glisser sur un joueur, comme le butin d'un combat)
// ou les range tous dans le vaisseau. La carte suivante n'arrive qu'une fois
// le butin vide. Gardé en mémoire, comme l'état du combat
let state = {items: []};

const getState = function () {
    return JSON.parse(JSON.stringify(state));
}

const message = function (event) {
    return {action: 'card-loot', error: false, data: {state: getState(), event: event || null}};
}

// Le choix vient d'être cliqué : son butin remplace l'éventuel butin oublié
const offer = function (items) {
    state = {items: combat.makeLoot(items)};
    return message({type: 'offer'});
}

// Un objet quitte le butin (même repérage que combat.takeLoot)
const take = function (index, slug, name) {
    let i = parseInt(index);
    let item = state.items[i];
    if (!item || (slug && item.slug !== slug) || (name && item.name !== name))
        return null;
    return state.items.splice(i, 1)[0];
}

// Tout le butin d'un coup (« Tout récupérer »)
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
