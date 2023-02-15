const {Card} = require('./../models/card')
const fs = require("fs")
const { Op, literal } = require("sequelize");
const ws = require("ws");

const deckGenerator = async function (){

    let gameMode = CONFIG.gameModeFair ? 'Fair' : 'Chaos';
    let nbPla = CONFIG.planetCount;
    let nbTot = CONFIG.cardByStepsChaos;
    let nbNeg = CONFIG.negativeByStep;
    let nbPos = CONFIG.positiveByStep;
    let nbNeu = CONFIG.neutralByStep;

    let deck = await getCardsIds(TYPE_INITIAL);

    let neuCardList = await getCardsIds(TYPE_NEUTRAL);
    let negCardList = await getCardsIds(TYPE_NEGATIVE);
    let posCardList = await getCardsIds(TYPE_POSITIVE);

    let cardList = [];

    if (gameMode === "Chaos")
        cardList = shuffle((neuCardList).concat((negCardList).concat(posCardList)));

    let firstPlaSlice = await getCardsIds(TYPE_PLANET, ALL, [1,500]);
    let secondPlaSlice = await getCardsIds(TYPE_PLANET, ALL, [501,800]);
    let thirdPlaSlice = await getCardsIds(TYPE_PLANET, ALL, [801,1000]);

    for (let i = 0; i < nbPla; i++) {
        let tmp_system = [];

        if (posCardList.length < nbPos || neuCardList.length < nbNeu || negCardList.length < nbNeg)
        {
            neuCardList = await getCardsIds(TYPE_NEUTRAL);
            negCardList = await getCardsIds(TYPE_NEGATIVE);
            posCardList = await getCardsIds(TYPE_POSITIVE);
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


    let bulkDeck = [];
    for (let card of deck){
        bulkDeck.push({
            deck_id: 0,
            card_id: card.id,
            played: 0
        })
    }

    await DB.tables.deck.bulkCreate(bulkDeck);

}

const getCardsIds = async function (type = TYPE_PLANET, quantity = ALL, valMinMax= [-1,0], order_rand = true) {

    let cards = [];
    let whereClause = {};

    if (type !== null) {
        whereClause['value'] = {
            [Op.between]: valMinMax
        }
        whereClause['type'] = {
            [Op.eq] : type
        }
    }

    return await DB.tables.cards.findAll({
        attributes: [
            'id',
        ],
        where: whereClause,
        limit: quantity,
        order: (order_rand ? literal('random()') : 'id'),
        raw: true
    })
    // rows = rows.map(r => r.dataValues);
    //
    // for (let row of rows) {
    //     let card = new Card(row.id);
    //     cards.push(await card.getData())
    // }

}

const cardPop = async function (setPlayed = true){

    let result = await DB.tables.deck.findOne({
        where: {
            deck_id: 0,
            played: 0
        },
        order: [['id', 'ASC']]
    });
    if (result) {
        if (setPlayed) {
            await DB.tables.deck.update({
                played: 1
            }, {
                where: {
                    id: result.id,
                }
            });
        }

        let card = await new Card(result.card_id).getData();

        let data = JSON.stringify({
            action: 'card-played',
            data: card
        });
        const wsClient = new ws(WS_URL);
        wsClient.on('open', () => {
            wsClient.send(data);
        });

        return card;
    }
    return false;
}

const destroyDeck = async function (deck_id = 0){
    DB.tables.deck.destroy({
        where: {deck_id: deck_id},
        truncate: true,
        restartIdentity: true
    })
}

const getDeck = async function () {
    return await DB.tables.deck.findAll({raw:true})
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

const hydrateCardDB = async function (cleanInstall = true) {

    if (cleanInstall) {
        DB.tables.cards.destroy({truncate: true});
        DB.tables.card_modules.destroy({truncate: true});
    }
    let cardManager = new Card();
    let baseCardsRaw = fs.readFileSync(__dirname + '/../config/baseCards.json');
    let baseCards = JSON.parse(baseCardsRaw);

    for (let i in baseCards) {
        let type;
        let cards = baseCards[i];
        switch (i) {
            case 'initial':
                type = TYPE_INITIAL;
                break;
            case 'positive':
                type = TYPE_POSITIVE;
                break;
            case 'negative':
                type = TYPE_NEGATIVE;
                break;
            case 'neutral':
                type = TYPE_NEUTRAL;
                break;
            case 'place':
                type = TYPE_PLACE;
                break;
            case 'planet':
                type = TYPE_PLANET;
                break;
        }
        for (let j in cards) {
            let data = {};
            let infos = cards[j];

            if (type === TYPE_PLACE && !infos.start)
                type = TYPE_FOLLOWUP;

            data['type'] = type;

            for (let k in infos) {
                data[k] = infos[k];
            }
            
            await cardManager.create(data);
        }
    }
}

module.exports = {deckGenerator, cardPop, getCardsIds, destroyDeck, getDeck, shuffle, hydrateCardDB}