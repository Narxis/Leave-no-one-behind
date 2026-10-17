var fs = require('fs');
const paths = require('../config/paths');
let {generatePlanets, cardPop, deckGenerator,getCardsIds, hydrateCardDB, destroyDeck, getDeck} = require('./deck')
const {Card} = require("./../models/card");
const {Player} = require("../models/player");
const {Ship} = require("../models/ship");
const combat = require("./combat");
const allies = require("./allies");
const shipAlerts = require("./shipAlerts");
const inventory = require("./inventory");
const planetGen = require("./planetGen");
const leaderboard = require("./leaderboard");
const lobby = require("./lobby");
const gameSettings = require("./gameSettings");
const races = require("./races");
const itemsEditor = require("./itemsEditor");
const npcs = require("./npcs");
const {Statuses} = require("../models/statuses");
const {Items} = require("../models/items");
const drawflow = require("../controllers/drawflow");
const ws = require("ws");
// Textes du jeu pour les pages : recalculés à chaque rendu, pour inclure les
// races customs créées depuis le démarrage
var langJS = {get lang() { return 'var lang=' + JSON.stringify(LANG).replace(/</g, '\\u003c') + ';'; }};
// const { PasteClient, Publicity, ExpireDate } = require("pastebin-api");

// Calcule le score final et affiche l'écran de fin (partie réelle et démo)
// record : vraie fin de partie, le score de l'équipe entre au classement
const renderEndScreen = async function (res, ship, planet, scoreCards, record = false) {
    let scoreShip = 30*ship.scanner
        + 30*ship.proximity
        + (40*(ship.oxygen+ship.energy+ship.gravity))
        + 80*ship.construction
        + 120*(ship.dbscience+ship.dbhistory);

    // Les valeurs des modules sont stockées en texte : sans conversion,
    // fau.val + flo.val concatène ("32" + "31" = "3231") au lieu d'additionner
    let mod = (name) => Number(planet.modules[name].val) || 0;

    let scorePlanet = 85*mod('oxy')
        + 60*mod('grv')
        + 95*mod('wtr')
        + 80*mod('res')
        + 55*mod('cli')
        + 30*(mod('fau')+mod('flo'))
        + 65*mod('civ')
    ;

    let scoreTotal = ship.cryopods * scoreShip * scorePlanet / 500000 + scoreCards;

    let score = {
        scoreShip: scoreShip,
        scorePlanet: scorePlanet,
        scoreCards: scoreCards,
        scoreTotal: scoreTotal
    }

    let leaderboardId = record ? await leaderboard.record({
        score: scoreTotal, cryopods: ship.cryopods, planet: planet.name,
        scoreShip: scoreShip, scorePlanet: scorePlanet, scoreCards: scoreCards
    }) : null;

    let js = {vars:`var score=JSON.parse('` + JSON.stringify(score) + `'); var ship=JSON.parse('` + JSON.stringify(ship) + `');`};

    // Réglages avec lesquels la partie a été jouée (ceux du lancement)
    let current = leaderboard.getCurrent();
    let settings = record && current && current.settings ? current.settings : gameSettings.get();

    let vars = {
        ship: ship,
        score: score,
        settings: settings,
        js: js,
        planet: planet,
        leaderboardId: leaderboardId,
        lang: langJS
    }

    res.render('end-screen', vars);
}

