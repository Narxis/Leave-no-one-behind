var fs = require('fs');
let {cardPop, deckGenerator,getCards, hydrateCardDB, destroyDeck} = require('./deck')
const {Card} = require("./../models/card");
const {Player} = require("../models/player");
const {Ship} = require("../models/ship");
const {Statuses} = require("../models/statuses");
const {Items} = require("../models/items");
const ws = require("ws");

module.exports.index = function(req, res) {
    res.render('index');
};

module.exports.returnOk = function (req, res) {
    res.status(200);
    res.json({status: 200})
}

module.exports.randCard = function (req, res) {
    getCards(1, 1).then(card => {
        res.json(card[0]);
    });
}

module.exports.deckGenerator = function (req, res) {
    deckGenerator().then(
        res.render('index-legacy')
    );

}

module.exports.renderSingleSheet = async function (req, res) {

    let player = await new Player().getData(req.body.discord_id);
    res.render('partials/fiche-perso', {player: player});
}

module.exports.mjMenu = function (req, res) {
    res.render('mj-menu');
}

module.exports.persos = async function (req, res) {
    await CONFIG.upsert('gameState', 'creation');
    res.render('perso');
}

module.exports.ficheVaisseau = function (req, res) {
    res.render('fiche-vaisseau');
}

module.exports.mainMenu = function (req, res) {
    res.render('index');
}

module.exports.renderCardEvent = async function (req, res) {

    let players = await DB.tables.players.findAll();
    let ship = await new Ship().getData();

    let statuses = new Statuses();
    let activeStatuses = await statuses.getAllStatuses();

    if (CONFIG.gameState !== 'gameLive')
        await CONFIG.upsert('gameState', 'gameLive');

    for (let i of activeStatuses) {
        await statuses.remove(i.slug);
    }

    let statusesAll = await statuses.getAllStatuses(false);

    let current_card = await cardPop();
    // TESTING :

    if (!current_card) {
        await CONFIG.upsert('gameState', 'postGame');
        res.render('end-screen');
    }

    let vars = {
        players: players,
        card: current_card,
        ship: ship,
        statuses: statusesAll
    }

    switch (current_card.type) {
        case TYPE_PLANET:
            res.render('template-planet', vars);
            break;
        case TYPE_NEGATIVE:
        case TYPE_NEUTRAL:
        case TYPE_POSITIVE:
            res.render('template-card', vars);
            break;
        case TYPE_PLACE:
            res.render('template-card', vars);
            break;
    }
}

// TEST TPL template-card
module.exports.renderTestCardEvent = async function (req, res) {

    let players = [
        {
            id: 1,
            discord_id: '14487794',
            name: 'test#6554',
            race: 'fnek',
            combat: 68,
            pilotage: 12,
            engineering: 84,
            survival: 54,
            recon: 12,
            moral: 12,
        },
        {
            id: 1,
            discord_id: '14475523584',
            name: 'test#8444',
            race: 'fnek',
            combat: 68,
            pilotage: 12,
            engineering: 84,
            survival: 54,
            recon: 12,
            moral: 12,
        },
        {
            id: 1,
            discord_id: '144877584',
            name: 'test#8354',
            race: 'fnek',
            combat: 68,
            pilotage: 12,
            engineering: 84,
            survival: 54,
            recon: 12,
            moral: 12,
        }
    ];
    let card = {
        desc: 'Vos radars détectent des débris à très haute vitesse en direction de votre vaisseau. Ces débris vont percuter votre vaisseau au niveau au niveau du module de détection.',
        timer: 1,
        choices: [
            {
                value: "Minimiser la casse\n(Ingénieur)",
                reveal: "Vous tentez de minimiser la casse, le débris percute votre vaisseau à toute vitesse, malgrès vos effort il est impossible de sauver l'intégralité du module"
            },
            {
                value: "Tenter une manoeuvre d'évitement\n(Pilote)",
                reveal: "Vous essayer d'esquiver le débris mais celui-ci percute une autre partie du vaisseau à la place."
            },
            {
                value: "Ne rien faire",
                reveal: ""
            }
        ]
    }
    let statuses = [{
        id: 16,
        name: 'Blackout',
        desc: 'le vaisseau ne peut plus rien détecter, il est impossible pour les joueurs d’agir.',
        slug: 'blackout',
        duration: 5,
    },
    {
        id: 18,
        name: 'Entrainé',
        desc: 'Une ou plusieurs statistiques des joueurs sont augmentées.',
        slug: 'trained',
        duration: 5
    }];

    let ship = {
        id: 0,
        name: '',
        cryopods: 1000,
        scanner: 100,
        proximity: 100,
        motors: 100,
        shield: 100,
        oxygen: 100,
        energy: 100,
        gravity: 100,
        landing: 100,
        construction: 100,
        scanner_up: 0,
        oxygen_up: 0,
        energy_up: 0,
        gravity_up: 0
    }
    let vars = {
        players: players,
        card: card,
        ship: ship,
        statuses: statuses
    }

    res.render('template-card', vars);
}

