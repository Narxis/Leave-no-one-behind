const {literal} = require("sequelize");
const {Statuses} = require("./statuses");
const chalk = require("chalk");

// Choice loot, saved as JSON (empty: no loot)
const parseLoot = function (raw) {
    try {
        let list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
    }
    catch (e) {
        return [];
    }
}

// Status given by a choice: {slug, duration}, or null
const parseStatus = function (raw) {
    try {
        let status = raw ? JSON.parse(raw) : null;
        return status && status.slug ? {slug: String(status.slug), duration: parseInt(status.duration) || 1} : null;
    }
    catch (e) {
        return null;
    }
}

// Choice roll ("roll" choice of baseCards.json): the GM says whether the roll
// succeeded, the follow-up depends on the result. A follow-up = a result (reveal) or a
// next card (next), with GM info, humans and loot like a choice.
const ROLL_STATS = ['combat', 'pilotage', 'engineering', 'survival', 'recon'];

const issueOf = function (raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    return {
        reveal: raw.reveal || '',
        mjreveal: raw.mjreveal || '',
        next: raw.next || '',
        humans: parseInt(raw.humans) || 0,
        loot: Array.isArray(raw.loot) ? raw.loot : []
    };
}

// {stat, success, failure}, or null without a roll (or a badly written roll)
const parseRoll = function (raw) {
    try {
        let roll = typeof raw === 'string' ? (raw ? JSON.parse(raw) : null) : raw;
        if (!roll || typeof roll !== 'object' || !roll.success || !roll.failure)
            return null;
        return {
            stat: ROLL_STATS.includes(roll.stat) ? roll.stat : '',
            success: issueOf(roll.success),
            failure: issueOf(roll.failure)
        };
    }
    catch (e) {
        return null;
    }
}

// Random outcomes of a choice ("outcomes"): list of follow-ups, each with
// a weight (1 by default) and, if needed, its own roll. The game draws one
// when the card is displayed.
const outcomeOf = function (raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    let weight = Number(raw.weight);
    let outcome = Object.assign(issueOf(raw), {weight: Number.isFinite(weight) && weight >= 0 ? weight : 1});
    let roll = parseRoll(raw.roll);
    if (roll)
        outcome.roll = roll;
    return outcome;
}

// [outcome, ...] (at least 2), or null without random outcomes
const parseOutcomes = function (raw) {
    try {
        let list = typeof raw === 'string' ? (raw ? JSON.parse(raw) : null) : raw;
        return Array.isArray(list) && list.length >= 2 ? list.map(outcomeOf) : null;
    }
    catch (e) {
        return null;
    }
}

// Index drawn according to the weights (all at 0: each has the same chance)
const drawOutcome = function (outcomes, random = Math.random) {
    let total = outcomes.reduce((sum, o) => sum + o.weight, 0);
    if (!(total > 0))
        return Math.floor(random() * outcomes.length);
    let r = random() * total;
    for (let i = 0; i < outcomes.length; i++) {
        r -= outcomes[i].weight;
        if (r < 0)
            return i;
    }
    return outcomes.length - 1;
}

