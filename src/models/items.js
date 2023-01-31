const {Op} = require('sequelize');
const fs = require("fs");

class Items {

    id;
    name;
    desc;
    pool;
    race;
    quantity;
    accepted_datas = {
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
                'name',
                'desc',
                'pool',
                'race',
                'quantity'
            ],
            where: {
                id: this.id
            }
        })

        if (!item) return false;

        for (let dat in item.dataValues) {
            this[dat] = item.dataValues[dat]
        }

        return this;
    }

    async add(name, quantity=1) {
        await DB.tables.items.increment({quantity: quantity}, { where: { name: name } });
    }

    async remove(name, quantity=1) {
        await DB.tables.items.decrement({quantity: quantity}, { where: { name: name } });
    }

    async getAllItems(possessed=true) {

        let whereClause = {};

        if (possessed) {
            whereClause = {
                where: {
                    quantity: {
                        [Op.gt]: 0
                    }
                }
            }
        }

        let result = await DB.tables.items.findAll(whereClause);
        return result.map(r => r.dataValues);
    }

    async hydrateDB(cleanInstall = true) {
        if (cleanInstall) {
            DB.tables.items.destroy({truncate: true});
        }
        let baseItemsRaw = fs.readFileSync(__dirname + '/../config/items.json');
        let baseItems = JSON.parse(baseItemsRaw);

        for (let i in baseItems) {
            let itemPool = baseItems[i];
            for (let j in itemPool) {
                let dat = itemPool[j];
                dat['pool'] = i;
                await this.create(dat);
            }
        }
    }
}

module.exports = {Items}