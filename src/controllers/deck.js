const {Card} = require('./../models/card')
const fs = require("fs")
const { Op, literal } = require("sequelize");

const deckGenerator = async function (gameMode = 'Fair', nbPla = 5, nbTot = 6, nbNeg=2, nbPos=1, nbNeu=3){

    let deck = [];

    let neuCardList = await getCards(TYPE_NEUTRAL);
    let negCardList = await getCards(TYPE_NEGATIVE);
    let posCardList = await getCards(TYPE_POSITIVE);

    let cardList = [];
    if (gameMode === "Chaos")
        cardList = shuffle((neuCardList).concat((negCardList).concat(posCardList)));

    let firstPlaSlice = await getCards(TYPE_PLANET, ALL, [1,500]);
    let secondPlaSlice = await getCards(TYPE_PLANET, ALL, [501,800]);
    let thirdPlaSlice = await getCards(TYPE_PLANET, ALL, [801,1000]);

    for (let i = 0; i < nbPla; i++) {
        let tmp_system = [];

        if (posCardList.length < nbPos || neuCardList.length < nbNeu || negCardList.length < nbNeg)
        {
            neuCardList = await getCards(TYPE_NEUTRAL);
            negCardList = await getCards(TYPE_NEGATIVE);
            posCardList = await getCards(TYPE_POSITIVE);
            if (gameMode === "Chaos")
                cardList = shuffle((neuCardList).concat((negCardList).concat(posCardList)));
        }

        if (gameMode === "Fair")
        {
            for (let j = 0; j < nbPos; j++)
                tmp_system.push(posCardList.pop());

            for (let j = 0; j < nbNeg; j++)
                tmp_system.push(negCardList.pop());

            for (let j = 0; j < nbNeu; j++)
                tmp_system.push(neuCardList.pop());

            shuffle(tmp_system);
        }

        else if (gameMode === "Chaos")
            for (let j = 0; j < nbTot; j++)
            {
                if (j > 2 && tmp_system.slice(-3).filter(elt => elt.type === TYPE_NEGATIVE).length >= 3)
                {
                    let ind = cardList.findIndex(elt => elt.type === TYPE_NEUTRAL || elt.type === TYPE_POSITIVE);
                    tmp_system.push(cardList[ind]);
                    cardList.splice(ind, 1);
                }
                else
                    tmp_system.push(cardList.pop());
            }

        for (let elt of tmp_system)
            deck.push(elt);

        if (i < nbPla / 3)
            deck.push(firstPlaSlice.pop());
        else if (i < 2 * nbPla / 3)
            deck.push(secondPlaSlice.pop());
        else
            deck.push(thirdPlaSlice.pop());
    }

    deck = deck.reverse();
    fs.writeFileSync('jsonFiles/deck.json', JSON.stringify(deck))
    return JSON.stringify(deck);
}

const getCards = async function (type = 0, quantity = ALL, valMinMax= [-1,0], order_rand = true) {
    let cards = [];
    let rows = await DB.tables.cards.findAll({
        attributes: [
            'id',
        ],
        where: {
            type: {
                [Op.eq] : type
            },
            value: {
                [Op.between]: valMinMax
            }
        },
        limit: quantity,
        order: (order_rand ? literal('random()') : 'id'), logging: console.log
    })
    rows = rows.map(r => r.dataValues);

    for (let row of rows) {
        let card = new Card(row.id);
        cards.push(await card.getData())
    }

    return cards;
}

const cardPop = function (){
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

const shuffle = function (array) {
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

module.exports = {deckGenerator, cardPop, getCards, shuffle}