let module = require('shipModules')

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
        'construction': 100,
        'scanner_up': 0,
        'oxygen_up': 0,
        'energy_up': 0,
        'gravity_up': 0
    }

    async create(data){
        for (let dat in this.accepted_datas)
            this[dat] = data[dat] || this.accepted_datas[dat];

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

    async update(data) {
        await this.getData();

        for (let dat in this.accepted_datas)
            this[dat] = data[dat] || this[dat];

        await DB.tables.players.update({
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
            construction: this.construction,
            scanner_up: this.scanner_up,
            oxygen_up: this.oxygen_up,
            energy_up: this.energy_up,
            gravity_up: this.gravity_up
        }, {
            where: {
                id: this.id
            }
        });

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
                'construction',
                'scanner_up',
                'oxygen_up',
                'energy_up',
                'gravity_up'
            ],
            where: {
                id: this.id
            }
        })

        for (let dat in ship.dataValues) {
            this[dat] = ship.dataValues[dat]
        }

        return this;
    }

    async updateIntegrity(module, amount){
        let data = {};
        data[module] = this[module] + amount;
        if (data[module] > 100)
            data[module] = 100;
        else if (data[module] < 0)
            data[module] = 0;

        await this.update(data);
    }

    async upgradeModule(module){
        let data = {};
        data[module + '_up'] = 1;

        await this.update(data);
    }
}

module.exports = {Ship}