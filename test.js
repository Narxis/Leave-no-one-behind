let card = require('./src/controllers/card');
let deck = require('./src/controllers/deck')
const fs = require("fs")



let cardList = [];
for (let i = 0; i < 50; i++){
    let newCard = new card.Card
    newCard.name = 'card' + i.toString();
    if (i < 25){
        newCard.type = 'neutral';
        newCard.value = -1;
    }
    else if (i < 40){
        newCard.type = 'negative';
        newCard.value = -1;
    }
    else if (i < 45){
        newCard.type = 'positive';
        newCard.value = -1;
    }
    else{
        newCard.type = 'planet';
        newCard.value = 1 + (i % 5)*2;
    }
    cardList.push(newCard);
}

let neuCardList = cardList.filter(elt => elt.type === 'neutral');
let negCardList = cardList.filter(elt => elt.type === 'negative');
let posCardList = cardList.filter(elt => elt.type === 'positive');
let plaCardList = cardList.filter(elt => elt.type === 'planet');


fs.writeFileSync('neuCardList.json', JSON.stringify(neuCardList));
fs.writeFileSync('negCardList.json', JSON.stringify(negCardList));
fs.writeFileSync('posCardList.json', JSON.stringify(posCardList));
fs.writeFileSync('plaCardList.json', JSON.stringify(plaCardList));

finalDeck = deck.deckGenerator_50();

//console.log(neuCardList);
//console.log(posCardList);
//console.log(negCardList);
//console.log(plaCardList);
console.log(finalDeck);

//console.log(finalDeck.length)

fs.writeFileSync('history.json', '');

deck.cardPop();
deck.cardPop();

console.log(finalDeck.length)