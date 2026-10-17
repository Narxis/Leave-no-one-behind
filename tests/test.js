const db = require ('./../src/controllers/db');
const type = require("./../src/config/constants");
const fs = require('fs')
const {getCardsIds, deckGenerator, hydrateCardDB} = require("../src/controllers/deck");
const {Player} = require("../src/models/player");
const {Ship} = require("../src/models/ship");
const {Config} = require("../src/models/config");
const assert = require("assert");

process.env.DB_URL = '';
type.register();

const TEST_DB = './storage/databases/test_db.sqlite';

test().catch(e => {
    console.error(e);
    process.exit(1);
});

async function test() {
    if (fs.existsSync(TEST_DB)) {
        fs.unlinkSync(TEST_DB);
        console.log('db deleted');
    }

    await setup();
    await test_cards_setup();
    await test_deck_generation();
    await test_roll();
    test_ship_alerts();
    await test_items_editor();
    test_npcs();
    await test_remote();
}

// Joueurs en ligne : seules quelques actions passent, toujours en leur nom
async function test_remote() {
    console.log('Testing online player actions');
    const remote = require('../src/controllers/remote');
    const races = require('../src/controllers/races');
    let alice = {id: 'a1b2c3d4e5f6a7b8', name: 'Alice'};
    let act = (action, data) => remote.translate(alice, {kind: 'action', action, data});

    // Pas de perso : rejoindre le crée avec le pseudo du lobby
    assert.equal(await remote.characterOf(alice.id), null);
    assert.deepEqual(await act('join', {uid: 'quelqu-un-d-autre', nick: 'Bob'}), {action: 'join', uid: alice.id, nick: 'Alice'});
    await new Player().create({discord_id: alice.id, name: 'Alice'});
    assert.equal((await remote.characterOf(alice.id)).name, 'Alice');
    assert.ok((await act('join')).refused);

    // Le lancer est fait au nom du joueur, même s'il en désigne un autre
    assert.deepEqual(await act('roll', {discord_id: 'autre', stat: 'combat', module: 'motors'}),
        {action: 'roll', data: {discord_id: alice.id, stat: 'combat', module: 'motors'}});
    assert.ok((await act('roll', {stat: 'moral'})).refused);

    // Actions du MJ refusées
    for (let action of ['playerStat', 'setModule', 'status', 'combat-hp', 'lobby-kick', 'passThrough', 'item', 'ally-add'])
        assert.equal((await act(action, {})).refused, 'Action réservée au MJ.');

    let race = Object.keys(races.getStats())[0];
    assert.deepEqual(await act('set-race', {race, uid: 'autre'}), {action: 'set-race', uid: alice.id, race});
    assert.ok((await act('set-race', {race: '../x'})).refused);
    assert.equal((await act('set-name', {nick: '  Capitaine   Alice '})).nick, 'Capitaine Alice');
    assert.equal((await act('emote', {emoji: '🚀', type: 'url'})).type, 'glyph');
    assert.ok((await act('emote', {emoji: '<img src=x onerror=alert(1)>'})).refused);

    // Donner un objet : toujours depuis son propre inventaire, à un autre joueur
    let give = await act('inventory-move', {slug: 'medkit', from: {type: 'ship'}, to: {type: 'player', id: 'bob-0001'}});
    assert.deepEqual(give.data.from, {type: 'player', id: alice.id});
    assert.ok((await act('inventory-move', {slug: 'medkit', to: {type: 'player', id: alice.id}})).refused);
    assert.ok((await act('inventory-move', {slug: 'medkit', to: {type: 'ship'}})).refused);

    // Message qui n'est pas une action : ignoré
    assert.equal(await remote.translate(alice, {kind: 'chat'}), null);
    console.log('Online player actions OK');
}

async function setup(){
    let DB = new db.DB;
    global.DB = await DB.init(true);
    global.CONFIG = await new Config().hydrateDB();

    // Vraies cartes du jeu (baseCards.json + planètes générées)
    await hydrateCardDB(true);
    await new Ship().create();
}

