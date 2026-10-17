const {literal} = require("sequelize");
const {Statuses} = require("./statuses");
const chalk = require("chalk");

// Butin d'un choix, enregistré en JSON (vide : aucun butin)
const parseLoot = function (raw) {
    try {
        let list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
    }
    catch (e) {
        return [];
    }
}

class Card {
    id;
    type;
    value;
    name;
    desc;
    mjreveal;
    timer;
    shuffle;
    alts;
    modules = {};
    choices = {};
    langVars = {};
    cardVars = {};
    accepted_datas = {
        'type': 0,
        'value': -1,
        'name': '',
        'desc': '',
        'timer': 0,
        'shuffle': 0,
        'alts': {},
        'modules': {},
        'choices': {}
    }

    constructor(id = 0) {
        this.id = id;
    }

    async create(data = {}, prepareBulk = false ) {
        for (let dat in this.accepted_datas)
            this[dat] = (typeof data[dat] === 'undefined' ? this.accepted_datas[dat] : data[dat]);

        await DB.tables.cards.create({
            type: this.type,
            value: this.value,
            name: this.name,
            desc: this.replaceVars(this.desc),
            mjreveal: this.replaceVars(this.mjreveal),
            timer: this.timer,
            shuffle: this.shuffle
        }).then(async result => {
            this.id = result.id;
            let alt_bulk = [];
            for (let alt_status in this.alts)
            {
                let alt_desc_dat = {
                    card_id: this.id,
                    type: alt_status,
                    elem: 'desc',
                    value: this.replaceVars(this.alts[alt_status].desc),
                    reveal: ''
                };
                alt_bulk.push(alt_desc_dat);

                for (let alt_choice of this.alts[alt_status].choices){
                    let alt_choice_dat = {
                        card_id: this.id,
                        type: alt_status,
                        elem: 'choice',
                        value: this.replaceVars(alt_choice.value),
                        reveal: this.replaceVars(alt_choice.reveal),
                        mjreveal: this.replaceVars(alt_choice.mjreveal)
                    }
                    alt_bulk.push(alt_choice_dat);
                }
            }
            await DB.tables.cards_alt.bulkCreate(alt_bulk);
            for (let choice in this.choices)
            {
                await DB.tables.card_modules.create({
                    card_id: this.id,
                    type: 'choice',
                    value: this.replaceVars(this.choices[choice].value),
                    reveal: this.replaceVars(this.choices[choice].reveal),
                    mjreveal: this.replaceVars(this.choices[choice].mjreveal),
                    next: this.choices[choice].next,
                    humans: this.choices[choice].humans || 0,
                    loot: Array.isArray(this.choices[choice].loot) && this.choices[choice].loot.length ? JSON.stringify(this.choices[choice].loot) : '',
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

    replaceVars(text) {
        this.langVars = structuredClone(LANG).card_vars;
        let keys = Object.keys(this.langVars);
        for (let key of keys) {
            this.cardVars[key] = {}
        }
        if (text) {
            const varFound = [...text.matchAll(/\[[^\]]+\]/g)].map(e => e[0]);
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

        if (article === 'conf') {
            if (CONFIG[type])
                return CONFIG[type];
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

        let activeStatus = false;

        let statuses = new Statuses();
        statuses = await statuses.getAllStatuses();
        let prioStatuses = [
            'blackout',
            'anticipation',
            'wanted',
            'weak'
        ];
        let indexPrio = 9999;

        for (let status of statuses) {
            let indexFound = prioStatuses.indexOf(status.slug);
            if (indexFound < indexPrio && indexFound > -1) {
                activeStatus = status.slug;
                indexPrio = indexFound;
            }
        }

        let card = await DB.tables.cards.findOne({
            attributes: [
                'type',
                'value',
                'name',
                'desc',
                'mjreveal',
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

        if (activeStatus !== false) {
            let alt_desc = await DB.tables.cards_alt.findOne({
                attributes: [
                    'value',
                ],
                raw:true,
                where: {
                    card_id:this.id,
                    type:activeStatus,
                    elem:'desc'
                }
            });
            if (alt_desc)
                this.desc = alt_desc.value;
        }

        let raw_modules = await DB.tables.card_modules.findAll({
            attributes: [
                'type',
                'value',
                'reveal',
                'mjreveal',
                'next',
                'humans',
                'loot'
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
                    mjreveal: mod.mjreveal,
                    next: mod.next,
                    humans: mod.humans,
                    loot: parseLoot(mod.loot)
                });
            }
            else {
                if (typeof this.modules[name] === 'undefined')
                    this.modules[name] = {};
                this.modules[name][type] = mod.value
            }
        }

        this.choices = choices;

        let alt_choices = [];
        if (activeStatus !== false) {
            let foundChoices = await DB.tables.cards_alt.findAll({
                attributes: [
                    'value',
                    'reveal',
                    'mjreveal'
                ],
                raw:true,
                where: {
                    card_id:this.id,
                    type:activeStatus,
                    elem:'choice'
                }
            });

            for (let foundChoice of foundChoices) {
                alt_choices.push(foundChoice);
            }
            if (alt_choices.length > 0)
                this.choices = alt_choices;
        }

        return this;
    }
}

module.exports = {Card}