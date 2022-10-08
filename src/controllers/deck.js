const card = require('./card')
const fs = require("fs")

module.exports.deckGenerator = function (nbPla = 5, nbPos=1, nbNeg=2, nbNeu=3, gameMode = 'Fair'){
    let neuCardList = shuffle(JSON.parse(fs.readFileSync('jsonFiles/neuCardList.json').toString()));
    let negCardList = shuffle(JSON.parse(fs.readFileSync('jsonFiles/negCardList.json').toString()));
    let posCardList = shuffle(JSON.parse(fs.readFileSync('jsonFiles/posCardList.json').toString()));
    let plaCardList = JSON.parse(fs.readFileSync('jsonFiles/plaCardList.json').toString());


    let deck = [];

    for (let i = 0; i < nbPla; i++) {
        let tmp_system = [];

        for (let j = 0; j < nbPos; j++)
            tmp_system.push(posCardList.pop());

        for (let j = 0; j < nbNeg; j++)
            tmp_system.push(negCardList.pop());

        for (let j = 0; j < nbNeu; j++)
            tmp_system.push(neuCardList.pop());

        shuffle(tmp_system);

        for (let elt of tmp_system)
            deck.push(elt);

        let usablePla = plaCardList.filter(elt => (elt.value > i * (1000 / nbPla) && elt.value < (i + 1) * (1000 / nbPla)));
        let ind = Math.floor(Math.random() * usablePla.length);
        let card = usablePla[ind];
        deck.push(card);
        let toDel = plaCardList.findIndex(elt => elt === card);
        plaCardList.splice(toDel, 1);
    }

    deck = deck.reverse();
    fs.writeFileSync('jsonFiles/deck.json', JSON.stringify(deck))
    return JSON.stringify(deck);
}

module.exports.cardPop = function (){
    let deck = JSON.parse(fs.readFileSync('jsonFiles/deck.json').toString());
    let card = deck.pop();

    fs.writeFileSync('jsonFiles/deck.json', JSON.stringify(deck));
    
    let history = fs.readFileSync('jsonFiles/history.json').toString();
    if (history.length === 0){
        let list = [];
        list.push(card);
        fs.writeFileSync('jsonFiles/history.json', JSON.stringify(list));
        return;
    }
    history = JSON.parse(history);

    history.push(card);
    fs.writeFileSync('jsonFiles/history.json', JSON.stringify(history));
    //console.log(history)
}

function shuffle(array) {
    let currentIndex = array.length,  randomIndex;

    // While there remain elements to shuffle.
    while (currentIndex !== 0) {

        // Pick a remaining element.
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }

    return array;
}