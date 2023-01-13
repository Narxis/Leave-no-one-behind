class Bonuses {

    constructor() {}

    async create(name, value=0, is_conso=1) {

        await DB.tables.bonuses.create({
            name: name,
            value: value,
            is_conso: is_conso
        })
    }

    async deleteOne(name) {
        await DB.tables.bonuses.destroy({ where: {name: name}, limit:1 })
    }

    async exists(name) {
        return await DB.tables.bonuses.count({where: {name:name} }) > 0;
    }

    async updateStatus(name, newValue) {
        await DB.tables.bonuses.update({
            value: newValue
        }, {
            where: {
                name: name,
                is_conso: 0
            }
        })
    }

    async getAllStatuses() {
        let result = await DB.tables.bonuses.findAll({
            where: {
                is_conso: 0
            }
        })

        return result.map(r => r.dataValues);
    }

    async getAllConsumables() {
        let result = await DB.tables.bonuses.findAll({
            where: {
                is_conso: 1
            }
        })

        return result.map(r => r.dataValues);
    }
}
