const {Op, where} = require('sequelize');
const fs = require("fs");
const {Player} = require("./player");

class Items {

    id;
    owners;
    slug;
    name;
    desc;
    pool;
    race;
    quantity;
    accepted_datas = {
        'owners': [],
        'slug': '',
        'name': '',
        'desc': '',
        'pool': '',
        'race': '',
        'quantity': 0
    }

    constructor() {}

    async create(data = {}) {

        for (let dat in this.accepted_datas)
            this[dat] = (typeof data[dat] === 'undefined' ? this.accepted_datas[dat]: data[dat]);

        await DB.tables.items.create({
            owners: this.owners.join(','),
            slug: this.slug,
            name: this.name,
            desc: this.desc,
            pool: this.pool,
            race: this.race,
            quantity: this.quantity
        }).then(result => {
            this.id = result.id;
        });

        return await this.getData();
    }

    async getData() {

        let item = await DB.tables.items.findOne({
            attributes: [
                'id',
                'owners',
                'slug',
                'name',
                'desc',
                'pool',
                'race',
                'quantity'
            ],
            raw: true,
            where: {
                id: this.id
            }
        })

        if (!item) return false;

        for (let dat in item) {
            if (dat === 'owners' && item[dat])
                item[dat] = item[dat].split(',');

            this[dat] = item[dat]
        }

        return this;
    }

    async add(slug, quantity=1) {
        let ret = await DB.tables.items.increment({quantity: quantity}, { where: { slug: slug } });
        if (ret[0][1] === 0) {
            await this.create({name: slug, slug: slug, quantity:quantity})
        }
    }

    async remove(slug, quantity=1) {
        await DB.tables.items.decrement({quantity: quantity}, { where: { slug: slug } });
    }

    async giveAllStarters () {
        let allStarters = await DB.tables.items.findAll({raw:true, where : {pool: 'starter'}});
        let players = await DB.tables.players.findAll({raw:true});

        for (let player of players) {
            for (let starterItem of allStarters) {
                if (player.race.startsWith(starterItem.race)) {
                    await this.giveItemToPlayer(starterItem.slug, player.discord_id)
                }
            }
        }
    }

    // No notion of quantity on player item (starters)
    async giveItemToPlayer(slug, discord_id) {
        let item = await DB.tables.items.findOne({where: {slug:slug}, raw:true});

        let new_owners = [];
        if (item.owners && item.owners !== '')
           new_owners = item.owners.split(',');
        new_owners.push(discord_id);
        new_owners = [...new Set(new_owners)];
        new_owners = new_owners.join(',');

        await DB.tables.items.update({owners:new_owners}, {where:{ slug:slug }})
    }

    async removeItemFromPlayer(slug, discord_id) {
        let item = await DB.tables.items.findOne({where: {slug:slug}, raw:true});

        let new_owners = [];
        if (item.owners && item.owners !== '')
            new_owners = item.owners.split(',');
        new_owners = new_owners.filter(v => v!==discord_id);
        new_owners = new_owners.join(',');

        await DB.tables.items.update({owners:new_owners}, {where:{ slug:slug }})
    }

    async getAllStarters(possessed = true) {
        let whereClause = {
            where: {
                pool: 'starter'
            }
        };

        if (possessed) {
            whereClause = {
                where: {
                    pool: 'starter',
                    owners: {
                        [Op.ne]: ''
                    }
                }
            }
        }
        let result = await DB.tables.items.findAll(whereClause);
        result = result.map(r => r.dataValues);
        result = result.map(r => {
            if (r.owners) {
                r.owners = r.owners.split(',');
            }
            return r;
        })

        return result
    }

    async getAllItems(possessed=true) {

        let whereClause = {
            where: {
                pool: {
                    [Op.ne]: 'starter'
                }
            }
        };

        if (possessed) {
            whereClause = {
                where: {
                    quantity: {
                        [Op.gt]: 0
                    },
                    pool: {
                        [Op.ne]: 'starter'
                    }
                }
            }
        }

        let result = await DB.tables.items.findAll(whereClause);
        return result.map(r => r.dataValues);
    }

    async hydrateDB(cleanInstall = true) {
        if (cleanInstall) {
            await DB.tables.items.destroy({truncate: true});
        }
        let baseItemsRaw = fs.readFileSync(__dirname + '/../config/items.json');
        let baseItems = JSON.parse(baseItemsRaw);
        let bulkItems = [];

        for (let i in baseItems) {
            let itemPool = baseItems[i];
            for (let j in itemPool) {
                let dat = itemPool[j];
                dat['pool'] = i;
                bulkItems.push(dat);
            }
        }

        if (bulkItems.length > 0) {
            await DB.tables.items.bulkCreate(bulkItems);
        }
    }
}

module.exports = {Items}