// Merchant opened by a choice: {name, stock?} (stock omitted: the GM's last
// stall, see merchant.js), or null. "shop: true" opens an unnamed merchant
const parseShop = function (raw) {
    try {
        let shop = typeof raw === 'string' ? (raw ? JSON.parse(raw) : null) : raw;
        if (shop === true)
            shop = {};
        if (!shop || typeof shop !== 'object' || Array.isArray(shop))
            return null;
        let out = {name: String(shop.name || '').slice(0, 40)};
        if (Array.isArray(shop.stock))
            out.stock = shop.stock;
        return out;
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
                    shop: parseShop(this.choices[choice].shop) ? JSON.stringify(parseShop(this.choices[choice].shop)) : '',
                    roll: this.rollToStore(this.choices[choice].roll),
                    outcomes: this.outcomesToStore(this.choices[choice].outcomes),
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

    // Roll saved as JSON, text variables already drawn ('': no roll)
    rollToStore(raw) {
        let roll = parseRoll(raw);
        if (!roll)
            return '';
        for (let issue of [roll.success, roll.failure]) {
            issue.reveal = this.replaceVars(issue.reveal);
            issue.mjreveal = this.replaceVars(issue.mjreveal);
        }
        return JSON.stringify(roll);
    }

    // Random outcomes as JSON, variables drawn as for the rest of the card
    outcomesToStore(raw) {
        let outcomes = parseOutcomes(raw);
        if (!outcomes)
            return '';
        for (let outcome of outcomes) {
            outcome.reveal = this.replaceVars(outcome.reveal);
            outcome.mjreveal = this.replaceVars(outcome.mjreveal);
            if (outcome.roll)
                outcome.roll = JSON.parse(this.rollToStore(outcome.roll));
        }
        return JSON.stringify(outcomes);
    }

    replaceVars(text) {
        // Draw done only once per Card object: the same variable keeps its
        // value in desc, mjreveal, choices, reveal and variants. hydrateCardDB
        // reuses the same object for the follow-ups of a place, which therefore
        // also share the drawn values.
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
        // Short form [type_id] (e.g. [objet_1]): default article "no"
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

        // Brackets without "_" (e.g. "[rev B]"): plain text, not a variable
        if (!type && article !== 'conf')
            return "[" + variable + "]";

        if (!this.cardVars[type]) {
            log("Error with texte variable ["+variable+"]", "#f00");
            // Text left intact (brackets included): visible in game and caught by the tests
            return "[" + variable + "]";
        }

        if (this.cardVars[type][id] && this.cardVars[type][id] !== null){
            randomItem = this.cardVars[type][id];
        }
        else {
            let obj_keys = Object.keys(this.langVars[type]);
            // List exhausted (more ids than values): duplicates are accepted
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
        await DB.tables.card_modules.destroy({ where: { card_id: this.id } });
    }

    // Randomly drawn outcome: it becomes the choice's follow-up (result or card,
    // optional roll); humans, loot and GM info add to the choice's.
    // The list stays in outcomes, the drawn index in outcome (GM menu, tests)
    pickOutcome(choice, outcomes) {
        let index = drawOutcome(outcomes);
        let picked = outcomes[index];
        choice.reveal = picked.reveal;
        choice.next = picked.next;
        choice.mjreveal = [choice.mjreveal, picked.mjreveal].filter(t => t && t.trim()).join('\n');
        choice.humans = (choice.humans || 0) + picked.humans;
        choice.loot = choice.loot.concat(picked.loot);
        delete choice.roll;
        if (picked.roll)
            choice.roll = picked.roll;
        choice.outcomes = outcomes;
        choice.outcome = index;
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

        // Only whole-team statuses change the card
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
                'status',
                'shop',
                'roll',
                'outcomes'
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
                let choice = {
                    id: mod.id,
                    value: mod.value,
                    reveal: mod.reveal,
                    mjreveal: mod.mjreveal,
                    next: mod.next,
                    humans: mod.humans,
                    loot: parseLoot(mod.loot),
                    status: parseStatus(mod.status)
                };
                let shop = parseShop(mod.shop);
                if (shop)
                    choice.shop = shop;
                // Only on choices with a roll: the others stay as before
                let roll = parseRoll(mod.roll);
                if (roll)
                    choice.roll = roll;
                let outcomes = parseOutcomes(mod.outcomes);
                if (outcomes)
                    this.pickOutcome(choice, outcomes);
                choices.push(choice);
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

            // A variant only describes the text: it takes the follow-up, the
            // humans and the loot of the normal choice at the same position (creation
            // order, even if the card shuffles its choices)
            let byOrder = choices.slice().sort((a, b) => a.id - b.id);
            foundChoices.forEach((foundChoice, i) => {
                let base = byOrder[i] || {};
                alt_choices.push(Object.assign({
                    next: base.next || '',
                    humans: base.humans || 0,
                    loot: base.loot || [],
                    status: base.status || null
                }, base.shop ? {shop: base.shop} : {}, foundChoice));
            });
            if (alt_choices.length > 0)
                this.choices = alt_choices;
        }
        for (let choice of this.choices)
            delete choice.id;

        return this;
    }
}

module.exports = {Card, parseShop, parseRoll, parseOutcomes, drawOutcome, ROLL_STATS}