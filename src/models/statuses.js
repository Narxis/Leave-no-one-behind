const {Op} = require("sequelize");
const fs = require("fs");

class Statuses {

    id;
    name;
    desc;
    slug;
    duration;
    accepted_datas = {
        'name': '',
        'desc': '',
        'slug': '',
        'duration': 0
    }

    constructor(id = 0) {
        this.id = id;
    }

    async create(data = {}) {

        for (let dat in this.accepted_datas)
            this[dat] = (typeof data[dat] === 'undefined' ? this.accepted_datas[dat]: data[dat]);

        await DB.tables.statuses.create({
            name: this.name,
            desc: this.desc,
            slug: this.slug,
            duration: this.duration
        }).then(result => {
            this.id = result.id;
        });

        return await this.getData();
    }

    async updateStatus(slug, newValue) {
        await DB.tables.statuses.update({
            duration: newValue
        }, {
            where: {
                slug: slug,
            }
        })
    }

    async add(slug, val=1) {
        await DB.tables.statuses.increment({duration: val}, { where: { slug: slug } });
    }

    async remove(slug, val=1) {
        await DB.tables.statuses.decrement({duration: val}, { where: { slug: slug } });
    }

    async getData() {

        let status = await DB.tables.statuses.findOne({
            attributes: [
                'id',
                'name',
                'desc',
                'slug',
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
            await DB.tables.statuses.destroy({truncate: true});
        }
        let baseStatusRaw = fs.readFileSync(__dirname + '/../config/statuses.json');
        let baseStatuses = JSON.parse(baseStatusRaw);
        let bulkStatuses = [];

        for (let status of baseStatuses) {
            bulkStatuses.push(status)
        }

        if (bulkStatuses.length > 0)
            await DB.tables.statuses.bulkCreate(bulkStatuses)
    }
}

module.exports = {Statuses}