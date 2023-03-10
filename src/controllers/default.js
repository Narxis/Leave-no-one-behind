var fs = require('fs');
let {generatePlanets, cardPop, deckGenerator,getCardsIds, hydrateCardDB, destroyDeck, getDeck} = require('./deck')
const {Card} = require("./../models/card");
const {Player} = require("../models/player");
const {Ship} = require("../models/ship");
const {Statuses} = require("../models/statuses");
const {Items} = require("../models/items");
const ws = require("ws");
var langJS = {lang:`var lang=JSON.parse(\``+JSON.stringify(LANG)+`\`);`};
// const { PasteClient, Publicity, ExpireDate } = require("pastebin-api");

module.exports = {
    index(req, res) {
        res.render('index', {lang: langJS});
    },

    async returnOk(req, res) {
        res.status(200);
        res.json({status: 200})
    },

    async deckGenerator(req, res) {
        deckGenerator().then(
            res.render('index-legacy', langJS)
        );

    },

    async buildCardPage(req, res) {

        let data = {'drawflow': {}};

        fs.readdirSync(__dirname + '/../../storage/cache/').forEach(file => {
            let json = JSON.parse(fs.readFileSync(__dirname + '/../../storage/cache/'+file,'utf8'));
            let index = Object.keys(json)[0];
            data.drawflow[index] = json[index];
        });

        data = JSON.stringify(data);

        res.render('drawflow', {vars: {dat: data}});
    },

    async renderSingleSheet (req, res) {

        let player = await new Player().getData(req.body.discord_id);
        res.render('partials/fiche-perso', {player: player, langJS});
    },

    mjMenu(req, res) {
        res.render('mj-menu', {lang: langJS});
    },

    async persos(req, res) {
        await CONFIG.upsert('gameState', 'creation');
        res.render('perso', {lang: langJS});
    },

    ficheVaisseau(req, res) {
        res.render('fiche-vaisseau', {lang: langJS});
    },

    synopsis(req, res) {
        res.render('synopsis', {lang: langJS});
    },

    mainMenu(req, res) {
        res.render('index', {lang: langJS});
    },

    async renderCardEvent(req, res) {

        let players = await DB.tables.players.findAll({raw:true});
        let ship = await new Ship().getData();

        let statuses = new Statuses();
        let activeStatuses = await statuses.getAllStatuses();

        let itemsMan = new Items();
        let items = await itemsMan.getAllItems(false);
        let starters = await itemsMan.getAllStarters();

        players = players.map(player => {

            let playerItems = starters.filter(item => item.owners.includes(player.discord_id));
            player['items'] = playerItems;

            return player;
        })

        if (CONFIG.gameState !== 'gameLive')
            await CONFIG.upsert('gameState', 'gameLive');
        //
        // for (let i of activeStatuses) {
        //     await statuses.remove(i.slug);
        // }

        let statusesAll = await statuses.getAllStatuses(false);

        let current_card = await cardPop(false);
        // TESTING :

        if (!current_card) {
            await CONFIG.upsert('gameState', 'postGame');
            res.redirect('/land');
        }

        let vars = {
            players: players,
            card: current_card,
            ship: ship,
            statuses: statusesAll,
            items: items,
            lang: langJS
        }

        switch (current_card.type) {
            case TYPE_PLANET:
                await cardPop();
                res.render('template-planet', vars);
                break;
            case TYPE_INITIAL:
            case TYPE_NEGATIVE:
            case TYPE_NEUTRAL:
            case TYPE_POSITIVE:
                res.render('template-card', vars);
                break;
            case TYPE_PLACE:
                res.render('template-card', vars);
                break;
        }
    },

    async renderTestCardPlace(req, res) {
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
        let cardRaw = await DB.tables.cards.findOne({
            attributes: [
                'id'
            ],
            where: {
                type: TYPE_PLACE
            }
        });

        let card = await new Card(cardRaw.id).getData();
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
            statuses: statuses,
            lang: langJS
        }

        res.render('template-card', vars);
    },

    async renderTestCardEvent(req, res) {

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
            statuses: statuses,
            items: [],
            lang: langJS
        }

        res.render('template-card', vars);
    },

    async templatePlanet(req, res) {

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
            flo: {cost: '4', val: '60'},
            civ: {cost: '4', val: '60'},
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
        ship: ship,
        lang: langJS
    }

    res.render('template-planet', vars);
},

    endScreen(req, res) {
        res.render('end-screen', {lang: langJS});
    },

    leaderboard(req, res) {
        res.render('leaderboard', {lang: langJS});
    },

    indexLegacy(req, res) {
        res.render('index-legacy', {lang: langJS});
    },

    async land(req, res) {
        let ship = await new Ship().getData();
        await ship.land();

        res.redirect('/score')
    },

    async showScore(req, res) {
    let ship = await new Ship().getData();
    await ship.getData();

    let deck = await getDeck();

    let cardPlayedIds = deck.filter(e => e.played > 0);
    let c;
    let cardPlayed = [];
    while (c = cardPlayedIds.shift()) {
        let crd = await new Card(c.card_id)?.getData();
        cardPlayed.push(crd)
    }

    let cardPlanetPlayed = cardPlayed.filter(e => e.type === TYPE_PLANET).length;
    let cardPosPlayed = cardPlayed.filter(e => e.type === TYPE_POSITIVE).length;
    let cardNegPlayed = cardPlayed.filter(e => e.type === TYPE_NEGATIVE).length;
    let cardNeuPlayed = cardPlayed.filter(e => e.type === TYPE_NEUTRAL || e.type === TYPE_PLACE).length;

    let lastPlanet = async () => {

        let card;
        while (card = cardPlayed.pop()) {
            if (card.type === TYPE_PLANET) {
                return card;
            }
        }
        return false;
    }

    let planet = await lastPlanet();

    let scoreShip = 30*ship.scanner
        + 30*ship.proximity
        + (40*(ship.oxygen+ship.energy+ship.gravity))
        + 80*ship.construction
        + 120*(ship.dbscience+ship.dbhistory);

    let scorePlanet = 85*planet.modules.oxy.val
        + 60*planet.modules.grv.val
        + 95*planet.modules.wtr.val
        + 80*planet.modules.res.val
        + 55*planet.modules.cli.val
        + 30*(planet.modules.fau.val+planet.modules.flo.val)
        + 65*(planet.modules.civ.val)
    ;

    let scoreCards = Math.min(6000*cardNegPlayed + 3500*cardNeuPlayed + Math.min(CONFIG.planetCount,10) * Math.min((cardPlanetPlayed-1),9), 500000) - 4500*cardPosPlayed;

    let scoreTotal = ship.cryopods * scoreShip * scorePlanet / 500000 + scoreCards;

    let score = {
        scoreShip: scoreShip,
        scorePlanet: scorePlanet,
        scoreCards: scoreCards,
        scoreTotal: scoreTotal
    }

    let js = {vars:`var score=JSON.parse('` + JSON.stringify(score) + `'); var ship=JSON.parse('` + JSON.stringify(ship) + `');`};

    let vars = {
        ship: ship,
        score: score,
        js: js,
        planet: planet,
        lang: langJS
    }

    res.render('end-screen', vars);
},

    async start(req, res) {

    res.render('fiche-vaisseau', {lang: langJS});
    await DB.tables.ship.destroy({truncate: true, restartIdentity: true});
    await destroyDeck();

    await hydrateCardDB(true);
    await deckGenerator();

    let ship = new Ship();
    await ship.create();

    let statuses = new Statuses();
    await statuses.hydrateDB();

    let items = new Items();
    await items.hydrateDB();
    await items.giveAllStarters();

    await CONFIG.upsert('gameState', 'gameLive')

    let data = JSON.stringify({
        action: 'game-ready'
    });

    const wsClient = new ws(WS_URL);
    wsClient.on('open', () => {
        wsClient.send(data);
    });},

    async reset(req, res) {

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
}