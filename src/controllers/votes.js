// Votes des joueurs en ligne sur les choix de la carte affichée.
//
// La page de jeu (card.js) annonce ce qu'elle affiche à chaque nouvel
// affichage de choix : texte de la carte et intitulés des boutons
// (action « card-screen »). Les joueurs votent pour un choix ; le MJ voit
// les votes sur la page de jeu et dans son menu, et garde le dernier mot :
// c'est toujours lui qui clique.
//
// Un nouvel affichage (autre texte ou autres choix) remet les votes à zéro.
const MAX_TEXT = 4000;
const MAX_CHOICE = 300;

let screen = null;        // {id, cardId, text, choices, chosen}
let screenCount = 0;
const votes = new Map();  // id du joueur → {name, index}

const clip = (value, max) => String(value || '').slice(0, max);

// Ce que la page de jeu affiche. Renvoie le message pour les pages du MJ.
const setScreen = function (data) {
    data = data && typeof data === 'object' ? data : {};
    let text = clip(data.text, MAX_TEXT);
    let choices = (Array.isArray(data.choices) ? data.choices : []).slice(0, 6).map(c => clip(c, MAX_CHOICE));
    let cardId = data.cardId === undefined || data.cardId === null ? null : String(data.cardId);
    let chosen = Number.isInteger(data.chosen) ? data.chosen : null;

    let same = screen && screen.cardId === cardId && screen.text === text
        && JSON.stringify(screen.choices) === JSON.stringify(choices);
    if (chosen !== null && screen) {
        // Le MJ a cliqué : les votes se ferment, le choix retenu reste affiché
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

// Message pour les pages du MJ : votes par choix et qui a voté quoi
const payload = function () {
    return {
        action: 'votes',
        error: false,
        data: {
            screen: screen ? screen.id : null,
            choices: screen ? screen.choices : [],
            chosen: screen ? screen.chosen : null,
            counts: counts(),
            voters: Array.from(votes, ([id, v]) => ({id, name: v.name, index: v.index}))
        }
    };
};

// Vote d'un joueur (index du choix, ou null pour retirer son vote)
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

// Carte vue par les joueurs : l'affichage de la page de jeu s'il concerne
// bien la carte en cours, sinon rien (la carte du paquet sert alors)
const screenFor = function (cardId) {
    if (!screen || screen.cardId !== (cardId === undefined || cardId === null ? null : String(cardId)))
        return null;
    return {id: screen.id, text: screen.text, choices: screen.choices, chosen: screen.chosen, counts: counts()};
};

const voteOf = (playerId) => votes.has(playerId) ? votes.get(playerId).index : null;

const clear = function () {
    screen = null;
    votes.clear();
};

module.exports = {setScreen, vote, payload, screenFor, voteOf, clear};