// getCardsIds ne renvoie que les ids : on récupère les cartes complètes
async function getCards(type, valMinMax = [-1, 0]) {
    let ids = (await getCardsIds(type, ALL, valMinMax)).map(c => c.id);
    return await DB.tables.cards.findAll({where: {id: ids}, raw: true});
}

async function test_cards_setup(){
    let neuCardList = await getCards(TYPE_NEUTRAL);
    let negCardList = await getCards(TYPE_NEGATIVE);
    let posCardList = await getCards(TYPE_POSITIVE);

    let firstPlaSlice = await getCards(TYPE_PLANET, [1,500]);
    let secondPlaSlice = await getCards(TYPE_PLANET, [501,800]);
    let thirdPlaSlice = await getCards(TYPE_PLANET, [801,1000]);

    console.log('Testing for select in DB');

    console.log('Neutral cards');
    assert(neuCardList.length > 0);
    console.log('OK');

    console.log('Negative cards');
    assert(negCardList.length > 0);
    console.log('OK');

    console.log('Positive cards');
    assert(posCardList.length > 0);
    console.log('OK');

    console.log('Low planet cards');
    assert(firstPlaSlice.length > 0);
    console.log('OK');

    console.log('Medium planet cards');
    assert(secondPlaSlice.length > 0);
    console.log('OK');

    console.log('High planet cards');
    assert(thirdPlaSlice.length > 0);
    console.log('OK');

    console.log('Testing for select correctness');

    console.log('Neutral cards');
    for (let card of neuCardList)
        assert(card.type === TYPE_NEUTRAL && card.value === -1);
    console.log('OK');

    console.log('Negative cards');
    for (let card of negCardList)
        assert(card.type === TYPE_NEGATIVE && card.value === -1);
    console.log('OK');

    console.log('Positive cards');
    for (let card of posCardList)
        assert(card.type === TYPE_POSITIVE && card.value === -1);
    console.log('OK');

    console.log('Low planet cards');
    for (let card of firstPlaSlice)
        assert(card.type === TYPE_PLANET && card.value > 0 && card.value < 501);
    console.log('OK');

    console.log('Medium planet cards');
    for (let card of secondPlaSlice)
        assert(card.type === TYPE_PLANET && card.value > 500 && card.value < 801);
    console.log('OK');

    console.log('High planet cards');
    for (let card of thirdPlaSlice)
        assert(card.type === TYPE_PLANET && card.value > 800 && card.value < 1001);
    console.log('OK');

    console.log('Card setup DB OK')
}

// Teste le mode "Fair" avec les valeurs de baseConf.json
async function test_deck_generation(){
    let nbPla = parseInt(CONFIG.planetCount);
    let nbNeg = parseInt(CONFIG.negativeByStep);
    let nbPos = parseInt(CONFIG.positiveByStep);
    let nbNeu = parseInt(CONFIG.neutralByStep);
    let nbPlace = parseInt(CONFIG.placeByStep);

    await deckGenerator();
    let deck = await DB.tables.deck.findAll({order: [['id', 'ASC']], raw: true});

    let card_deck = [];

    for (let elt of deck)
        card_deck.push(await DB.tables.cards.findOne({where: {id: elt.card_id}, raw: true}))

    let neu_count = 0;
    let neg_count = 0;
    let pos_count = 0;
    let place_count = 0;
    let pla_count = 0;

    console.log('Testing deck generation');

    console.log('Testing all deck cards exist');
    assert(card_deck.length > 0 && card_deck.every(card => card));
    console.log('OK');

    for (let card of card_deck){
        if (card.type === TYPE_INITIAL) {
            console.log('Testing initial cards come first');
            assert(pla_count === 0 && neu_count + neg_count + pos_count + place_count === 0);
            console.log('OK');
        }
        else if (card.type === TYPE_POSITIVE)
            pos_count++;
        else if (card.type === TYPE_NEUTRAL)
            neu_count++;
        else if (card.type === TYPE_NEGATIVE)
            neg_count++;
        else if (card.type === TYPE_PLACE)
            place_count++;
        else if (card.type === TYPE_PLANET){
            console.log('Testing card distribution per slice');
            assert(neu_count === nbNeu && neg_count === nbNeg && pos_count === nbPos && place_count === nbPlace);
            console.log('OK');

            console.log('Testing planet value');
            if (pla_count < nbPla / 3)
                assert(card.value > 0 && card.value < 501);
            else if (pla_count < 2 * nbPla / 3)
                assert(card.value > 500 && card.value < 801);
            else
                assert(card.value > 800 && card.value < 1001);
            console.log('OK');
            pla_count++;
            pos_count = 0;
            neu_count = 0;
            neg_count = 0;
            place_count = 0;
        }
    }
    console.log('Testing number of planets');
    assert(pla_count === nbPla);
    console.log('OK');

    console.log('Deck generation OK')
}

