const {literal} = require("sequelize");

class Card {
    id;
    type;
    value;
    name;
    desc;
    timer;
    shuffle;
    modules = [];
    choices = [];
    langVars = {};
    cardVars = {};
    accepted_datas = {
        'type': 0,
        'value': -1,
        'name': '',
        'desc': '',
        'timer': 0,
        'shuffle': 0,
        'modules': {},
        'choices': {}
    }

    constructor(id = 0) {
        this.id = id;
        this.langVars = structuredClone(LANG).card_vars;
        let keys = Object.keys(this.langVars);
        for (let key of keys) {
            this.cardVars[key] = {}
        }
    }

    async create(data = {}, prepareBulk = false ) {
        for (let dat in this.accepted_datas)
            this[dat] = (typeof data[dat] === 'undefined' ? this.accepted_datas[dat] : data[dat]);

        await DB.tables.cards.create({
            type: this.type,
            value: this.value,
            name: this.name,
            desc: this.replaceVars(this.desc),
            timer: this.timer,
            shuffle: this.shuffle
        }).then(async result => {
            this.id = result.id;
            for (let choice in this.choices)
            {
                await DB.tables.card_modules.create({
                    card_id: this.id,
                    type: 'choice',
                    value: this.replaceVars(this.choices[choice].value),
                    reveal: this.replaceVars(this.choices[choice].reveal),
                    next: this.choices[choice].next,
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

    /**
     * @deprecated choices might not work anymore
     * @param data
     * @returns {Promise<void>}
     */
    async update(data = {}) {
        await this.getData();

        for (let dat in this.accepted_datas)
            this[dat] = (typeof data[dat] === 'undefined' ? this[dat] : data[dat]);

        await DB.tables.cards.update({
            type: this.type,
            value: this.value,
            name: this.name,
            desc: this.desc,
            timer: this.timer,
            shuffle: this.shuffle
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
                value: choice.value,
                reveal: choice.reveal,
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

    replaceVars(text) {
        if (text) {
            const varFound = [...text.matchAll(/\[\w+\]/g)].map(e => e[0]);
            for (let variable of varFound){
                let newvar = this.getRandomVar(variable);
                text = text.replace(variable, newvar)
            }
        }
        return text;
    }

    getRandomVar(variable){

        variable = variable.replace('[','').replace(']','')
        let parsedVar = variable.split("_");
        let article = parsedVar[0] || null;
        let type = parsedVar[1] || null;
        let id = parsedVar[2] || null;
        let randomItem;

        let UcFirst = article.charAt(0) === article.charAt(0).toUpperCase();
        if (UcFirst) {
            article = article.toLowerCase();
        }

        if (!this.cardVars[type]) {
            log("Error with texte variable ["+variable+"]", "#f00");
            return variable;
        }

        if (this.cardVars[type][id] && this.cardVars[type][id] !== null){
            randomItem = this.cardVars[type][id];
        }
        else {
            let obj_keys = Object.keys(this.langVars[type]);
            randomItem = obj_keys[Math.floor(Math.random() *obj_keys.length)];
            this.cardVars[type][id] = randomItem;
            delete this.langVars[type][randomItem];
        }

        let returnVar = LANG.card_vars[type][randomItem][article];

        if (UcFirst) {
            returnVar = returnVar.charAt(0).toUpperCase() + returnVar.slice(1);
        }
        return returnVar;
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
                'timer',
                'shuffle'
            ],
            raw: true,
            where: {
                id: this.id
            }
        });

        if (!card)
            return

        for (let dat in card) {
            this[dat] = card[dat]
        }

        let raw_modules = await DB.tables.card_modules.findAll({
            attributes: [
                'type',
                'value',
                'reveal',
                'next'
            ],
            where: {
                card_id: this.id
            },
            order: [(this.shuffle ? literal('random()') : ['id', 'ASC'])]
        });

        raw_modules = raw_modules.map(m => m.dataValues);
        let choices = [];

        for (let mod of raw_modules)
        {
            let splitMod = mod.type.split('_');
            let name = splitMod[0];
            let type = splitMod[1];

            if (name === 'choice') {
                choices.push({
                    value: mod.value,
                    reveal: mod.reveal,
                    next: mod.next
                });
            }
            else {
                if (typeof this.modules[name] === 'undefined')
                    this.modules[name] = {};
                this.modules[name][type] = mod.value
            }
            this.choices = choices;
        }

        return this;
    }
}

module.exports = {Card}