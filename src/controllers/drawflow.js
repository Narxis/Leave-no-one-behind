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
            if (card.choices[i].reveal !== '') {
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
            if (choice.reveal !== '')
                cardSet.push(this.buildRevealModule(card, i));
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
        console.log(JSON.stringify(placeDataSet,null,2)); // expected output
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

        return {
            "id":dat.name,
            "name":'card',
            "data":{

            },
            "class":'card',
            "html": this.fillHTMLModule('card', dat),
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
    buildChoiceModule (dat, index) {
        let outputs = {};
        // Output of choice can either be a card or a reveal
        // Output are obvious, inputs will be done on second pass
        outputs['output_1'] = {connections: []};
        if (dat.choices[index]) {
            // NEXT IS REVEAL
            if (dat.choices[index].reveal !== '') {
                outputs['output_1'].connections.push({
                    "node": "reveal_"+index+"_"+dat.name,
                    "output":"input_1"
                })
            }
            // NEXT IS CARD
            else if (dat.choices[index].next !== '') {
                outputs['output_1'].connections.push({
                    "node": dat.choices[index].next,
                    "output":"input_1"
                })
            }
        }

        return {
            "id":"choice_"+(index)+"_"+dat.name,
            "name":'choice',
            "data":{

            },
            "class":'choice',
            "html": this.fillHTMLModule('choice', dat),
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
    buildRevealModule (dat, index) {
        let outputs = {};

        return {
            "id": "reveal_"+index+"_"+dat.name,
            "name":'reveal',
            "data":{

            },
            "class":'reveal',
            "html": this.fillHTMLModule('reveal', dat, index),
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
                <input type="text" df-name value="${dat.name}">
                <p>Desc</p>
                <textarea df-desc>${dat.desc}</textarea>
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
                        <input type="text" df-choice value="${dat.choices[index].value}">
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
                        <textarea df-reveal>${dat.choices[index].reveal}</textarea>
                    </div>
                </div>
                        `;
                break;

            default:
        }
        return module;
    }
};