async function test_roll(){
    console.log('Testing roll');

    let player = await new Player().create({combat: 100, moral: 50});

    const rollSuccess = (result) => {
        return result >= 50;
    }

    console.log('Testing without modules');
    assert(!rollSuccess(await player.roll(0, 'combat')));
    assert(rollSuccess(await player.roll(100, 'combat')));
    console.log('OK');

    console.log('Testing with modules');
    assert(!rollSuccess(await player.roll(0, 'combat', true)));
    assert(rollSuccess(await player.roll(100, 'combat', true)));
    console.log('OK');

    console.log('Roll OK');
}

module.exports = {test};

// Alertes du plan du vaisseau envoyées par le MJ
function test_ship_alerts() {
    const shipAlerts = require("../src/controllers/shipAlerts");
    shipAlerts.reset();

    let res = shipAlerts.update({blink: ['cinema', 'inconnue', 'cinema'], showMap: true});
    assert.deepStrictEqual(res.data.blink, ['cinema'], 'salles inconnues ou en double ignorées');
    assert.strictEqual(res.data.showMap, true);

    res = shipAlerts.update({alert: {room: 'pas-une-salle'}});
    assert.strictEqual(res.error, true, 'alerte refusée sur une salle inconnue');

    res = shipAlerts.update({alert: {room: 'salleO2', message: '  Fuite !  '}});
    assert.strictEqual(res.data.alert.name, 'Salle O2');
    assert.strictEqual(res.data.alert.message, 'Fuite !');
    assert.deepStrictEqual(res.data.blink, ['cinema'], 'une alerte ne touche pas aux salles qui clignotent');
    let firstId = res.data.alert.id;
    assert.ok(shipAlerts.update({alert: {room: 'cockpit'}}).data.alert.id > firstId, 'chaque alerte a un nouvel identifiant');

    res = shipAlerts.update({alert: null});
    assert.strictEqual(res.data.alert, null);
    assert.deepStrictEqual(shipAlerts.getState(), {blink: ['cinema'], showMap: true, alert: null});

    shipAlerts.reset();
    assert.deepStrictEqual(shipAlerts.getState(), {blink: [], showMap: false, alert: null});
    for (let room of shipAlerts.ROOMS)
        assert.ok(room.label && Number.isFinite(room.label.x) && Number.isFinite(room.label.y), 'nom placé sur le plan : ' + room.id);
    console.log('ship alerts OK');
}


