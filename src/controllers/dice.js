// Dés neutres de la fenêtre de dés (joueurs et menu MJ) : D2 à D100, lancés
// par le serveur pour que personne ne triche. Le résultat part dans le chat
// avec le détail du jet (champ « dice » du message, que seul le serveur
// remplit : un message tapé à la main ne passe pas pour un jet).
//
// Joueur → MJ : action « dice » {sides, count, secret}  secret : seul le MJ voit
// Pages du MJ : action « dice » {sides, count, secret}  secret : pas de chat
//               réponse {action: 'dice', data: {sides, count, dice, total, secret}}
const crypto = require('crypto');

const SIDES = [2, 4, 6, 8, 10, 20, 100];
const MAX_COUNT = 10;

// Nombre de dés demandé, entre 1 et MAX_COUNT
const countOf = (value) => Math.min(MAX_COUNT, Math.max(1, parseInt(value) || 1));

// Lance count dés à sides faces. random(sides) → 1..sides (tests)
const roll = function (sides, count, random) {
    sides = parseInt(sides);
    if (!SIDES.includes(sides))
        return {error: 'Dé inconnu.'};
    count = countOf(count);
    let face = random || ((n) => crypto.randomInt(1, n + 1));
    let dice = Array.from({length: count}, () => face(sides));
    return {sides: sides, count: count, dice: dice, total: dice.reduce((a, b) => a + b, 0)};
};

// « 🎲 2D6 : 3 + 5 = 8 », « 🎲 1D20 : 14 »
const text = (r) => '🎲 ' + r.count + 'D' + r.sides + ' : ' + (r.count > 1 ? r.dice.join(' + ') + ' = ' : '') + r.total;

// Ce que garde le message du chat
const detail = (r) => ({sides: r.sides, count: r.count, dice: r.dice.slice(), total: r.total});

module.exports = {SIDES, MAX_COUNT, countOf, roll, text, detail};
