const {Player} = require("./../models/player");
const {Ship} = require("./../models/ship");
const {hydrateCardDB, getCardsIds, cardPop} = require("./deck");
const {Statuses} = require("../models/statuses");
const {Items} = require("../models/items");
const {Card} = require("../models/card");
const drawflow = require("../controllers/drawflow");
const fs = require('fs');
const { PasteClient, Publicity, ExpireDate } = require("pastebin-api");

// TODO replace shipId with current game ship ID
const shipId = 1;

module.exports = {
    async index(req, res) {
        res.status(200);
        res.json({});
    },

    async savePlaces(req, res) {

        let name = Object.keys(req.body)[0];
        let body = JSON.stringify(req.body);
        // SAVE A COPY IN CACHE (failsafe)
        fs.writeFileSync(__dirname + '/../../storage/cache/'+name+'_'+PLACESDAT_FILEMAME, body);

        // SAVE ON PASTEBIN
        const client = new PasteClient(process.env.PASTEBIN_K);
        const token = await client.login({ name: process.env.PASTEBIN_U, password: process.env.PASTEBIN_P });

        const pastes = await client.getPastesByUser({
            userKey: token,
            limit: 100,
        });

        for (let paste of pastes) {
            if (paste.paste_title === name+'_'+PLACESDAT_FILEMAME) {
                await client.deletePasteByKey({
                    userKey: token,
                    pasteKey: paste.paste_key,
                });
            }
        }

        await client.createPaste({
            code: body,
            expireDate: ExpireDate.Never,
            format: "json",
            name: name+"_"+PLACESDAT_FILEMAME,
            publicity: Publicity.Private,
            apiUserKey: token
        });

        res.json({
            success: true
        })
    },

    async deletePlace(req, res) {
        let name = req.body.name;

        fs.unlinkSync(name+"_"+PLACESDAT_FILEMAME);

        const client = new PasteClient(process.env.PASTEBIN_K);
        const token = await client.login({ name: process.env.PASTEBIN_U, password: process.env.PASTEBIN_P });

        const pastes = await client.getPastesByUser({
            userKey: token,
            limit: 100,
        });

        for (let paste of pastes) {
            if (paste.paste_title === name+'_'+PLACESDAT_FILEMAME) {
                await client.deletePasteByKey({
                    userKey: token,
                    pasteKey: paste.paste_key,
                });
                break;
            }
        }

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
            this.showError(res, 'No player for this ID')
        else {
            delete player['accepted_datas'];
            res.json(player)
        }
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

        res.json(card);
    },

    async popNextCard(req, res) {

        let next_card = await cardPop();

        let statuses = await new Statuses();
        let activeStatuses = await statuses.getAllStatuses();

        for (let i of activeStatuses) {
            await statuses.remove(i.slug);
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
            card = this.cleanObject(card, 'langVars','cardVars','accepted_datas');
            cards.push(card);
        }

        res.json(cards);
    },

    cleanObject(object, ...unusedKeys){
        for (let key in object) {
            if (unusedKeys.includes(key) === true)
                delete object[key];
        }
        return object;
    },

    showError(res, msg) {
        res.status(404);
        res.json({
            error_msg: msg
        })
    }
}