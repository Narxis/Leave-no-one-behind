const {Op} = require("sequelize");
const fs = require("fs");

class Statuses {

    id;
    name;
    desc;
    duration;
    accepted_datas = {
        'name': '',
        'desc': '',
        'duration': 0
    }

    constructor() {}

    async create(data = {}) {

        for (let dat in this.accepted_datas)
            this[dat] = (typeof data[dat] === 'undefined' ? this.accepted_datas[dat]: data[dat]);

        await DB.tables.statuses.create({
            name: this.name,
            desc: this.desc,
            duration: this.duration
        }).then(result => {
            this.id = result.id;
        });

        return await this.getData();
    }

    async updateStatus(name, newValue) {
        await DB.tables.statuses.update({
            value: newValue
        }, {
            where: {
                name: name,
            }
        })
    }

    async getData() {

        let status = await DB.tables.statuses.findOne({
            attributes: [
                'id',
                'name',
                'desc',
                'duration'
            ],
            where: {
                id: this.id
            }
        })

        if (!status) return false;

        for (let dat in status.dataValues) {
            this[dat] = status.dataValues[dat]
        }

        return this;
    }

    async getAllStatuses(active=true) {

        let whereClause = {};
        if (active) {
            whereClause = {
                where: {
                    duration: {
                        [Op.gt]: 0
                    }
                }
            }
        }
        let result = await DB.tables.statuses.findAll(whereClause);

        return result.map(r => r.dataValues);
    }

    async hydrateDB(cleanInstall = true) {
        if (cleanInstall) {
            DB.tables.statuses.destroy({truncate: true});
        }
        let baseStatusRaw = fs.readFileSync(__dirname + '/../config/statuses.json');
        let baseStatuses = JSON.parse(baseStatusRaw);

        for (let i in baseStatuses) {
            await this.create(baseStatuses[i]);
        }
    }
}

module.exports = {Statuses}