// Online players' votes on the choices of the displayed card.
//
// The game page (card.js) announces what it shows on each new
// display of choices: card text and button labels
// ("card-screen" action). Players vote for a choice; the GM sees
// the votes on the game page and in their menu, and has the final say:
// they are always the one who clicks.
//
// A new display (other text or other choices) resets the votes.
const MAX_TEXT = 4000;
const MAX_CHOICE = 300;

let screen = null;        // {id, cardId, text, choices, chosen}
let screenCount = 0;
const votes = new Map();  // player id → {name, index}

const clip = (value, max) => String(value || '').slice(0, max);

// What the game page shows. Returns the message for the GM pages.
const setScreen = function (data) {
    data = data && typeof data === 'object' ? data : {};
    let text = clip(data.text, MAX_TEXT);
    let choices = (Array.isArray(data.choices) ? data.choices : []).slice(0, 6).map(c => clip(c, MAX_CHOICE));
    let cardId = data.cardId === undefined || data.cardId === null ? null : String(data.cardId);
    let chosen = Number.isInteger(data.chosen) ? data.chosen : null;

    let same = screen && screen.cardId === cardId && screen.text === text
        && JSON.stringify(screen.choices) === JSON.stringify(choices);
    if (chosen !== null && screen) {
        // The GM clicked: votes close, the chosen choice stays shown
        screen.chosen = chosen;
    } else if (!same) {
        screen = {id: ++screenCount, cardId, text, choices, chosen: null};
        votes.clear();
    }
    return payload();
};

const counts = function () {
    let list = screen ? screen.choices.map(() => 0) : [];
    for (let v of votes.values())
        if (v.index < list.length)
            list[v.index]++;
    return list;
};

// Who voted what (player id, character name, choice index)
const voters = () => Array.from(votes, ([id, v]) => ({id, name: v.name, index: v.index}));

// Message for the GM pages: votes per choice and who voted what
const payload = function () {
    return {
        action: 'votes',
        error: false,
        data: {
            screen: screen ? screen.id : null,
            choices: screen ? screen.choices : [],
            chosen: screen ? screen.chosen : null,
            counts: counts(),
            voters: voters()
        }
    };
};

// A player's vote (choice index, or null to withdraw the vote)
const vote = function (playerId, name, index) {
    if (!screen || !screen.choices.length)
        return {error: 'Pas de choix à voter pour l\'instant.'};
    if (screen.chosen !== null)
        return {error: 'Le MJ a déjà choisi.'};
    if (index === null) {
        votes.delete(playerId);
        return {payload: payload()};
    }
    if (!Number.isInteger(index) || index < 0 || index >= screen.choices.length)
        return {error: 'Choix inconnu.'};
    votes.set(playerId, {name: String(name || ''), index});
    return {payload: payload()};
};

// Card seen by the players: the game page display if it is indeed about
// the current card, otherwise nothing (the deck card is used then). Who
// voted what is shown to all, with their role logo
const screenFor = function (cardId) {
    if (!screen || screen.cardId !== (cardId === undefined || cardId === null ? null : String(cardId)))
        return null;
    return {id: screen.id, text: screen.text, choices: screen.choices, chosen: screen.chosen, counts: counts(), voters: voters()};
};

const voteOf = (playerId) => votes.has(playerId) ? votes.get(playerId).index : null;

const clear = function () {
    screen = null;
    votes.clear();
};

module.exports = {setScreen, vote, payload, screenFor, voteOf, clear};