// Éditeur d'objets : création, déplacement de catégorie, suppression. items.json est remis en l'état
async function test_items_editor() {
    console.log('Testing items editor');
    const itemsEditor = require('../src/controllers/itemsEditor');
    const file = __dirname + '/../src/config/items.json';
    const backup = fs.readFileSync(file);
    try {
        let before = (await itemsEditor.list()).items.length;
        assert.ok((await itemsEditor.save({name: ''})).error, 'un objet sans nom est refusé');
        assert.ok((await itemsEditor.save({name: 'Truc', pool: 'starter'})).error, 'un objet de départ sans race est refusé');

        let out = await itemsEditor.save({name: 'Clé à molette test', pool: 'Outils test', type: 'Relique sacrée', desc: 'Pour les tests'});
        assert.strictEqual(out.item.slug, 'cle-a-molette-test');
        assert.strictEqual(out.item.type, 'relique_sacree');
        assert.strictEqual(out.item.rarity, 'commun', 'rareté par défaut');
        out = await itemsEditor.save({slug: 'cle-a-molette-test', name: 'Clé à molette test', pool: 'Outils test', type: 'Relique sacrée', rarity: 'legendaire'});
        assert.strictEqual(out.item.rarity, 'legendaire');
        out = await itemsEditor.save({slug: 'cle-a-molette-test', name: 'Clé à molette test', pool: 'Outils test', type: 'Relique sacrée', rarity: 'divin'});
        assert.strictEqual(out.item.rarity, 'commun', 'une rareté inconnue redevient commun');
        assert.ok((await itemsEditor.list()).types.includes('relique_sacree'), 'un nouveau type rejoint la liste');
        assert.strictEqual(out.item.pool, 'outils_test');
        assert.ok((await itemsEditor.save({name: 'clé à MOLETTE test', pool: 'electronique'})).error, 'deux objets ne portent pas le même nom');
        let row = await DB.tables.items.findOne({raw: true, where: {slug: 'cle-a-molette-test'}});
        assert.strictEqual(row.name, 'Clé à molette test');

        out = await itemsEditor.save({slug: 'cle-a-molette-test', name: 'Clé à molette', pool: 'starter', race: 'aku', desc: 'Modifiée'});
        assert.strictEqual(out.item.slug, 'cle-a-molette-test', 'le slug ne change pas avec le nom');
        let list = await itemsEditor.list();
        assert.ok(!list.pools.includes('outils_test'), 'la catégorie vidée disparaît');
        row = await DB.tables.items.findOne({raw: true, where: {slug: 'cle-a-molette-test'}});
        assert.strictEqual(row.pool, 'starter');
        assert.strictEqual(row.race, 'aku');

        await itemsEditor.remove('cle-a-molette-test');
        assert.strictEqual((await itemsEditor.list()).items.length, before);
        assert.strictEqual(await DB.tables.items.count({where: {slug: 'cle-a-molette-test'}}), 0);
        console.log('OK');
    }
    finally {
        fs.writeFileSync(file, backup);
    }
}

// Fiches de l'éditeur d'ennemis et compagnons : valeurs nettoyées et bornées
function test_npcs() {
    const npcs = require("../src/controllers/npcs");

    assert.ok(npcs.cleanEnemy({name: '   '}).error, 'un ennemi sans nom est refusé');
    let {enemy} = npcs.cleanEnemy({name: '  Pirate   rouge ', hp: '5000', offense: -3, defense: 'abc', damage: 'enorme',
        loot: ['Corde', {name: 'Lance'}, '', ...Array(20).fill('Caillou')]});
    assert.strictEqual(enemy.name, 'Pirate rouge');
    assert.strictEqual(enemy.hp, 999, 'PV bornés à 999');
    assert.strictEqual(enemy.offense, 0);
    assert.strictEqual(enemy.defense, 50, 'défense par défaut');
    assert.strictEqual(enemy.damage, 'moyen', 'palier de dégâts inconnu remplacé');
    assert.strictEqual(enemy.category, 'standard', 'catégorie inconnue remplacée');
    assert.strictEqual(npcs.cleanEnemy({name: 'Roi', category: 'boss'}).enemy.category, 'boss');
    assert.strictEqual(enemy.loot.length, npcs.LOOT_SIZE, 'butin limité');
    assert.deepStrictEqual(enemy.loot.slice(0, 3), ['Corde', 'Lance', 'Caillou']);

    assert.ok(npcs.cleanCompanion({}).error, 'un compagnon sans nom est refusé');
    let {companion} = npcs.cleanCompanion({name: 'Zorg', race: 'Mécano', combat: 120, moral: '30'});
    assert.strictEqual(companion.combat, 100);
    assert.strictEqual(companion.moral, 30);
    assert.strictEqual(companion.pilotage, 50, 'stat absente : 50');
    assert.strictEqual(companion.race, 'Mécano');

    assert.strictEqual(npcs.slugify('Nek-réant  géant !'), 'nek-reant-geant');
    // Sans fichier modifié, les ennemis de départ viennent de config/bestiary.json
    assert.ok(npcs.getEnemies().length > 0);
    console.log('npcs OK');
}
