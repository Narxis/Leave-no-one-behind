const {Op} = require('sequelize');

class Items {

    constructor() {}

    async create(name, value=0, is_item=1) {

        await DB.tables.items.create({
            name: name,
            value: value,
            is_item: is_item
        })
    }

    async add(name, quantity=1) {
        //
    }

    async remove(name, quantity=1) {
        //
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
}

module.exports = {Items}