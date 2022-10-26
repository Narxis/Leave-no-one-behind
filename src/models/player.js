class Player {
    id;
    name;
    race;
    combat;
    pilotage;
    engineering;
    survival;
    recon;
    moral;
    accepted_datas = {
        'name': '',
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
        // must use this.getData() since Sequelize works with Promises
    }

    async create(data = {}) {
        for (let dat in this.accepted_datas)
            this[dat] = (typeof data[dat] === 'undefined' ? this.accepted_datas[dat]: data[dat]);

        await DB.tables.players.create({
            name: this.name,
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

        for (let dat in this.accepted_datas)
            this[dat] = (typeof data[dat] === 'undefined' ? this[dat] : data[dat]);

        await DB.tables.players.update({
            name: this.name,
            race: this.race,
            combat: this.combat,
            pilotage: this.pilotage,
            engineering: this.engineering,
            survival: this.survival,
            recon: this.recon,
            moral: this.moral
        }, {
            where: {
                id: this.id
            }
        });

        return await this.getData();
    }

    async delete() {
        await DB.tables.players.destroy({ where: { id: this.id } });
    }

    async getData() {
        let player = await DB.tables.players.findOne({
            attributes: [
                'id',
                'name',
                'race',
                'combat',
                'pilotage',
                'engineering',
                'survival',
                'recon',
                'moral'
            ],
            where: {
                id: this.id
            }
        })

        if (!player) return false;

        for (let dat in player.dataValues) {
            this[dat] = player.dataValues[dat]
        }

        return this;
    }
}

module.exports = {Player}