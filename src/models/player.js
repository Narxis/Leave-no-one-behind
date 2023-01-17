const {Ship} = require('./ship')

class Player {
    id;
    name;
    discord_id;
    race;
    combat;
    pilotage;
    engineering;
    survival;
    recon;
    moral;
    accepted_datas = {
        'name': '',
        'discord_id': '',
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

        console.log(data);
        for (let dat in this.accepted_datas)
            this[dat] = (typeof data[dat] === 'undefined' ? this.accepted_datas[dat]: data[dat]);

        if (await this.playerExists(this.discord_id)) {
            return null;
        }
        await DB.tables.players.create({
            name: this.name,
            discord_id: this.discord_id,
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

    async playerExists(discord_id) {
        return await DB.tables.players.findOne({where: {discord_id: discord_id}});
    }

    async update(data = {}) {
        await this.getData();

        for (let dat in this.accepted_datas)
            this[dat] = (typeof data[dat] === 'undefined' ? this[dat] : data[dat]);

        await DB.tables.players.update({
            name: this.name,
            discord_id: this.discord_id,
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
                'discord_id',
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

    async roll(dice, stat, modules = false) {
        let ship = new Ship(1);
        ship = await ship.getData();

        let res;
        let moyMod = ship.scanner + ship.proximity + ship.motors + ship.shield + ship.oxygen+ ship.energy + ship.gravity + ship.landing + ship.construction;
        moyMod = moyMod/900;
        if (modules)
            res = dice * moyMod * this[stat]/100 + (this.moral-50)/2;
        else
            res = dice * this[stat]/100 + (this.moral-50)/4;
        return Math.ceil(res);
    }
}

module.exports = {Player}