module.exports = {
    index(req, res) {
        res.render('index', {lang: langJS});
    },

    async returnOk(req, res) {

        await generatePlanets(1,500);

        // let cardsRaw = await DB.tables.cards.findAll({attributes: ['id'], raw:true, where: {type: TYPE_PLACE}});
        //
        // let objectDataSet = {"drawflow": {}};
        //
        // for (let cardRaw of cardsRaw) {
        //     let card = await new Card(cardRaw.id).getData();
        //     let module = await drawflow.buildPlaceDataSet(card);
        //
        //     for (let index in module) {
        //         objectDataSet['drawflow'][index] = module[index];
        //     }
        // }
        // res.json(objectDataSet)

        res.status(200);
        res.json({status: 200})
    },

    async deckGenerator(req, res) {
        deckGenerator().then(
            res.render('index-legacy', langJS)
        );

    },

    async buildCardPage(req, res) {

        // const client = new PasteClient(process.env.PASTEBIN_K);
        // const token = await client.login({ name: process.env.PASTEBIN_U, password: process.env.PASTEBIN_P });
        //
        // const pastes = await client.getPastesByUser({
        //     userKey: token,
        //     limit: 10,
        // });
        //
        let data = {'drawflow': {}};
        // for (let paste of pastes) {
        //     if (paste.paste_title.endsWith(PLACESDAT_FILEMAME)) {
        //         let rawData = await client.getRawPasteByKey({
        //             pasteKey: paste.paste_key,
        //             userKey: token,
        //         });
        //
        //         let parsedRawData = JSON.parse(rawData);
        //         for (let index in parsedRawData) {
        //             data['drawflow'][index] = parsedRawData[index];
        //         }
        //     }
        // }

        // if (!data) {
            // data = fs.readFileSync(__dirname + '/../../storage/cache/placesDat.json','utf8');
        // Seuls les fichiers des lieux (le cache contient aussi les compagnons, le classement…)
        fs.readdirSync(paths.cache()).filter(file => file.endsWith('_' + PLACESDAT_FILEMAME)).forEach(file => {
            let json = JSON.parse(fs.readFileSync(paths.cache(file),'utf8'));
            let index = Object.keys(json)[0];
            data.drawflow[index] = json[index];
        });
        // }
        // else
        data = JSON.stringify(data);

        // « < » échappé : un texte contenant </script> ne casse pas la page
        res.render('drawflow', {vars: {dat: data.replace(/</g, '\\u003c')}, lang: langJS, lootItems: combat.getLootList()});
    },

    async renderSingleSheet (req, res) {

        let player = await new Player().getData(req.body.discord_id);
        res.render('partials/fiche-perso', {player: player, langJS, races: races.list()});
    },

    async mjMenu(req, res) {
        let statuses = (await new Statuses().getAllStatuses(false))
            .map(s => ({slug: s.slug, name: s.name}));
        res.render('mj-menu', {lang: langJS, bestiary: combat.getBestiary(), companions: npcs.getCompanions(), loot: combat.getLootList(), statuses: statuses, shipRooms: shipAlerts.ROOMS});
    },

    // Paramètres de la partie, choisis par le MJ avant la création des persos
    settings(req, res) {
        res.render('parametres', {
            lang: langJS,
            settings: gameSettings.get(),
            fields: gameSettings.FIELDS,
            options: gameSettings.OPTIONS,
            presets: gameSettings.PRESETS,
            available: gameSettings.available()
        });
    },

    async persos(req, res) {
        // Nouvelle création : les personnages de la partie précédente sont effacés
        // (avec leurs objets et les compagnons du MJ). Pas sur un rechargement de
        // la page elle-même, pour ne pas perdre les joueurs qui viennent de rejoindre
        let from = '';
        try {
            from = new URL(req.get('referer') || '').pathname;
        } catch (e) {}
        if (from !== '/persos') {
            await DB.tables.players.destroy({where: {}});
            await DB.tables.items.update({owners: ''}, {where: {}});
            allies.clear();
            shipAlerts.reset();
        }
        await CONFIG.upsert('gameState', 'creation');
        // Bonus et malus des races (customs comprises), pour l'explication de la répartition des stats
        res.render('perso', {lang: langJS, races: races.list(), settings: gameSettings.get()});
    },

    // Éditeur des races customs
    renderRaces(req, res) {
        res.render('races', {lang: langJS, races: races.list(), maxRaces: races.MAX_RACES});
    },

    // Éditeur d'objets (catalogue src/config/items.json)
    async renderItemsEditor(req, res) {
        res.render('items-editor', {lang: langJS, catalog: await itemsEditor.list()});
    },

    // Éditeur d'ennemis et compagnons
    renderNpcEditor(req, res) {
        res.render('npc-editor', {
            lang: langJS,
            enemies: npcs.getEnemies(),
            companions: npcs.getCompanions(),
            loot: combat.getLootList(),
            races: races.list().map(r => ({name: r.name, stats: r.stats})),
            limits: {enemies: npcs.MAX_ENEMIES, companions: npcs.MAX_COMPANIONS, loot: npcs.LOOT_SIZE}
        });
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
        let inventories = await inventory.getInventories();
        let shipItems = await inventory.getShip();

        players = players.map(player => {

            player['items'] = inventories[player.discord_id] || [];

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
            return res.redirect('/land');
        }

        let vars = {
            players: players,
            card: current_card,
            ship: ship,
            statuses: statusesAll,
            items: items,
            shipItems: shipItems,
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
            dbscience: 100,
            dbhistory: 100,
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
            dbscience: 100,
            dbhistory: 100,
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
        items: [],
        lang: langJS
    }

    res.render('template-planet', vars);
},

    // Labo de test : une planète tirée au hasard à chaque chargement, à scanner
    // sans limite de points. Rien n'est lu ni écrit dans la partie en cours
    renderPlanetLab(req, res) {
        const BANDS = {1: [1, 500], 2: [501, 800], 3: [801, 1000]};
        // Graine : tout en découle (tranche si elle n'est pas imposée, stats,
        // coûts, relief, lunes) ; ?seed=… redonne exactement la même planète
        let seed = parseInt(req.query.seed);
        if (!(seed > 0 && seed < 2147483647))
            seed = 1 + Math.floor(Math.random() * 2147483646);
        let rng = (function (a) {
            return function () {
                a = (a + 0x6D2B79F5) | 0;
                let t = Math.imul(a ^ (a >>> 15), 1 | a);
                t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        })(seed);
        let band = BANDS[req.query.tranche] ? String(req.query.tranche) : '';
        let [min, max] = BANDS[band] || BANDS[1 + Math.floor(rng() * 3)];
        let planet = planetGen.rollPlanet(min, max, rng);

        let modules = {};
        for (let stat in planet.values)
            modules[stat] = {val: planet.values[stat], cost: 1 + Math.floor(rng() * 4)};

        let archetype = planetGen.ARCHETYPES.archetypes[planet.archetype];
        let card = {
            // Graine du rendu (relief, lunes)
            id: seed,
            value: planet.score,
            name: archetype ? archetype.name : '',
            modules: modules
        };
        let ship = {
            id: 0, name: '', cryopods: 1000, scanner: 100, proximity: 100, motors: 100, shield: 100,
            oxygen: 100, energy: 100, gravity: 100, landing: 100, dbscience: 100, dbhistory: 100,
            construction: 100, scanner_up: 0, oxygen_up: 0, energy_up: 0, gravity_up: 0
        };

        res.render('template-planet', {
            players: [],
            card: card,
            ship: ship,
            items: [],
            lang: langJS,
            planetLab: {seed: seed, band: band, archetype: card.name || 'Tirage libre', score: planet.score, values: planet.values}
        });
    },

    // Démo de l'écran de fin avec un vaisseau et une planète fictifs
    endScreen(req, res) {
        let ship = {
            name: '',
            cryopods: 850,
            scanner: 80,
            proximity: 70,
            motors: 90,
            shield: 60,
            oxygen: 75,
            energy: 65,
            gravity: 85,
            landing: 70,
            dbscience: 50,
            dbhistory: 40,
            construction: 60
        };

        let planet = {
            value: 890,
            modules: {
                oxy: {cost: 2, val: 50},
                grv: {cost: 3, val: 30},
                wtr: {cost: 2, val: 30},
                fau: {cost: 4, val: 60},
                flo: {cost: 4, val: 60},
                civ: {cost: 4, val: 60},
                cli: {cost: 2, val: 30},
                res: {cost: 1, val: 40}
            }
        };

        return renderEndScreen(res, ship, planet, 12000);
    },

    leaderboard(req, res) {
        res.render('leaderboard', {
            entries: leaderboard.list(),
            highlight: String(req.query.highlight || ''),
            lang: langJS
        });
    },

    // Partie en ligne : code à donner aux joueurs et joueurs connectés
    lobby(req, res) {
        res.render('lobby', {lobby: lobby.getState(), lang: langJS});
    },

    indexLegacy(req, res) {
        res.render('index-legacy', {lang: langJS});
    },

    async land(req, res) {
        let ship = await new Ship().getData();
        // Pas de partie en cours : retour à l'accueil au lieu de crasher
        if (!ship)
            return res.redirect('/');
        await ship.land();

        res.redirect('/score')
    },

    async showScore(req, res) {
    let ship = await new Ship().getData();
    if (!ship)
        return res.redirect('/');

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
    // Aucune planète jouée : pas de score possible
    if (!planet)
        return res.redirect('/');

    let scoreCards = Math.min(6000*cardNegPlayed + 3500*cardNeuPlayed + 3500*Math.min(CONFIG.planetCount,10)*Math.min((cardPlanetPlayed-1),9), 500000) - 4500*cardPosPlayed;

    await renderEndScreen(res, ship, planet, scoreCards, true);
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
        shipAlerts.reset();

        res.redirect('/');
    }
}