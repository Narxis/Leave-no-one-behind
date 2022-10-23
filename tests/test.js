let {Card} = require('../src/models/card');
let deck = require('../src/controllers/deck')
const fs = require("fs")
const db = require ('../src/controllers/db');
const type = require("../src/config/constants");

test();

async function test() {
    let DB = new db.DB;
    global.DB = await DB.init();

    // await DB.test();

    console.log(DB.tables.cards);

    let card = new Card(1);
    await card.update({
        'name': 'NOOOOM TEST'
    })

    type.register();

    /*let cardList = [];
    for (let i = 0; i < 50; i++) {
        let newCard = new card.Card
        newCard.name = 'card' + i.toString();
        if (i < 25) {
            newCard.type = 'neutral';
            newCard.value = -1;
        } else if (i < 40) {
            newCard.type = 'negative';
            newCard.value = -1;
        } else if (i < 45) {
            newCard.type = 'positive';
            newCard.value = -1;
        } else {
            newCard.type = 'planet';
            newCard.value = 1 + (i % 5) * 2;
        }
        cardList.push(newCard);
    }

    let neuCardList = cardList.filter(elt => elt.type === 'neutral');
    let negCardList = cardList.filter(elt => elt.type === 'negative');
    let posCardList = cardList.filter(elt => elt.type === 'positive');
    let plaCardList = cardList.filter(elt => elt.type === 'planet');


    fs.writeFileSync('jsonFiles/neuCardList.json', JSON.stringify(neuCardList));
    fs.writeFileSync('jsonFiles/negCardList.json', JSON.stringify(negCardList));
    fs.writeFileSync('jsonFiles/posCardList.json', JSON.stringify(posCardList));
    fs.writeFileSync('jsonFiles/plaCardList.json', JSON.stringify(plaCardList));*/

    let finalDeck = await deck.deckGenerator("Chaos");

//console.log(neuCardList);
//console.log(posCardList);
//console.log(negCardList);
//console.log(plaCardList);
    console.log(JSON.parse(finalDeck).map(n => n.type));

//console.log(finalDeck.length)

    fs.writeFileSync('jsonFiles/history.json', '');

    deck.cardPop();
    deck.cardPop();

}