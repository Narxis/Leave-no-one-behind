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
    let nbPlace = CONFIG.placeByStep;

    let deck = await getCardsIds(TYPE_INITIAL);

    let plaCardList = await getCardsIds(TYPE_PLACE);
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

        if (posCardList.length < nbPos || neuCardList.length < nbNeu || negCardList.length < nbNeg || plaCardList.length < nbPlace)
        {
            if (gameMode === "Chaos")
                cardList = shuffle(plaCardList.concat((neuCardList).concat((negCardList).concat(posCardList))));
        }

        if (gameMode === "Fair")
        {
            for (let j = 0; j < nbPlace; j++)
                tmp_system.push(plaCardList.pop());

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
        if (setPlayed) {
            const wsClient = new ws(WS_URL);
            wsClient.on('open', () => {
                wsClient.send(data);
            });
        }

        return card;
    }
    return false;
}

const destroyDeck = async function (deck_id = 0){
    await DB.tables.deck.destroy({
        where: {deck_id: deck_id},
        truncate: true,
        restartIdentity: true
    })
}

const generatePlanets = async function() {

    let nbPla = CONFIG.planetCount;
    let slice = Math.ceil(nbPla/3);
    let slicesVal = [{
        'min': 1,
        'max': 500
    },{
        'min': 501,
        'max': 800
    },{
        'min': 801,
        'max': 1000
    }];

    for (let i=0; i<3; i++) {
        for (let j=0; j<slice;j++) {
            await generatePlanet(slicesVal[i].min, slicesVal[i].max)
        }
    }
}

const generatePlanet = async function (min,max) {

    const totalCostMin = 10;
    const totalCostMax = 15;
    const planetStatsModifiers = [
        {
            stat: 'oxy',
            mod: 85,
            cost: true,
        },
        {
            stat: 'grv',
            mod: 60,
            cost: true,
        },
        {
            stat: 'wtr',
            mod: 95,
            cost: true,
        },
        {
            stat: 'res',
            mod: 80,
            cost: true,
        },
        {
            stat: 'fau',
            mod: 30,
            cost: true,
        },
        {
            stat: 'flo',
            mod: 30,
            cost: false,
        },
        {
            stat: 'civ',
            mod: 65,
            cost: false,
        },
        {
            stat: 'cli',
            mod: 55,
            cost: true,
        }
    ];

    let totalCost = 0;
    let score = 0;
    let modules = {};
    do {
        score = 0;
        modules = {};
        for (let el of planetStatsModifiers) {
            let roll = Math.floor(Math.random() * (100 - 1 + 1) + 1);
            score = score + (roll * el.mod);
            modules[el.stat] = {value: roll}
        }
        score = Math.round(score / 50);
    } while (score > max || score < min);

    do {
        totalCost = 0;
        for (let el of planetStatsModifiers) {
            if (el.cost) {
                let roll = Math.floor(Math.random() * (4 - 1 + 1) + 1);
                totalCost = totalCost + roll;
                modules[el.stat].cost = roll
            }
            else {
                modules[el.stat].cost = 0;
            }
        }
    } while (totalCost > totalCostMax || totalCost < totalCostMin);

    let data = {
        type: TYPE_PLANET,
        value: score,
        modules: modules
    }

    await new Card().create(data);
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
        await DB.tables.cards.destroy({truncate: true});
        await DB.tables.card_modules.destroy({truncate: true});
        await DB.tables.cards_alt.destroy({truncate: true});
    }
    let baseCardsRaw = fs.readFileSync(__dirname + '/../config/baseCards.json');
    let baseCards = JSON.parse(baseCardsRaw);
    let cardManager = new Card();

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

            let isFollowUp = (type === TYPE_PLACE && !infos.start);

            data['type'] = isFollowUp ? TYPE_FOLLOWUP : type;

            for (let k in infos) {
                data[k] = infos[k];
            }

            if (!isFollowUp) {
                cardManager = new Card();
            }
            await cardManager.create(data);
        }
    }

    await generatePlanets();
}

module.exports = {deckGenerator, cardPop, getCardsIds, destroyDeck, getDeck, shuffle, hydrateCardDB, generatePlanet, generatePlanets}