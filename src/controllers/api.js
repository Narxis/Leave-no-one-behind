const {Player} = require("./../models/player");
const {Ship} = require("./../models/ship");
const {hydrateCardDB, getCardsIds, cardPop, announceCard, getCurrentCard} = require("./deck");
const ws = require("ws");
const {Statuses} = require("../models/statuses");
const {Items} = require("../models/items");
const {Card} = require("../models/card");
const drawflow = require("../controllers/drawflow");
const fs = require('fs');
const paths = require('../config/paths');
// Nom d'un lieu de l'éditeur : il sert de nom de fichier, rien d'autre que lettres, chiffres, - et _
const validPlaceName = (name) => typeof name === 'string' && /^[a-z0-9_-]{1,40}$/i.test(name);
const combat = require("./combat");
const allies = require("./allies");
const shipAlerts = require("./shipAlerts");
const races = require("./races");
const playerView = require("./playerView");
const itemsEditor = require("./itemsEditor");
const npcs = require("./npcs");
const leaderboard = require("./leaderboard");
const gameSettings = require("./gameSettings");
// const { PasteClient, Publicity, ExpireDate } = require("pastebin-api");

// TODO replace shipId with current game ship ID
const shipId = 1;

module.exports = {
    async index(req, res) {
        res.status(200);
        res.json({});
    },

    getRaces(req, res) {
        res.json(races.list());
    },

    getAllowedRaces(req, res) {
        res.json(races.allowedState());
    },

    setAllowedRaces(req, res) {
        races.setAllowed((req.body || {}).allowed);
        playerView.changed();
        res.json(races.allowedState());
    },

    saveRace(req, res) {
        let result = races.save(req.body || {});
        res.status(result.error ? 400 : 200).json(result);
    },

    async deleteRace(req, res) {
        let result = await races.remove(req.params.slug);
        res.status(result.error ? 400 : 200).json(result);
    },

    // Éditeur d'ennemis et compagnons (/bestiaire) : kind vaut enemies ou companions
    getNpcs(req, res) {
        res.json({enemies: npcs.getEnemies(), companions: npcs.getCompanions()});
    },

    saveNpc(req, res) {
        let save = {enemies: npcs.saveEnemy, companions: npcs.saveCompanion}[req.params.kind];
        if (!save)
            return res.status(404).json({error: 'Type de fiche inconnu.'});
        let result = save(req.body || {});
        res.status(result.error ? 400 : 200).json(result);
    },

    deleteNpc(req, res) {
        let remove = {enemies: npcs.removeEnemy, companions: npcs.removeCompanion}[req.params.kind];
        if (!remove)
            return res.status(404).json({error: 'Type de fiche inconnu.'});
        let result = remove(req.params.slug);
        res.status(result.error ? 400 : 200).json(result);
    },

    async savePlaces(req, res) {

        try {
            let name = Object.keys(req.body)[0];
            if (!validPlaceName(name))
                return res.json({success: false, error: 'Nom de lieu invalide'});
            let body = JSON.stringify(req.body);
            // SAVE A COPY IN CACHE (failsafe)
            fs.writeFileSync(paths.cache(name + '_' + PLACESDAT_FILEMAME), body);

            // SAVE ON PASTEBIN
            // const client = new PasteClient(process.env.PASTEBIN_K);
            // const token = await client.login({ name: process.env.PASTEBIN_U, password: process.env.PASTEBIN_P });
            //
            // const pastes = await client.getPastesByUser({
            //     userKey: token,
            //     limit: 100,
            // });
            //
            // for (let paste of pastes) {
            //     if (paste.paste_title === name+'_'+PLACESDAT_FILEMAME) {
            //         await client.deletePasteByKey({
            //             userKey: token,
            //             pasteKey: paste.paste_key,
            //         });
            //     }
            // }
            //
            // await client.createPaste({
            //     code: body,
            //     expireDate: ExpireDate.Never,
            //     format: "json",
            //     name: name+"_"+PLACESDAT_FILEMAME,
            //     publicity: Publicity.Private,
            //     apiUserKey: token
            // });
            res.json({
                success: true
            })
        }
        catch (e) {
            res.json({
                success: false,
                error: e.toString()
            })
        }
    },

    async deletePlace(req, res) {
        let name = req.body.name;
        if (!validPlaceName(name))
            return res.json({success: false, error: 'Nom de lieu invalide'});

        try {
            fs.unlinkSync(paths.cache(name + '_' + PLACESDAT_FILEMAME));
        }
        catch {
            //
        }

        // const client = new PasteClient(process.env.PASTEBIN_K);
        // const token = await client.login({ name: process.env.PASTEBIN_U, password: process.env.PASTEBIN_P });
        //
        // const pastes = await client.getPastesByUser({
        //     userKey: token,
        //     limit: 100,
        // });
        //
        // for (let paste of pastes) {
        //     if (paste.paste_title === name+'_'+PLACESDAT_FILEMAME) {
        //         await client.deletePasteByKey({
        //             userKey: token,
        //             pasteKey: paste.paste_key,
        //         });
        //         break;
        //     }
        // }

        res.json({});
},

    async getAllStatuses(req, res) {
        let statuses = new Statuses();
        statuses = await statuses.getAllStatuses(false);

        res.json(statuses);
    },

    async getActiveStatuses (req, res) {
        let statuses = new Statuses();
        statuses = await statuses.getAllStatuses();

        res.json(statuses);
    },

    async getAllItems(req, res) {
        let items = new Items();
        items = await items.getAllItems(false);

        res.json(items);
    },

    async getOwnedItems(req, res) {
        let items = new Items();
        items = await items.getAllItems();

        res.json(items);
    },

    async getItemCatalog(req, res) {
        res.json(await itemsEditor.list());
    },

    async saveCatalogItem(req, res) {
        let result = await itemsEditor.save(req.body || {});
        res.status(result.error ? 400 : 200).json(result);
    },

    async deleteCatalogItem(req, res) {
        let result = await itemsEditor.remove(req.params.slug);
        res.status(result.error ? 400 : 200).json(result);
    },

    async getPlayerItems (req, res) {
        let itemsMan = new Items();
        let items = await itemsMan.getAllStarters();

        items = items.filter(item => item.owners.includes(req.params.discordId))

        res.json(items);
    },

    async getPlayer(req, res) {
        let player = new Player();
        player = await player.getData(req.params.discordId);
        if (!player)
            showError(res, 'No player for this ID')
        else {
            delete player['accepted_datas'];
            res.json(player)
        }
    },

    getCombat(req, res) {
        res.json(combat.getState());
    },

    getAllies(req, res) {
        res.json(allies.getAllies());
    },

    // Salles qui clignotent et alerte en cours sur le plan du vaisseau
    getShipAlerts(req, res) {
        res.json(shipAlerts.getState());
    },

    // Équipe de la partie en cours (nommée par le MJ avant de commencer)
    getTeam(req, res) {
        res.json(leaderboard.getCurrent());
    },

    setTeam(req, res) {
        let team = leaderboard.setTeam(req.body && req.body.name);
        if (!team)
            return res.status(400).json({error: 'Nom d\'équipe vide'});
        res.json(team);
    },

    // Paramètres de la partie (nombre de planètes, cartes par étape)
    getSettings(req, res) {
        res.json(gameSettings.get());
    },

    async setSettings(req, res) {
        let result = await gameSettings.set(req.body);
        if (result.error)
            return res.status(400).json(result);
        res.json(result);
    },

    async getAllPlayers(req, res) {
        let players = await DB.tables.players.findAll();
        res.json(players);
    },

    async getNextCard(req, res) {

        let next_card = await cardPop(false);
        res.json(next_card);
    },

    async getCardByName(req, res) {

        let cardRaw = await DB.tables.cards.findOne({
            attributes: [
                'id'
            ],
            where: {
                name: req.params.name
            }
        });

        let card = await new Card(cardRaw.id).getData();
        // Carte de suite d'un choix : elle devient la carte affichée
        announceCard(card);

        res.json(card);
    },

    // Carte affichée sur la page de jeu (panneau MJ ouvert en cours de partie)
    getCurrentCard(req, res) {
        res.json(getCurrentCard() || {});
    },

    async popNextCard(req, res) {

        let statuses = await new Statuses();
        let activeStatuses = await statuses.getAllStatuses();

        // Option du MJ : les statuts hors combat s'arrêtent après la visite
        // d'une planète. La dernière carte jouée est alors cette planète : on
        // reprend le voyage, la carte piochée est tirée sans eux (variantes)
        let last = await DB.tables.deck.findOne({where: {deck_id: 0, played: 1}, order: [['id', 'DESC']], raw: true});
        let lastCard = last && await DB.tables.cards.findOne({attributes: ['type'], where: {id: last.card_id}, raw: true});
        let clear = !!lastCard && lastCard.type === TYPE_PLANET && gameSettings.get().clearStatusesAfterPlanet;
        if (clear) {
            for (let i of activeStatuses)
                await statuses.updateStatus(i.slug, 0);
        }

        let next_card = await cardPop();

        if (!clear) {
            for (let i of activeStatuses)
                await statuses.remove(i.slug);
        }
        // Les durées ont baissé (ou sont remises à zéro) : le panneau MJ redessine ses status
        if (activeStatuses.length) {
            const wsClient = new ws(WS_URL);
            wsClient.on('open', () => {
                wsClient.send(JSON.stringify({action: 'passThrough', data: {action: 'status', data: {}}}));
                wsClient.close();
            });
            wsClient.on('error', () => {});
        }

        res.json(next_card);
    },

    async getShip(req, res) {
        let ship = new Ship(shipId);
        if (! await ship.getData())
            await ship.create();
        delete ship['accepted_datas'];
        res.json(ship);
    },

    async getAllCards(req, res) {
        let type = req.params.type;
        let whereClause;

        switch (type) {
            case 'planet':
                whereClause = {type: TYPE_PLANET};
                break;
            case 'positive':
                whereClause = {type: TYPE_POSITIVE};
                break;
            case 'negative':
                whereClause = {type: TYPE_NEGATIVE};
                break;
            case 'neutral':
                whereClause = {type: TYPE_NEUTRAL};
                break;
            case 'initial':
                whereClause = {type: TYPE_INITIAL};
                break;
            case 'place':
                break;
        }

        let cardsRaw = await DB.tables.cards.findAll({where:whereClause, raw:true});
        let cards = [];

        for (let item of cardsRaw){
            let  card = await new Card(item.id).getData();
            card = cleanObject(card, 'langVars','cardVars','accepted_datas');
            cards.push(card);
        }

        res.json(cards);
    }
}

const cleanObject = function (object, ...unusedKeys){
    for (let key in object) {
        if (unusedKeys.includes(key) === true)
            delete object[key];
    }
    return object;
}

const showError = function (res, msg) {
    res.status(404);
    res.json({
        error_msg: msg
    })
}