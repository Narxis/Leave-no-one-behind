const fs = require('fs');
const {Card} = require("../models/card");
const {error} = require("qrcode-terminal");

module.exports = {
    saveData () {},
    getData () {},
    hasData () {},
    async getFullPlaceCard(card) {

        let arr = await this.searchAll(card);
        let names = [];
        for (let i in arr) {
            if (names.includes(arr[i].name) === false)
                names.push(arr[i].name);
            else {
                delete arr[i];
            }
        }
        arr = arr.filter(v => v);
        return arr;
    },
    async searchAll(card) {
        var i, result = [];

        for (i in card.choices) {
            // Choix à jet ou à issues au hasard : on suit les cartes de toutes ses suites
            if (card.choices[i].roll || card.choices[i].outcomes) {
                let issues = this.suitesOf(card.choices[i]).flatMap(s => s.issue.roll ? [s.issue.roll.success, s.issue.roll.failure] : [s.issue]);
                for (let issue of issues) {
                    let nextCard = issue.next && await DB.tables.cards.findOne({attributes: ['id'], where: { name:issue.next }});
                    if (nextCard)
                        result = result.concat(await this.searchAll(await new Card(nextCard.id).getData()));
                }
                if (result.includes(card) === false)
                    result.push(card);
            }
            else if (card.choices[i].reveal !== '') {
                if (result.includes(card) === false) {
                    result.push(card);
                }
            } else if (card.choices[i].next !== '') {
                let nextCard = await DB.tables.cards.findOne({attributes: ['id'], where: { name:card.choices[i].next }});
                nextCard= await new Card(nextCard.id).getData();
                result = result.concat(await this.searchAll(nextCard));
                if (result.includes(card) === false) {
                    result.push(card);
                }
            }
        }

        return result;
    },
    buildCardDataSet (card) {

        let cardSet = [];
        cardSet.push(this.buildCardModule(card));
        let i = 0;
        for (let choice of card.choices) {
            cardSet.push(this.buildChoiceModule(card, i));
            this.suitesOf(choice).forEach(suite => {
                if (suite.issue.reveal !== '')
                    cardSet.push(this.buildRevealModule(card, i, suite.suffix));
            });
            i++;
        }

        return cardSet;
    },
    async buildPlaceDataSet (cardStarter) {

        if (cardStarter.type !== TYPE_PLACE) throw new Error();
        let cardsDataSet = [];
        let placeCards = await this.getFullPlaceCard(cardStarter);
        for (let card of placeCards) {
            let cardSet = this.buildCardDataSet(card); // contains card + choice/reveal
            cardsDataSet.push(...cardSet);
        }

        let outputs = [];

        for (let i=0; i < cardsDataSet.length; i++) {
            for (let key in cardsDataSet[i].outputs) {
                for (let j=0; j < cardsDataSet[i].outputs[key].connections.length; j++){
                    let output = structuredClone(cardsDataSet[i].outputs[key].connections[j]);
                    output['id'] = cardsDataSet[i].id;
                    output['index'] = key.replace('output_', '');
                    outputs.push(output);
                }
            }
        }

        cardsDataSet = cardsDataSet.map(function (set) {
            let output = outputs.find(item => item.node === set.id );
            if (output) {
                set.inputs.input_1 = {
                    "connections": [
                        {
                            "node": output.id,
                            "input": "output_" + output.index
                        }
                    ]
                }
            }
            return set;
        })

        let placeDataSet = {};
        placeDataSet[cardStarter.name] = {data: {}}

        for (let i=0; i < cardsDataSet.length; i++) {
            placeDataSet[cardStarter.name].data[cardsDataSet[i].id] = cardsDataSet[i];
        }
        return placeDataSet;
        // return (JSON.stringify(placeDataSet,null,2));
    },
    buildCardModule (dat) {

        let outputs = {};
        // Output of cards can only be a choice
        // Output are obvious, inputs will be done on second pass
        for (let i=1; i<=3; i++) {
            outputs['output_'+i] = {connections: []};
            if (dat.choices[i-1]) {
                outputs['output_' + i].connections.push({
                    "node": "choice_"+(i-1)+"_"+dat.name,
                    "output":"input_1"
                })
            }
        }

        let data = {};
        if (dat.timer === 1)
            data['timer'] = 'on';
        if (dat.shuffle === 1)
            data['shuffle'] = 'on';

        return {
            "id":dat.name,
            "name":'card',
            "data":{
                "name": dat.name,
                "desc": dat.desc,
                "shuffle": dat.shuffle ? "on" : "off",
                "timer": dat.shuffle ? "on" : "off"
            },
            "class":'card',
            "html": this.fillHTMLModule('card'),
            "typenode":false,
            "inputs":{
                "input_1":{
                    "connections":[]
                }
            },
            "outputs": outputs,
            "pos_x":742.25, // TODO get a column for display
            "pos_y":639 // TODO get a row for display
        }
    },
    // Suites d'un choix : la sienne, ou réussite (output_1) et échec (output_2) d'un jet
    suitesOf (choice) {
        // Issues au hasard : une sortie chacune (le jet d'une issue n'est pas représenté)
        if (choice.outcomes)
            return choice.outcomes.map((o, k) => ({issue: o, suffix: '_o' + k}));
        if (choice.roll)
            return [{issue: choice.roll.success, suffix: '_s'}, {issue: choice.roll.failure, suffix: '_f'}];
        return [{issue: choice, suffix: ''}];
    },
    buildChoiceModule (dat, index) {
        let outputs = {};
        // Output of choice can either be a card or a reveal
        // Output are obvious, inputs will be done on second pass
        let suites = this.suitesOf(dat.choices[index]);
        suites.forEach((suite, k) => {
            let output = outputs['output_' + (k + 1)] = {connections: []};
            // NEXT IS REVEAL
            if (suite.issue.reveal !== '') {
                output.connections.push({
                    "node": "reveal_"+index+suite.suffix+"_"+dat.name,
                    "output":"input_1"
                })
            }
            // NEXT IS CARD
            else if (suite.issue.next !== '') {
                output.connections.push({
                    "node": suite.issue.next,
                    "output":"input_1"
                })
            }
        });

        let data = {"choice": dat.choices[index].value};
        if (dat.choices[index].outcomes)
            data.random = JSON.stringify(dat.choices[index].outcomes.map(o => o.weight));
        else if (dat.choices[index].roll)
            data.roll = dat.choices[index].roll.stat || 'pilotage';

        return {
            "id":"choice_"+(index)+"_"+dat.name,
            "name":'choice',
            "data":data,
            "class":'choice',
            "html": this.fillHTMLModule('choice'),
            "typenode":false,
            "inputs":{
                "input_1":{
                    "connections":[]
                }
            },
            "outputs": outputs,
            "pos_x":742.25, // TODO get a column for display
            "pos_y":639 // TODO get a row for display
        }
    },
    buildRevealModule (dat, index, suffix = '') {
        let outputs = {};
        let suite = this.suitesOf(dat.choices[index]).find(s => s.suffix === suffix);

        return {
            "id": "reveal_"+index+suffix+"_"+dat.name,
            "name":'reveal',
            "data":{
                "reveal": suite.issue.reveal
            },
            "class":'reveal',
            "html": this.fillHTMLModule('reveal'),
            "typenode":false,
            "inputs":{
                "input_1":{
                    "connections":[]
                }
            },
            "outputs": outputs,
            "pos_x":742.25, // TODO get a column for display
            "pos_y":639 // TODO get a row for display
        }
    },
    fillHTMLModule(moduleName, dat, index=0) {

        let module = '';

        switch (moduleName) {
            case 'card':
                module = `
        <div>
            <div class="title-box"><i class="fas fa-money-check"></i> Card</div>
            <div class="box">
                <p>Name</p>
                <input type="text" df-name>
                <p>Desc</p>
                <textarea df-desc></textarea>
                <p>Timer</p>
                <input type="checkbox" df-timer>
                <p>Shuffle</p>
                <input type="checkbox" df-shuffle>
            </div>
        </div>
                `;
                break;
            case 'choice':
                module = `
                <div>
                    <div class="title-box"><i class="fas fa-sign-out-alt"></i> Choice</div>
                    <div class="box">
                        <p>choice</p>
                        <textarea df-choice></textarea>
                    </div>
                </div>
                        `;
                break;

            case 'reveal':
                module = `
                <div>
                    <div class="title-box"><i class="fas fa-sign-in-alt"></i> Reveal</div>
                    <div class="box">
                        <p>reveal</p>
                        <textarea df-reveal></textarea>
                    </div>
                </div>
                        `;
                break;

            default:
        }
        return module;
    }
};