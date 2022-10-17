const {cardModule} = require("./cardModule");
const {where} = require("sequelize");

class Card {
    id;
    type;
    value;
    name;
    desc;
    timer;
    modules = [];
    choices = [];
    accepted_datas = {
        'type': 0,
        'value': -1,
        'name': '',
        'desc': '',
        'timer': 0,
        'modules': {},
        'choices': {}
    }

    constructor(id = 0) {
        this.id = id;
        // must use this.getData() since Sequelize works with Promises
    }

    async create(data) {
        for (let dat in this.accepted_datas)
            this[dat] = data[dat] || this.accepted_datas[dat];

        await DB.tables.cards.create({
            type: this.type,
            value: this.value,
            name: this.name,
            desc: this.desc,
            timer: this.timer
        }).then(async result => {
            this.id = result.id;
            for (let choice of this.choices)
            {
                await DB.tables.card_modules.create({
                    card_id: this.id,
                    type: 'choice',
                    value: choice.toString(),
                    cost: -1,
                });
            }
            for (let mod in this.modules)
            {
                await DB.tables.card_modules.create({
                    card_id: this.id,
                    type: mod.toString() + '_cost',
                    value: this.modules[mod].cost,
                });
                await DB.tables.card_modules.create({
                    card_id: this.id,
                    type: mod.toString() + '_val',
                    value: this.modules[mod].value,
                });
            }
        });

        return await this.getData()
    }

    async update(data) {
        await this.getData();

        for (let dat in this.accepted_datas)
            this[dat] = data[dat] || this[dat];

        await DB.tables.cards.update({
            type: this.type,
            value: this.value,
            name: this.name,
            desc: this.desc,
            timer: this.timer
        }, {
            where: {
                id: this.id
            }
        });

        for (let choice of this.choices)
        {
            await DB.tables.card_modules.update({
                card_id: this.id,
                type: 'choice',
                value: choice.toString(),
                cost: -1,
            }, {
                where: {
                    id: this.id
                }
            });
        }
        for (let mod in this.modules)
        {
            await DB.tables.card_modules.update({
                card_id: this.id,
                type: mod.toString() + '_cost',
                value: this.modules[mod].cost,
            }, {
                where: {
                    id: this.id
                }
            });
            await DB.tables.card_modules.update({
                card_id: this.id,
                type: mod.toString() + '_val',
                value: this.modules[mod].value,
            }, {
                where: {
                    id: this.id
                }
            });
        }
    }

    async delete() {
        await DB.tables.cards.destroy({ where: { id: this.id } });
        await DB.tables.card_modules.destroy({ where: { id: this.id } });
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
                if (typeof this.modules[name] === 'undefined')
                    this.modules[name] = {};
                this.modules[name][type] = mod.value
            }
        }

        return this;
    }
}

module.exports = {Card}