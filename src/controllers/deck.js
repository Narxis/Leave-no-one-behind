const card = require('./card')
const fs = require("fs")

module.exports.deckGenerator = function (mult = 1){
    let neuCardList = JSON.parse(fs.readFileSync('neuCardList.json').toString());
    let negCardList = JSON.parse(fs.readFileSync('negCardList.json').toString());
    let posCardList = JSON.parse(fs.readFileSync('posCardList.json').toString());
    let plaCardList = JSON.parse(fs.readFileSync('plaCardList.json').toString());

    let size = neuCardList.length + posCardList.length + negCardList.length + plaCardList.length;
    let deck = [];
    let used = [];
    let minValue = 1;
    let neuCount = 0;
    let posCount = 0;
    let negCount = 0;
    while (deck.length < 50 * mult){
        if (used.length === size) {
            console.error('not enough card in cardList')
            return null;
        }
        let added = false;
        if (deck.length % 10 === 9) {
            while (!added) {
                let ind = Math.floor(Math.random() * plaCardList.length);
                let currentCard = plaCardList[ind];
                if (used.filter(elt => elt === currentCard).length === 0 && currentCard.value >= minValue && currentCard.value < (minValue + 2)){
                    deck.push(currentCard);
                    used.push(currentCard);
                    added = true;
                    negCount = 0;
                    posCount = 0;
                    neuCount = 0;
                    minValue += 2;
                }
            }
        }

        else {
            let ind = Math.floor(Math.random()*3);
            if (ind === 0 && neuCount < 5) {
                while (!added) {
                    ind = Math.floor(Math.random() * neuCardList.length);
                    let currentCard = neuCardList[ind];
                    if (used.filter(elt => elt === currentCard).length === 0){
                        deck.push(currentCard);
                        used.push(currentCard);
                        added = true;
                        neuCount++;
                    }
                }
            }
            else if (ind === 1 && negCount < 3) {
                while (!added) {
                    ind = Math.floor(Math.random() * negCardList.length);
                    let currentCard = negCardList[ind];
                    if (used.filter(elt => elt === currentCard).length === 0){
                        deck.push(currentCard);
                        used.push(currentCard);
                        added = true;
                        negCount++;
                    }
                }
            }
            else if (ind === 2 && posCount < 1) {
                while (!added) {
                    ind = Math.floor(Math.random() * posCardList.length);
                    let currentCard = posCardList[ind];
                    if (used.filter(elt => elt === currentCard).length === 0){
                        deck.push(currentCard);
                        used.push(currentCard);
                        added = true;
                        posCount++;
                    }
                }
            }
        }
        //console.log(deck.length)
        //console.log(deck)
    }
    deck = deck.reverse();
    fs.writeFileSync('mydeck.json', JSON.stringify(deck))
    return JSON.stringify(deck);
}

module.exports.cardPop = function (){
    let deck = JSON.parse(fs.readFileSync('mydeck.json').toString());
    let card = deck.pop();

    fs.writeFileSync('mydeck.json', JSON.stringify(deck));
    
    let history = fs.readFileSync('history.json').toString();
    if (history.length === 0){
        let list = [];
        list.push(card);
        fs.writeFileSync('history.json', JSON.stringify(list));
        return;
    }
    history = JSON.parse(history);

    history.push(card);
    fs.writeFileSync('history.json', JSON.stringify(history));
    //console.log(history)
}
