const db = require ('./../src/controllers/db');
const type = require("./../src/config/constants");
const fs = require('fs')
const {getCards, deckGenerator} = require("../src/controllers/deck");
const assert = require("node:assert/strict");
const {Player} = require("../src/models/player");

process.env.DB_URL = '';
type.register();

test();

async function test() {
    try {await fs.unlinkSync('./test_db.sqlite'); console.log('db deleted')}
    catch (e){console.log(e)}

    await setup();
    await test_cards_setup();
    await test_deck_generation();
    await test_roll();
}

async function setup(){
    let DB = new db.DB;
    global.DB = await DB.init(true);

    await DB.test();
}

async function test_cards_setup(){
    let neuCardList = await getCards(TYPE_NEUTRAL);
    let negCardList = await getCards(TYPE_NEGATIVE);
    let posCardList = await getCards(TYPE_POSITIVE);

    let firstPlaSlice = await getCards(TYPE_PLANET, ALL, [1,500]);
    let secondPlaSlice = await getCards(TYPE_PLANET, ALL, [501,800]);
    let thirdPlaSlice = await getCards(TYPE_PLANET, ALL, [801,1000]);

    console.log('Testing for select in DB');

    console.log('Neutral cards');
    assert(neuCardList.length > 0);
    console.log('OK');

    console.log('Negative cards');
    assert(negCardList.length > 0);
    console.log('OK');

    console.log('Positive cards');
    assert(posCardList.length > 0);
    console.log('OK');

    console.log('Low planet cards');
    assert(firstPlaSlice.length > 0);
    console.log('OK');

    console.log('Medium planet cards');
    assert(secondPlaSlice.length > 0);
    console.log('OK');

    console.log('High planet cards');
    assert(thirdPlaSlice.length > 0);
    console.log('OK');

    console.log('Testing for select correctness');

    console.log('Neutral cards');
    for (let card of neuCardList)
        assert(card.type === TYPE_NEUTRAL && card.value === -1);
    console.log('OK');

    console.log('Negative cards');
    for (let card of negCardList)
        assert(card.type === TYPE_NEGATIVE && card.value === -1);
    console.log('OK');

    console.log('Positive cards');
    for (let card of posCardList)
        assert(card.type === TYPE_POSITIVE && card.value === -1);
    console.log('OK');

    console.log('Low planet cards');
    for (let card of firstPlaSlice)
        assert(card.type === TYPE_PLANET && card.value > 0 && card.value < 501);
    console.log('OK');

    console.log('Medium planet cards');
    for (let card of secondPlaSlice)
        assert(card.type === TYPE_PLANET && card.value > 500 && card.value < 801);
    console.log('OK');

    console.log('High planet cards');
    for (let card of thirdPlaSlice)
        assert(card.type === TYPE_PLANET && card.value > 800 && card.value < 1001);
    console.log('OK');

    console.log('Card setup DB OK')
}

async function test_deck_generation(gameMode = 'Fair', nbPla = 5, nbTot = 6, nbNeg=2, nbPos=1, nbNeu=3){
    await deckGenerator(gameMode, nbPla, nbTot, nbNeg, nbPos, nbNeu);
    let deck = await DB.tables.deck.findAll();
    deck = deck.map(r => r.dataValues);

    let card_deck = [];

    for (let elt of deck)
        card_deck.push(await DB.tables.cards.findOne({where: {id: elt.card_id}}))

    card_deck = card_deck.map(r => r.dataValues);

    let neu_count = 0;
    let neg_count = 0;
    let pos_count = 0;
    let pla_count = 0;

    console.log('Testing deck generation');

    for (let card of card_deck){
        if (card.type === TYPE_POSITIVE)
            pos_count++;
        else if (card.type === TYPE_NEUTRAL)
            neu_count++;
        else if (card.type === TYPE_NEGATIVE)
            neg_count++;
        else if (card.type === TYPE_PLANET){
            console.log('Testing card distribution per slice');
            assert(neu_count === nbNeu && neg_count === nbNeg && pos_count === nbPos);
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
            pos_count = 0;
            neu_count = 0;
            neg_count = 0;
        }
    }
    console.log('Testing number of planets');
    assert(pla_count === nbPla);
    console.log('OK');

    console.log('Deck generation OK')
}

async function test_roll(){
    console.log('Testing roll');

    let player = await new Player().create({combat: 100, moral: 50});

    console.log('Testing without modules');
    assert(!await player.roll(0, 'combat'));
    assert(await player.roll(100, 'combat'));
    console.log('OK');

    console.log('Testing with modules');
    assert(!await player.roll(0, 'combat', true));
    assert(await player.roll(100, 'combat', true));
    console.log('OK');

    console.log('Roll OK');
}

module.exports = {test};
