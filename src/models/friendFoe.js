const {Ship} = require('./ship')

class friendFoe {
    id;
    name;
    slug;
    is_friend;
    race;
    combat;
    pilotage;
    engineering;
    survival;
    recon;
    moral;
    accepted_datas = {
        'name': '',
        'slug': '',
        'is_friend': 1,
        'race': '',
        'combat': 0,
        'pilotage': 0,
        'engineering': 0,
        'survival': 0,
        'recon': 0,
        'moral': 0,
    }

    constructor(id = 0) {
        this.id = id;
    }

    async create(data = {}) {

        for (let dat in data) {
            if (typeof data[dat].min === 'number' && typeof data[dat].max === 'number') {
                data[dat] =  randomIntFromInterval(data[dat].min, data[dat].max);
            }
        }

        for (let dat in this.accepted_datas)
            this[dat] = (typeof data[dat] === 'undefined' ? this.accepted_datas[dat]: data[dat]);

        await DB.tables.friend_foes.create({
            name: this.name,
            slug: this.slug,
            is_friend: this.is_friend,
            race: this.race,
            combat: this.combat,
            pilotage: this.pilotage,
            engineering: this.engineering,
            survival: this.survival,
            recon: this.recon,
            moral: this.moral
        }).then(result => {
            this.id = result.id;
        })

        return await this.getData()
    }

    async update(data = {}) {

        await this.getData();
        let whereClause = { id: this.id };

        for (let dat in this.accepted_datas)
            this[dat] = (typeof data[dat] === 'undefined' ? this[dat] : data[dat]);

        await DB.tables.friend_foes.update({
            name: this.name,
            slug: this.slug,
            is_friend: this.is_friend,
            race: this.race,
            combat: this.combat,
            pilotage: this.pilotage,
            engineering: this.engineering,
            survival: this.survival,
            recon: this.recon,
            moral: this.moral
        }, {
            where: whereClause
        });

        return await this.getData();
    }

    async delete() {
        let whereClause = { id: this.id };
        await DB.tables.friend_foes.destroy({ where: whereClause });
    }

    async getData() {

        let whereClause = { id: this.id };

        let friend_foe = await DB.tables.friend_foes.findOne({
            attributes: [
                'id',
                'is_friend',
                'name',
                'slug',
                'race',
                'combat',
                'pilotage',
                'engineering',
                'survival',
                'recon',
                'moral'
            ],
            where: whereClause
        })

        if (!friend_foe) return false;

        for (let dat in friend_foe.dataValues) {
            this[dat] = friend_foe.dataValues[dat]
        }

        return this;
    }

    async switchTeam() {
        await this.getData();

        let dat = {is_friend: this.is_friend ? 0 : 1}
        return await this.update(dat);
    }

    async roll(stat) {

        let roll = randomIntFromInterval(1,100);
        let res = roll * this[stat]/100 + (this.moral-50)/4;

        return Math.ceil(res);
    }
}

module.exports = {friendFoe}