// TEST TPL PLANET
module.exports.templatePlanet = async function (req, res) {

    let players = [
        {
            id: 1,
            discord_id: '14487794',
            name: 'test#6554',
            race: 'fnek',
            combat: 68,
            pilotage: 12,
            engineering: 84,
            survival: 54,
            recon: 12,
            moral: 12,
        },
        {
            id: 1,
            discord_id: '14475523584',
            name: 'test#8444',
            race: 'fnek',
            combat: 68,
            pilotage: 12,
            engineering: 84,
            survival: 54,
            recon: 12,
            moral: 12,
        },
        {
            id: 1,
            discord_id: '144877584',
            name: 'test#8354',
            race: 'fnek',
            combat: 68,
            pilotage: 12,
            engineering: 84,
            survival: 54,
            recon: 12,
            moral: 12,
        }
    ];

    let card =  {
        value: 890,
        modules: {
            oxy: {cost: '2', val: '50'},
            grv: {cost: '3', val: '30'},
            wtr: {cost: '2', val: '30'},
            fau: {cost: '4', val: '60'},
            cli: {cost: '2', val: '30'},
            res: {cost: '1', val: '40'}
        },
    }
    let ship = {
        id: 0,
        name: '',
        cryopods: 1000,
        scanner: 100,
        proximity: 100,
        motors: 100,
        shield: 100,
        oxygen: 100,
        energy: 100,
        gravity: 100,
        landing: 100,
        construction: 100,
        scanner_up: 0,
        oxygen_up: 0,
        energy_up: 0,
        gravity_up: 0
    }
    let vars = {
        players: players,
        card: card,
        ship: ship
    }

    res.render('template-planet', vars);
}

module.exports.endScreen = function (req, res) {
    res.render('end-screen');
}

module.exports.leaderboard = function (req, res) {
    res.render('leaderboard');
}

module.exports.indexLegacy = function (req, res) {
    res.render('index-legacy');
}

module.exports.start = async function (req, res) {

    res.render('fiche-vaisseau');
    await DB.tables.ship.destroy({truncate: true, restartIdentity: true});
    await destroyDeck();

    await hydrateCardDB();
    await deckGenerator();

    let ship = new Ship();
    await ship.create();

    let statuses = new Statuses();
    await statuses.hydrateDB();

    let items = new Items();
    await items.hydrateDB();

    await CONFIG.upsert('gameState', 'gameLive')

    let data = JSON.stringify({
        action: 'game-ready'
    });

    const wsClient = new ws(WS_URL);
    wsClient.on('open', () => {
        wsClient.send(data);
    });}

module.exports.reset = async function (req, res) {

    await DB.tables.config.destroy({truncate: true, restartIdentity: true});
    await DB.tables.ship.destroy({truncate: true, restartIdentity: true});
    await destroyDeck();

    await CONFIG.hydrateDB();
    await hydrateCardDB();
    await deckGenerator();

    let ship = new Ship();
    await ship.create();

    let statuses = new Statuses();
    await statuses.hydrateDB();

    let items = new Items();
    await items.hydrateDB();

    res.redirect('/');
}