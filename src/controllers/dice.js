// Neutral dice of the dice window (players and GM menu): D2 to D100, rolled
// by the server so nobody cheats. The result goes to the chat
// with the roll details ("dice" field of the message, which only the server
// fills: a hand-typed message doesn't pass for a roll).
//
// Player → GM: "dice" action {sides, count, secret}  secret: only the GM sees it
// GM pages: "dice" action {sides, count, secret}  secret: no chat
//               answer {action: 'dice', data: {sides, count, dice, total, secret}}
const crypto = require('crypto');

const SIDES = [2, 4, 6, 8, 10, 20, 100];
const MAX_COUNT = 10;

// Number of dice requested, between 1 and MAX_COUNT
const countOf = (value) => Math.min(MAX_COUNT, Math.max(1, parseInt(value) || 1));

// Rolls count dice with sides faces. random(sides) → 1..sides (tests)
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

// What the chat message keeps
const detail = (r) => ({sides: r.sides, count: r.count, dice: r.dice.slice(), total: r.total});

module.exports = {SIDES, MAX_COUNT, countOf, roll, text, detail};
