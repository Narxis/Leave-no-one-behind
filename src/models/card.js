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

// Statut donné par un choix : {slug, duration}, ou null
const parseStatus = function (raw) {
    try {
        let status = raw ? JSON.parse(raw) : null;
        return status && status.slug ? {slug: String(status.slug), duration: parseInt(status.duration) || 1} : null;
    }
    catch (e) {
        return null;
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
                    status: this.choices[choice].status && this.choices[choice].status.slug ? JSON.stringify(this.choices[choice].status) : '',
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
        // Tirage fait une seule fois par objet Card : la même variable garde sa
        // valeur dans desc, mjreveal, choix, reveal et variantes. hydrateCardDB
        // réutilise le même objet pour les suites d'un lieu, qui partagent donc
        // aussi les valeurs tirées.
        if (!Object.keys(this.cardVars).length) {
            this.langVars = structuredClone(LANG).card_vars;
            for (let key of Object.keys(this.langVars))
                this.cardVars[key] = {};
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
        // Forme courte [type_id] (ex. [objet_1]) : article par défaut « no »
        if (parsedVar.length === 2 && LANG.card_vars[parsedVar[0].toLowerCase()]) {
            let ucType = parsedVar[0].charAt(0) === parsedVar[0].charAt(0).toUpperCase();
            parsedVar = [ucType ? 'No' : 'no', parsedVar[0].toLowerCase(), parsedVar[1]];
        }
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
            // Texte laissé intact (crochets compris) : visible en jeu et détecté par les tests
            return "[" + variable + "]";
        }

        if (this.cardVars[type][id] && this.cardVars[type][id] !== null){
            randomItem = this.cardVars[type][id];
        }
        else {
            let obj_keys = Object.keys(this.langVars[type]);
            // Liste épuisée (plus d'ids que de valeurs) : on accepte les doublons
            if (!obj_keys.length) {
                this.langVars[type] = structuredClone(LANG.card_vars[type]);
                obj_keys = Object.keys(this.langVars[type]);
            }
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

        // Seuls les statuts de toute l'équipe changent la carte
        for (let status of statuses.filter(s => !s.player_id)) {
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
                'id',
                'type',
                'value',
                'reveal',
                'mjreveal',
                'next',
                'humans',
                'loot',
                'status'
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
                    id: mod.id,
                    value: mod.value,
                    reveal: mod.reveal,
                    mjreveal: mod.mjreveal,
                    next: mod.next,
                    humans: mod.humans,
                    loot: parseLoot(mod.loot),
                    status: parseStatus(mod.status)
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
                },
                order: [['id', 'ASC']]
            });

            // Une variante ne décrit que le texte : elle reprend la suite, les
            // humains et le butin du choix normal à la même place (ordre de
            // création, même si la carte mélange ses choix)
            let byOrder = choices.slice().sort((a, b) => a.id - b.id);
            foundChoices.forEach((foundChoice, i) => {
                let base = byOrder[i] || {};
                alt_choices.push(Object.assign({
                    next: base.next || '',
                    humans: base.humans || 0,
                    loot: base.loot || [],
                    status: base.status || null
                }, foundChoice));
            });
            if (alt_choices.length > 0)
                this.choices = alt_choices;
        }
        for (let choice of this.choices)
            delete choice.id;

        return this;
    }
}

module.exports = {Card}