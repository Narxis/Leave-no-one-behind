let {Card} = require('./../src/models/card');
let deck = require('./../src/controllers/deck')
const fs = require("fs")
const db = require ('./../src/controllers/db');
const type = require("./../src/config/constants");
const {getCards, deckGenerator} = require("../src/controllers/deck");

process.env.DB_URL = '';
type.register();

test();

async function test() {
    await setup();
    await test_cards_setup();
    await test_deck_generation();
    await DB.tables.card_modules.drop();
    await DB.tables.deck.drop();
    await DB.tables.cards.drop();
}

async function setup(){
    let DB = new db.DB;
    global.DB = await DB.init();

    //await DB.tables.cards.drop();
    //await DB.tables.players.drop();
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
    console.assert(neuCardList.length > 0);
    console.log('OK');

    console.log('Negative cards');
    console.assert(negCardList.length > 0);
    console.log('OK');

    console.log('Positive cards');
    console.assert(posCardList.length > 0);
    console.log('OK');

    console.log('Low planet cards');
    console.assert(firstPlaSlice.length > 0);
    console.log('OK');

    console.log('Medium planet cards');
    console.assert(secondPlaSlice.length > 0);
    console.log('OK');

    console.log('High planet cards');
    console.assert(thirdPlaSlice.length > 0);
    console.log('OK');

    console.log('Testing for select correctness');

    console.log('Neutral cards');
    for (let card of neuCardList)
        console.assert(card.type === TYPE_NEUTRAL && card.value === -1);
    console.log('OK');

    console.log('Negative cards');
    for (let card of negCardList)
        console.assert(card.type === TYPE_NEGATIVE && card.value === -1);
    console.log('OK');

    console.log('Positive cards');
    for (let card of posCardList)
        console.assert(card.type === TYPE_POSITIVE && card.value === -1);
    console.log('OK');

    console.log('Low planet cards');
    for (let card of firstPlaSlice)
        console.assert(card.type === TYPE_PLANET && card.value > 0 && card.value < 501);
    console.log('OK');

    console.log('Medium planet cards');
    for (let card of secondPlaSlice)
        console.assert(card.type === TYPE_PLANET && card.value > 500 && card.value < 801);
    console.log('OK');

    console.log('High planet cards');
    for (let card of thirdPlaSlice)
        console.assert(card.type === TYPE_PLANET && card.value > 800 && card.value < 1001);
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

    console.log(card_deck);
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
            console.assert(neu_count === nbNeu && neg_count === nbNeg && pos_count === nbPos);
            console.log('OK');

            console.log('Testing planet value');
            if (pla_count < nbPla / 3)
                console.assert(card.value > 0 && card.value < 501);
            else if (pla_count < 2 * nbPla / 3)
                console.assert(card.value > 500 && card.value < 801);
            else
                console.assert(card.value > 800 && card.value < 1001);
            console.log('OK');
            pla_count++;
            pos_count = 0;
            neu_count = 0;
            neg_count = 0;
        }
    }
    console.log('Testing number of planets');
    console.assert(pla_count === nbPla);
    console.log('OK');

    console.log('Deck generation OK')
}

module.exports = {test};