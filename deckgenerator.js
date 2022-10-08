const card = require('./card')

module.exports = function deckGenerator_50(neuCardList, negCardList, posCardList, plaCardList){
    let size = neuCardList.length + posCardList.length + negCardList.length + plaCardList.length;
    let deck = [];
    let used = [];
    let minValue = 1;
    let neuCount = 0;
    let posCount = 0;
    let negCount = 0;
    while (deck.length < 50){
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
    return deck;
}
