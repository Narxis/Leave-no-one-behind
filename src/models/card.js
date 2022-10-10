const {cardModule} = require("./cardModule");

class Card {
    id;
    type;
    value;
    name;
    desc;
    timer;
    modules = [];
    choices = [];

    constructor(id = 0) {
        this.id = id;
    }

    async test() {
        for (let i=0; i<20; i++) {
            await DB.tables.cards.create({
                type: Math.floor(Math.random()*4),
                name: 'name '+i,
                desc: 'desc '+i,
            });
            await DB.tables.card_modules.create({
                card_id: Math.floor(Math.random()*8),
                value: 'CHOICE '+i,
                cost: -1,
            });
        }
    }

    async getData() {
        let card = await DB.tables.cards.findOne({
            attributes: [
                'type',
                'value',
                'name',
                'desc',
                'timer'
            ],
            where: {
                id: this.id
            }
        });

        if (!card)
            return

        for (let dat in card.dataValues) {
            this[dat] = card.dataValues[dat]
        }

        let raw_modules = await DB.tables.card_modules.findAll({
            attributes: [
                'type',
                'value'
            ],
            where: {
                card_id: this.id
            }
        });

        raw_modules = raw_modules.map(m => m.dataValues);

        for (let mod of raw_modules)
        {
            let splitMod = mod.type.split('_');
            let name = splitMod[0];
            let type = splitMod[1];

            if (name === 'choice') {
                this.choices.push(mod.value);
            }
            else {
                console.log(name,type,mod.value)
                if (typeof this.modules[name] === 'undefined')
                    this.modules[name] = {};
                this.modules[name][type] = mod.value
            }
        }

        console.log(this);
        return this;
    }
}

module.exports = {Card}