class ShipModule{
    id;
    name;
    desc;
    integrity = 100;
    upgraded = false;
    repairable = false;
    upgradable = false;
    accepted_datas = {
        'name': '',
        'desc': '',
        'integrity': 100,
        'upgraded': false,
        'repairable': false,
        'upgradable': false
    }

    constructor(name) {
        this.name = name;
        switch (name){
            case name.match(/.*Scanner.*/).length > 0:
                this.repairable = true;
                this.upgradable = true;
                break;
            case name.match(/.*Proximity.*/).length > 0:
                this.repairable = true;
                break;
            case name.match(/.*Motors.*/).length > 0:
                this.repairable = true;
                break;
            case name.match(/.*Shield.*/).length > 0:
                this.repairable = true;
                break;
            // case name.match(/.*Oxygen.*/).length > 0:
            //     this.repairable = true;
            //     break;
            // case name.match(/.*Electricity.*/).length > 0:
            //     this.repairable = true;
            //     break;
            // case name.match(/.*Gravity.*/).length > 0:
            //     this.repairable = true;
            //     break;
            case name.match(/.*Landing.*/).length > 0:
                this.repairable = true;
                break;
            case name.match(/.*Construction.*/).length > 0:
                this.repairable = true;
                break;
        }
    }

    async create(data){
        for (let dat in this.accepted_datas)
            this[dat] = data[dat] || this.accepted_datas[dat];

        await DB.tables.shipModules.create({
            name: this.name,
            desc: this.desc,
            integrity: this.integrity,
            upgraded: this.upgraded,
            repairable: this.repairable,
            upgradable: this.upgradable
        }).then(async result => {
            this.id = result.id;
        })

        return await this.getData()
    }

    async update(data) {
        await this.getData();

        for (let dat in this.accepted_datas)
            this[dat] = data[dat] || this[dat];

        await DB.tables.shipModules.update({
            name: this.name,
            desc: this.desc,
            integrity: this.integrity,
            upgraded: this.upgraded,
            repairable: this.repairable,
            upgradable: this.upgradable
        }, {
            where: {
                id: this.id
            }
        });
    }

    async delete() {
        await DB.tables.shipModules.destroy({where: {id: this.id}});
    }

    async getData(){
        let shipModules = await DB.tables.players.findOne({
            attributes: [
                'name',
                'desc',
                'integrity',
                'upgraded',
                'repairable',
                'upgradable'
            ],
            where: {
                id: this.id
            }
        })
        for (let dat in shipModules.dataValues) {
            this[dat] = shipModules.dataValues[dat]
        }

        return this;
    }

    repair(amount){
        if (this.repairable)
            this.integrity += amount;
        else
            console.log("This module cannot be repaired");
        if (this.integrity > 100)
            this.integrity = 100;
    }

    upgrade(){
        if (this.upgraded)
            console.log("This module is already upgraded");
        else if (this.upgradable)
            this.upgraded = true;
            //then apply upgrade modifications
        else
            console.log("This Module cannot be upgraded");
    }
}

module.exports = {ShipModule}