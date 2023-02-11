const {Op} = require("sequelize");

class Ship{
    id;
    name;
    cryopods;
    scanner;
    proximity;
    motors;
    shield;
    oxygen;
    energy;
    gravity;
    landing;
    dbscience;
    dbhistory;
    construction;
    scanner_up;
    oxygen_up;
    energy_up;
    gravity_up;
    accepted_datas = {
        'name': '',
        'cryopods': 1000,
        'scanner': 100,
        'proximity': 100,
        'motors': 100,
        'shield': 100,
        'oxygen': 100,
        'energy': 100,
        'gravity': 100,
        'landing': 100,
        'dbscience': 100,
        'dbhistory': 100,
        'construction': 100,
        'scanner_up': 0,
        'oxygen_up': 0,
        'energy_up': 0,
        'gravity_up': 0
    }

    constructor(id = 0) {
        this.id = id;
    }
    
    async create(data = {}){
        for (let dat in this.accepted_datas)
            this[dat] = (typeof data[dat] === 'undefined' ? this.accepted_datas[dat]: data[dat]);

        await DB.tables.ship.create({
            name: this.name,
            cryopods: this.cryopods,
            scanner: this.scanner,
            proximity: this.proximity,
            motors: this.motors,
            shield: this.shield,
            oxygen: this.oxygen,
            energy: this.energy,
            gravity: this.gravity,
            landing: this.landing,
            dbscience: this.dbscience,
            dbhistory: this.dbhistory,
            construction: this.construction,
            scanner_up: this.scanner_up,
            oxygen_up: this.oxygen_up,
            energy_up: this.energy_up,
            gravity_up: this.gravity_up
        }).then(async result => {
            this.id = result.id;
        })

        return await this.getData()
    }

    async update(data = {}) {
        await this.getData();

        for (let dat in this.accepted_datas)
            this[dat] = (typeof data[dat] === 'undefined' ? this[dat] : data[dat]);

        await DB.tables.ship.update({
            name: this.name,
            cryopods: this.cryopods,
            scanner: this.scanner,
            proximity: this.proximity,
            motors: this.motors,
            shield: this.shield,
            oxygen: this.oxygen,
            energy: this.energy,
            gravity: this.gravity,
            landing: this.landing,
            dbscience: this.dbscience,
            dbhistory: this.dbhistory,
            construction: this.construction,
            scanner_up: this.scanner_up,
            oxygen_up: this.oxygen_up,
            energy_up: this.energy_up,
            gravity_up: this.gravity_up
        },
        {
            where: {
                id: {[Op.gt]:0}
            }
        }
        );

        return await this.getData();
    }

    async delete() {
        await DB.tables.ship.destroy({ where: { id: this.id } });
    }

    async getData(){
        let ship = await DB.tables.ship.findOne({
            attributes: [
                'name',
                'cryopods',
                'scanner',
                'proximity',
                'motors',
                'shield',
                'oxygen',
                'energy',
                'gravity',
                'landing',
                'dbscience',
                'dbhistory',
                'construction',
                'scanner_up',
                'oxygen_up',
                'energy_up',
                'gravity_up'
            ],
            // where: {
            //     id: this.id
            // }
        })

        if (!ship)
            return false;

        for (let dat in ship.dataValues) {
            this[dat] = ship.dataValues[dat]
        }

        return this;
    }

    async updateIntegrity(module, amount){
        let data = {};
        data[module] = parseInt(this[module]) + parseInt(amount);
        if (data[module] > 100)
            data[module] = 100;
        else if (data[module] < 0)
            data[module] = 0;

        await this.update(data);
        return this;
    }

    async land() {
        let damageableModules = [
            'scanner',
            'proximity',
            'motors',
            'oxygen',
            'energy',
            'gravity'
        ]
        let dat = {};
        for (let mod of damageableModules) {
            dat[mod] = Math.floor(this[mod] - ((100-this.landing)/4))
        }
        dat.cryopods = Math.floor(this.cryopods - (10*(100-this.cryopods)/4))

        await this.update(dat);
    }

    async upgradeModule(module){
        let data = {};
        data[module + '_up'] = 1;

        await this.update(data);
        return this;
    }
}

module.exports = {Ship}