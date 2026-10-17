const db = require ('./../src/controllers/db');
const type = require("./../src/config/constants");
const fs = require('fs')
const {getCardsIds, deckGenerator, destroyDeck, hydrateCardDB} = require("../src/controllers/deck");
const {Player} = require("../src/models/player");
const {Ship} = require("../src/models/ship");
const {Config} = require("../src/models/config");
const assert = require("assert");

process.env.DB_URL = '';
type.register();

test();

async function test() {
    try {fs.unlinkSync('./storage/databases/test_db.sqlite'); console.log('db deleted')}
    catch (e){console.log('no previous test db')}

    await setup();
    await test_cards_setup();
    await test_deck_generation();
    await test_roll();
}

async function setup(){
    let DB = new db.DB;
    global.DB = await DB.init(true);
    global.CONFIG = await new Config().hydrateDB();

    // Same data as a real game: base cards from the config + generated planets
    await hydrateCardDB();
    await new Ship().create();
}

// getCardsIds only returns ids, so load full rows to check type and value
async function getCards(type, valMinMax = [-1, 0]) {
    let ids = (await getCardsIds(type, ALL, valMinMax)).map(c => c.id);
    return await DB.tables.cards.findAll({where: {id: ids}, raw: true});
}

async function test_cards_setup(){
    console.log('Testing card setup in DB');

    const checks = [
        ['Initial cards', await getCards(TYPE_INITIAL), c => c.type === TYPE_INITIAL && c.value === -1],
        ['Neutral cards', await getCards(TYPE_NEUTRAL), c => c.type === TYPE_NEUTRAL && c.value === -1],
        ['Negative cards', await getCards(TYPE_NEGATIVE), c => c.type === TYPE_NEGATIVE && c.value === -1],
        ['Positive cards', await getCards(TYPE_POSITIVE), c => c.type === TYPE_POSITIVE && c.value === -1],
        ['Place cards', await getCards(TYPE_PLACE), c => c.type === TYPE_PLACE && c.value === -1],
        ['Low planet cards', await getCards(TYPE_PLANET, [1, 500]), c => c.type === TYPE_PLANET && c.value > 0 && c.value < 501],
        ['Medium planet cards', await getCards(TYPE_PLANET, [501, 800]), c => c.type === TYPE_PLANET && c.value > 500 && c.value < 801],
        ['High planet cards', await getCards(TYPE_PLANET, [801, 1000]), c => c.type === TYPE_PLANET && c.value > 800 && c.value < 1001],
    ];

    for (let [label, cards, isValid] of checks) {
        console.log(label);
        assert(cards.length > 0, label + ': none in DB');
        for (let card of cards)
            assert(isValid(card), label + ': wrong card ' + card.id);
        console.log('OK');
    }

    console.log('Card setup DB OK')
}

async function test_deck_generation(){
    // Fair mode, the default in baseConf.json
    assert(Number(CONFIG.gameModeFair) === 1);
    const nbPla = Number(CONFIG.planetCount);
    const perSystem = {
        [TYPE_PLACE]: Number(CONFIG.placeByStep),
        [TYPE_POSITIVE]: Number(CONFIG.positiveByStep),
        [TYPE_NEGATIVE]: Number(CONFIG.negativeByStep),
        [TYPE_NEUTRAL]: Number(CONFIG.neutralByStep),
    };

    await destroyDeck();
    await deckGenerator();
    let deck = await DB.tables.deck.findAll({order: [['id', 'ASC']], raw: true});

    let card_deck = [];
    for (let elt of deck)
        card_deck.push(await DB.tables.cards.findOne({where: {id: elt.card_id}, raw: true}));

    console.log('Testing deck generation');

    console.log('Deck starts with the initial card');
    assert(card_deck.length > 0 && card_deck[0].type === TYPE_INITIAL);
    console.log('OK');

    let counts = {};
    let pla_count = 0;

    for (let card of card_deck.slice(1)){
        if (card.type !== TYPE_PLANET) {
            counts[card.type] = (counts[card.type] || 0) + 1;
            continue;
        }

        console.log('Testing card distribution for system ' + (pla_count + 1));
        for (let type in perSystem)
            assert((counts[type] || 0) === perSystem[type], 'type ' + type + ': ' + (counts[type] || 0) + ' instead of ' + perSystem[type]);
        console.log('OK');

        console.log('Testing planet value');
        if (pla_count < nbPla / 3)
            assert(card.value > 0 && card.value < 501);
        else if (pla_count < 2 * nbPla / 3)
            assert(card.value > 500 && card.value < 801);
        else
            assert(card.value > 800 && card.value < 1001);
        console.log('OK');

        pla_count++;
        counts = {};
    }

    console.log('Testing number of planets');
    assert(pla_count === nbPla);
    console.log('OK');

    console.log('Deck generation OK')
}

async function test_roll(){
    console.log('Testing roll');

    let player = await new Player().create({combat: 100, moral: 50});

    const rollSuccess = (result) => {
        return result >= 50;
    }

    console.log('Testing without modules');
    assert(!rollSuccess(await player.roll(0, 'combat')));
    assert(rollSuccess(await player.roll(100, 'combat')));
    console.log('OK');

    console.log('Testing with modules');
    assert(!rollSuccess(await player.roll(0, 'combat', true)));
    assert(rollSuccess(await player.roll(100, 'combat', true)));
    console.log('OK');

    console.log('Roll OK');
}

module.exports = {test};
