const db = require ('./../src/controllers/db');
const type = require("./../src/config/constants");
const fs = require('fs')
const {getCardsIds, deckGenerator, hydrateCardDB} = require("../src/controllers/deck");
const {Player} = require("../src/models/player");
const {Ship} = require("../src/models/ship");
const {Config} = require("../src/models/config");
const {Card} = require("../src/models/card");
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
    await test_card_vars();
    await test_deck_generation();
    await test_place_endings();
    await test_statuses_after_planet();
    await test_roll();
    test_ship_alerts();
    await test_items_editor();
    await test_item_quantities();
    await test_merchant();
    await test_craft();
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

    // Création fermée : pas de perso, pas de race
    CONFIG.gameState = 'gameLive';
    assert.ok((await act('join')).refused);
    CONFIG.gameState = 'creation';

    // Pas de perso : rejoindre le crée avec le pseudo du lobby
    assert.equal(await remote.characterOf(alice.id), null);
    assert.deepEqual(await act('join', {uid: 'quelqu-un-d-autre', nick: 'Bob'}), {action: 'join', uid: alice.id, nick: 'Alice'});
    await new Player().create({discord_id: alice.id, name: 'Alice'});
    assert.equal((await remote.characterOf(alice.id)).name, 'Alice');
    assert.ok((await act('join')).refused);

    // Le lancer est fait au nom du joueur, même s'il en désigne un autre
    assert.ok((await act('roll', {stat: 'combat'})).refused); // pas pendant la création
    CONFIG.gameState = 'gameLive';
    assert.deepEqual(await act('roll', {discord_id: 'autre', stat: 'combat', module: 'motors'}),
        {action: 'roll', data: {discord_id: alice.id, stat: 'combat', module: 'motors'}});
    assert.ok((await act('roll', {stat: 'moral'})).refused);

    // Actions du MJ refusées
    for (let action of ['playerStat', 'setModule', 'status', 'combat-hp', 'lobby-kick', 'passThrough', 'item', 'ally-add'])
        assert.equal((await act(action, {})).refused, 'Action réservée au MJ.');

    assert.ok((await act('set-race', {race: Object.keys(races.getStats())[0]})).refused); // création fermée
    CONFIG.gameState = 'creation';
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

    // Tirage des stats par le serveur, dé par dé
    await new Player().update({race: race}, alice.id);
    let mods = races.getStats()[race];
    let total = ['combat', 'pilotage', 'engineering', 'survival', 'recon'].reduce((n, s) => n + Math.abs(parseInt(mods[s]) || 0) + 1, 0);
    assert.ok((await act('roll-stat', {stat: 'moral'})).refused);
    let last;
    for (let i = 0; i < total; i++) {
        let stat = ['combat', 'pilotage', 'engineering', 'survival', 'recon'].find(s => {
            let st = require('../src/controllers/statRolls').state({discord_id: alice.id, race: race, combat: 0});
            let row = st.stats.find(r => r.stat === s);
            return row.dice.length < row.total;
        });
        last = await act('roll-stat', {stat});
        assert.equal(last.action, i < total - 1 ? 'roll-stats' : 'roll-stats-done');
    }
    let done = await new Player().getData(alice.id);
    for (let s of ['combat', 'pilotage', 'engineering', 'survival', 'recon'])
        assert.ok(done[s] >= 51 && done[s] <= 100, s + ' = ' + done[s]);
    assert.equal(done.moral, 100);
    assert.ok((await act('roll-stat', {stat: 'combat'})).refused);
    assert.ok((await act('set-race', {race})).refused); // stats déjà tirées
    console.log('Online player actions OK');

    await test_chat();
    test_stat_rolls();
    test_player_view();
    test_player_assets();
}

// Chat : salon pour tous, privé entre le MJ et un joueur, historique, anti-flood
async function test_chat() {
    console.log('Testing chat');
    const chat = require('../src/controllers/chat');
    const remote = require('../src/controllers/remote');
    let gmSeen = [];
    chat.init(m => gmSeen.push(m));
    chat.clear();
    let alice = {id: 'a1b2c3d4e5f6a7b8', name: 'Alice'};
    let bob = {id: 'b0b0b0b0b0b0b0b0', name: 'Bob'};

    // Un joueur écrit au salon, signé du nom de son perso
    assert.deepEqual(await remote.translate(alice, {kind: 'action', action: 'chat', data: {text: '  Salut   l\'équipage  '}}), {done: true, action: 'chat'});
    let last = gmSeen[gmSeen.length - 1].data.message;
    assert.equal(last.to, null);
    assert.equal(last.from.name, 'Alice'); // perso créé plus haut
    assert.equal(last.text, 'Salut   l\'équipage');

    // Privé : seuls le MJ et ce joueur le voient
    chat.fromPlayer(bob, 'Bob', {text: 'psst', private: true});
    chat.fromGm({text: 'réponse secrète', to: bob.id});
    chat.fromGm({text: 'à tous'});
    assert.deepEqual(chat.historyFor(alice.id).map(m => m.text), ['Salut   l\'équipage', 'à tous']);
    assert.deepEqual(chat.historyFor(bob.id).map(m => m.text), ['Salut   l\'équipage', 'psst', 'réponse secrète', 'à tous']);
    assert.equal(chat.handle({action: 'chat-history'}).data.messages.length, 4);
    assert.ok(chat.historyFor(bob.id)[2].from.gm);

    // Message vide refusé, texte limité, anti-flood
    assert.ok((await remote.translate(alice, {kind: 'action', action: 'chat', data: {text: '   '}})).refused);
    chat.fromGm({text: 'x'.repeat(2000)});
    assert.equal(chat.handle({action: 'chat-history'}).data.messages.pop().text.length, chat.MAX_TEXT);
    let refused = 0;
    for (let i = 0; i < 10; i++)
        if (chat.fromPlayer(bob, 'Bob', {text: 'spam ' + i}).error)
            refused++;
    assert.ok(refused >= 4, 'anti-flood');

    // Nouvelle partie : historique vidé
    chat.clear();
    assert.equal(chat.historyFor(bob.id).length, 0);
    console.log('Chat OK');
}

// Règles du tirage : dés = |bonus| + 1, meilleur dé avec un bonus, pire avec un malus
function test_stat_rolls() {
    console.log('Testing stat rolls');
    const statRolls = require('../src/controllers/statRolls');
    const races = require('../src/controllers/races');
    let stats = races.getStats();
    let race = Object.keys(stats).find(r => ['combat', 'pilotage', 'engineering', 'survival', 'recon'].some(s => parseInt(stats[r][s]) > 0)
        && ['combat', 'pilotage', 'engineering', 'survival', 'recon'].some(s => parseInt(stats[r][s]) < 0));
    assert.ok(race, 'une race avec bonus et malus');
    let player = {discord_id: 'rolls-test-0001', race: race, combat: 0, pilotage: 0, engineering: 0, survival: 0, recon: 0};
    let values = [10, 40, 25, 5, 50, 30, 20, 45, 15, 35, 12, 33, 44];
    let k = 0;
    let random = () => (values[k++ % values.length] - 1) / 50;
    let result;
    for (let s of statRolls.STATS)
        for (let i = 0; i <= Math.abs(parseInt(stats[race][s]) || 0); i++)
            result = statRolls.roll(player, s, random);
    assert.ok(result.stats);
    for (let s of statRolls.STATS) {
        let mod = parseInt(stats[race][s]) || 0;
        let dice = result.dice[s];
        assert.equal(dice.length, Math.abs(mod) + 1);
        let keep = mod > 0 ? Math.max(...dice) : mod < 0 ? Math.min(...dice) : dice[0];
        assert.equal(result.stats[s], keep + 50);
    }
    assert.equal(result.stats.moral, 100);
    console.log('Stat rolls OK');
}

// Ce que les joueurs voient d'une carte : ni révélations, ni suites, ni butin
function test_player_view() {
    console.log('Testing player view');
    const playerView = require('../src/controllers/playerView');
    let card = {id: 4, type: TYPE_NEGATIVE, name: 'secret-name', desc: 'Une alarme{....} retentit', mjreveal: 'piège', timer: 1,
        choices: [{value: 'Fuir', reveal: 'ils meurent', mjreveal: 'x', next: 'suite', loot: ['medkit']}, {value: 'Combattre'}]};
    let seen = playerView.publicCard(card);
    assert.deepEqual(seen, {id: 4, kind: 'event', desc: 'Une alarme… retentit', timer: true, choices: ['Fuir', 'Combattre']});
    let planet = playerView.publicCard({id: 9, type: TYPE_PLANET, name: 'archetype', desc: '', modules: {oxy: {val: 80, cost: 2}}});
    assert.deepEqual(planet, {id: 9, kind: 'planet', desc: '', choices: []});
    assert.equal(playerView.publicCard(null), null);
    console.log('Player view OK');
}

// Fichiers générés de la page joueur : à jour avec leurs sources
function test_player_assets() {
    console.log('Testing player assets');
    const assets = require('../scripts/player-assets');
    const path = require('path');
    for (let [file, content] of Object.entries(assets.files())) {
        let current = fs.readFileSync(path.join(assets.ROOT, file), 'utf8').replace(/\r\n/g, '\n');
        assert.equal(current, content.replace(/\r\n/g, '\n'), file + ' n\'est pas à jour : lance node scripts/player-assets.js');
    }
    console.log('Player assets OK');
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

// Variables aléatoires des cartes ([article_type_id])
async function test_card_vars() {
    console.log('Testing card variables');

    // Aucune variable [..] ne doit rester dans les textes enregistrés
    let texts = [];
    for (let c of await DB.tables.cards.findAll({raw: true}))
        texts.push(c.desc, c.mjreveal);
    for (let m of await DB.tables.card_modules.findAll({where: {type: 'choice'}, raw: true}))
        texts.push(m.value, m.reveal, m.mjreveal);
    for (let a of await DB.tables.cards_alt.findAll({raw: true}))
        texts.push(a.value, a.reveal, a.mjreveal);
    for (let text of texts) {
        // Une variable a la forme [article_type_id] ou [type_id], sans espace (« [rev B] » est du texte)
        assert(!/\[[^\]\s]+_[^\]\s]+\]/.test(text || ''), 'Variable non remplacée : ' + text);
        assert(!(text || '').includes('undefined'), 'Variable vide : ' + text);
    }
    console.log('OK');

    // Même variable = même valeur dans tous les textes d'une carte (et de ses suites)
    let card = new Card();
    let first = card.replaceVars('[le_race_1]|[No_objet_1]|[no_boisson_1]|[no_bouteille_1]');
    let second = card.replaceVars('[le_race_1]|[objet_1]|[no_boisson_1]|[no_bouteille_1]');
    assert.strictEqual(first, second);
    assert.notStrictEqual(card.replaceVars('[no_race_1]'), card.replaceVars('[no_race_2]'));
    console.log('OK');

    // Lieu « bibli » : l'objet remis dans bibli2-1 fait partie des réponses de bibli2
    let bibli2 = await DB.tables.cards.findOne({where: {name: 'bibli2'}, raw: true});
    let answers = (await DB.tables.card_modules.findAll({where: {card_id: bibli2.id, type: 'choice'}, raw: true})).map(m => m.value);
    let given = (await DB.tables.cards.findOne({where: {name: 'bibli2-1'}, raw: true})).desc;
    let objet = Object.values(LANG.card_vars.objet).find(o => given.endsWith('vous remet ' + o.le));
    assert(objet && answers.includes(objet.no));
    console.log('Card variables OK');
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

// Lieux : chaque choix a une seule suite, un résultat (fin du lieu, suivie
// d'un seul « Continuer votre chemin ») ou une carte du lieu qui existe
async function test_place_endings(){
    console.log('Testing place choices');
    let rows = await DB.tables.cards.findAll({where: {type: [TYPE_PLACE, TYPE_FOLLOWUP]}, raw: true});
    let names = rows.map(r => r.name).filter(n => n);
    assert(rows.length > 0);
    for (let row of rows) {
        let card = await new Card(row.id).getData();
        assert(card.choices.length > 0, 'Carte de lieu sans choix : ' + row.name);
        for (let choice of card.choices) {
            let hasReveal = !!(choice.reveal && choice.reveal.trim());
            let hasNext = !!choice.next;
            assert(hasReveal !== hasNext, 'Choix sans suite unique : ' + row.name + ' / ' + choice.value);
            if (hasNext)
                assert(names.includes(choice.next), 'Suite inconnue : ' + choice.next);
        }
    }
    console.log('OK');
}

// Statuts hors combat au retour d'une planète, selon l'option du MJ
async function test_statuses_after_planet() {
    console.log('Testing statuses after planet');
    const api = require('../src/controllers/api');
    const gameSettings = require('../src/controllers/gameSettings');
    const {Statuses} = require('../src/models/statuses');
    const get = gameSettings.get;
    const statuses = new Statuses();
    await statuses.hydrateDB();
    const blackout = async () => (await DB.tables.statuses.findOne({where: {slug: 'blackout'}, raw: true})).duration;
    const res = {json() {}};

    // Joue le paquet jusqu'à la n-ième planète comprise (visitée)
    const visitPlanet = async (n) => {
        let deck = await DB.tables.deck.findAll({where: {deck_id: 0}, order: [['id', 'ASC']], raw: true});
        let seen = 0;
        for (let elt of deck) {
            await DB.tables.deck.update({played: 1}, {where: {id: elt.id}});
            let card = await DB.tables.cards.findOne({where: {id: elt.card_id}, raw: true});
            if (card.type === TYPE_PLANET && ++seen === n)
                return;
        }
        throw new Error('pas assez de planètes dans le paquet');
    };

    try {
        console.log('Option active (par défaut) : statuts remis à 0 après la planète');
        assert.strictEqual(get().clearStatusesAfterPlanet, true);
        await statuses.updateStatus('blackout', 3);
        await visitPlanet(1);
        await api.popNextCard({}, res);
        assert.strictEqual(await blackout(), 0);
        console.log('OK');

        console.log('Hors planète : -1 par carte');
        await statuses.updateStatus('blackout', 3);
        await api.popNextCard({}, res);
        assert.strictEqual(await blackout(), 2);
        console.log('OK');

        console.log('Option désactivée : statut gardé, -1 comme une carte');
        gameSettings.get = () => Object.assign(get(), {clearStatusesAfterPlanet: false});
        await statuses.updateStatus('blackout', 3);
        await visitPlanet(2);
        await api.popNextCard({}, res);
        assert.strictEqual(await blackout(), 2);
        console.log('OK');
    }
    finally {
        gameSettings.get = get;
        await DB.tables.deck.update({played: 0}, {where: {deck_id: 0}});
        await statuses.hydrateDB();
    }
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

    // Jet lancé par le MJ : chaque stat et module proposés dans le menu MJ
    // doivent donner un résultat chiffré (pas de NaN, qui arriverait en null)
    console.log('Testing MJ roll choices');
    let view = fs.readFileSync(__dirname + '/../public/views/mj-menu.ejs', 'utf8');
    const options = (id) => [...view.split('id="' + id + '"')[1].split('</select>')[0].matchAll(/value="([^"]*)"/g)].map(m => m[1]);
    let stats = options('mj-player-roll-stat');
    let modules = options('mj-player-roll-module');
    assert.deepStrictEqual(stats, ['combat', 'pilotage', 'engineering', 'survival', 'recon']);
    assert(modules.includes('') && modules.length === 7);
    for (let stat of stats)
        for (let module of modules)
            assert(Number.isFinite(await player.roll(50, stat, module)), stat + ' / ' + module);
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

// Quantités d'objets : butin en plusieurs exemplaires, déplacement d'une
// pile ou d'un exemplaire, objets de départ en plusieurs exemplaires
async function test_item_quantities() {
    console.log('Testing item quantities');
    const loot = require('../src/controllers/loot');
    const combat = require('../src/controllers/combat');
    const cardLoot = require('../src/controllers/cardLoot');
    const inventory = require('../src/controllers/inventory');
    const itemsEditor = require('../src/controllers/itemsEditor');
    const {Items} = require('../src/models/items');

    assert.deepStrictEqual(loot.entry('  Corde '), {name: 'Corde', qty: 1});
    assert.deepStrictEqual(loot.entry({name: 'Munition', qty: '12'}), {name: 'Munition', qty: 12});
    assert.strictEqual(loot.entry({name: 'Munition', qty: 5000}).qty, loot.MAX_QTY, 'quantité bornée');
    assert.strictEqual(loot.entry({name: 'Munition', qty: -3}).qty, 1);
    assert.strictEqual(loot.entry({name: '  '}), null);
    assert.strictEqual(loot.stored({name: 'Corde', qty: 1}), 'Corde', 'un seul exemplaire : le nom seul, comme avant');
    assert.deepStrictEqual(loot.stored({name: 'Corde', qty: 3}), {name: 'Corde', qty: 3});

    let made = combat.makeLoot(['Corde', {name: 'Bidule test', qty: 4}, '']);
    assert.strictEqual(made.length, 2);
    assert.strictEqual(made[0].qty, 1);
    assert.strictEqual(made[1].qty, 4);
    assert.ok(made[1].custom);
    const npcs = require('../src/controllers/npcs');
    assert.deepStrictEqual(npcs.cleanEnemy({name: 'Pirate', loot: ['Corde', {name: 'Bidule', qty: '3'}]}).enemy.loot, ['Corde', {name: 'Bidule', qty: 3}]);

    // Butin d'une carte : toute la pile part d'un coup
    const A = 'qty-joueur-a', B = 'qty-joueur-b';
    await new Player().create({discord_id: A, name: 'Qa', race: 'aku'});
    await new Player().create({discord_id: B, name: 'Qb', race: 'yorc'});
    const count = async (id) => ((await inventory.getInventory(id)).find(i => i.name === 'Bidule test') || {count: 0}).count;
    const ship = async () => ((await inventory.getShip()).find(i => i.name === 'Bidule test') || {count: 0}).count;
    cardLoot.offer([{name: 'Bidule test', qty: 5}]);
    let moved = await inventory.move({from: {type: 'card-loot', index: 0}, to: {type: 'player', id: A}, name: 'Bidule test'});
    assert.strictEqual(moved.item.count, 5);
    assert.strictEqual(await count(A), 5);
    assert.strictEqual(cardLoot.getState().items.length, 0);

    // Depuis un inventaire : un exemplaire, plusieurs (count), ou tous (all)
    let slug = moved.item.slug;
    await inventory.move({slug: slug, from: {type: 'player', id: A}, to: {type: 'ship'}});
    assert.strictEqual(await count(A), 4);
    assert.strictEqual(await ship(), 1);
    await inventory.move({slug: slug, from: {type: 'player', id: A}, to: {type: 'player', id: B}, count: 2});
    assert.strictEqual(await count(A), 2);
    assert.strictEqual(await count(B), 2);
    await inventory.move({slug: slug, from: {type: 'player', id: A}, to: {type: 'ship'}, all: true});
    assert.strictEqual(await count(A), 0);
    assert.strictEqual(await ship(), 3);
    moved = await inventory.move({slug: slug, from: {type: 'ship'}, to: {type: 'player', id: A}, count: 10});
    assert.strictEqual(moved.item.count, 3, 'on ne prend pas plus que la pile');
    assert.strictEqual(await ship(), 0);
    assert.ok((await inventory.move({slug: slug, from: {type: 'ship'}, to: {type: 'player', id: A}})).error);

    // « Tout récupérer » : les quantités vont dans le vaisseau
    cardLoot.offer([{name: 'Bidule test', qty: 7}, 'Bidule test']);
    await inventory.handle({action: 'card-loot-all'});
    assert.strictEqual(await ship(), 8);
    // Le vaisseau ne descend pas sous zéro
    await new Items().remove(slug, 50);
    assert.strictEqual(await ship(), 8);

    // Objet de départ en plusieurs exemplaires, sans doublon si on recommence
    const file = __dirname + '/../src/config/items.json';
    const backup = fs.readFileSync(file);
    try {
        let out = await itemsEditor.save({name: 'Ration test', pool: 'starter', race: 'aku', qty: 3});
        assert.strictEqual(out.item.qty, 3);
        assert.strictEqual(JSON.parse(fs.readFileSync(file)).starter.find(i => i.slug === 'ration-test').qty, 3);
        assert.strictEqual(combat.getLootList().find(i => i.slug === 'ration-test').qty, 3);
        out = await itemsEditor.save({name: 'Ration seule test', pool: 'electronique', qty: 1});
        assert.strictEqual(JSON.parse(fs.readFileSync(file)).electronique.find(i => i.slug === 'ration-seule-test').qty, undefined, 'qty 1 non écrite');
        await new Items().giveAllStarters();
        await new Items().giveAllStarters();
        let ration = (await inventory.getInventory(A)).find(i => i.slug === 'ration-test');
        assert.strictEqual(ration.count, 3);
        assert.ok(!(await inventory.getInventory(B)).some(i => i.slug === 'ration-test'), 'pas pour une autre race');
        await itemsEditor.remove('ration-seule-test');
    }
    finally {
        fs.writeFileSync(file, backup);
        await DB.tables.items.destroy({where: {slug: ['ration-test', 'ration-seule-test', slug]}});
        await DB.tables.players.destroy({where: {discord_id: [A, B]}});
    }
    console.log('Item quantities OK');
}

// Monnaie et marchand : bourses, butin en monnaie, achats et ventes
async function test_merchant() {
    console.log('Testing money and merchant');
    const money = require('../src/controllers/money');
    const merchant = require('../src/controllers/merchant');
    const inventory = require('../src/controllers/inventory');
    const combat = require('../src/controllers/combat');
    const cardLoot = require('../src/controllers/cardLoot');
    const itemsEditor = require('../src/controllers/itemsEditor');
    const cfg = money.config();
    const file = __dirname + '/../src/config/items.json';
    const backup = fs.readFileSync(file);
    const A = 'shop-joueur-a', B = 'shop-joueur-b';
    try {
        // Configuration et libellés
        assert.ok(cfg.name && cfg.plural && cfg.cryopodsPerCredit > 0);
        assert.strictEqual(money.label(1), '1 ' + cfg.name);
        assert.strictEqual(money.label(0), '0 ' + cfg.name);
        assert.strictEqual(money.label(30), '30 ' + cfg.plural);
        assert.ok(money.isMoney(cfg.plural.toUpperCase()));
        assert.ok(money.isMoney('monnaie'));
        assert.ok(!money.isMoney('Drone'));
        assert.strictEqual(money.cryopodPrice(20, {cryopodsPerCredit: 5}), 100);
        assert.strictEqual(money.sellPrice(15, {sellRatio: 0.5}), 7);

        await new Player().create({discord_id: A, name: 'Sa', race: 'aku'});
        await new Player().create({discord_id: B, name: 'Sb', race: 'yorc'});
        await DB.tables.ship.update({cryopods: 1000}, {where: {}});
        await money.reset();
        assert.strictEqual(await money.balance({type: 'player', id: A}), Math.round(cfg.startPlayer));
        assert.strictEqual(await money.balance({type: 'ship'}), Math.round(cfg.startShip));
        await DB.tables.players.update({credits: 0}, {where: {discord_id: [A, B]}});
        await DB.tables.ship.update({credits: 0}, {where: {}});

        // Bourses : jamais sous zéro, virements
        assert.strictEqual((await money.add({type: 'player', id: A}, 50)).balance, 50);
        assert.ok((await money.add({type: 'player', id: A}, -80)).error, 'pas de solde négatif');
        assert.strictEqual(await money.balance({type: 'player', id: A}), 50);
        assert.ok((await money.add({type: 'player', id: 'personne'}, 5)).error);
        assert.ok((await money.transfer({type: 'player', id: A}, {type: 'ship'}, 20)).ok);
        assert.strictEqual(await money.balance({type: 'ship'}), 20);
        assert.ok((await money.transfer({type: 'player', id: A}, {type: 'ship'}, 500)).error);

        // Butin en monnaie : dans la bourse, pas dans le coffre
        let made = combat.makeLoot([{name: cfg.plural, qty: 25}, 'monnaie']);
        assert.ok(made[0].money && made[0].qty === 25 && made[1].money && made[1].qty === 1);
        assert.ok(combat.getLootList()[0].money, 'la monnaie est proposée en tête du butin');
        cardLoot.offer([{name: 'monnaie', qty: 30}, {name: cfg.plural, qty: 5}]);
        let moved = await inventory.move({from: {type: 'card-loot', index: 0}, to: {type: 'player', id: B}});
        assert.ok(moved.item.money);
        assert.strictEqual(await money.balance({type: 'player', id: B}), 30);
        assert.ok(!(await inventory.getInventory(B)).some(i => i.slug === money.SLUG), 'pas d\'objet « monnaie »');
        await inventory.handle({action: 'card-loot-all'});
        assert.strictEqual(await money.balance({type: 'ship'}), 25, 'Tout récupérer : dans la caisse de bord');
        let msg = (await inventory.payload(null))[0];
        assert.strictEqual(msg.data.wallets.players[B], 30);
        assert.strictEqual(msg.data.wallets.ship, 25);

        // Prix dans l'éditeur d'objets
        let out = await itemsEditor.save({name: 'Pile test', pool: 'electronique', price: 12});
        assert.strictEqual(out.item.price, 12);
        assert.strictEqual(JSON.parse(fs.readFileSync(file)).electronique.find(i => i.slug === 'pile-test').price, 12);
        out = await itemsEditor.save({slug: 'pile-test', name: 'Pile test', pool: 'electronique', price: -4});
        assert.strictEqual(out.item.price, 0);
        assert.strictEqual(JSON.parse(fs.readFileSync(file)).electronique.find(i => i.slug === 'pile-test').price, undefined, 'pas de prix : rien d\'écrit');
        await itemsEditor.save({slug: 'pile-test', name: 'Pile test', pool: 'electronique', price: 12});

        // Étal : prix par défaut de l'éditeur, monnaie refusée, stock
        let stock = merchant.cleanStock([{slug: 'pile-test', qty: 2}, {name: 'Babiole maison', price: 3}, {name: cfg.plural}, {name: ''}]);
        assert.strictEqual(stock.length, 2);
        assert.strictEqual(stock[0].price, 12);
        assert.strictEqual(stock[0].qty, 2);
        assert.strictEqual(stock[1].qty, null, 'sans stock : sans limite');
        assert.ok((await merchant.buy({index: 0, buyer: {type: 'player', id: A}})).error, 'boutique fermée');
        merchant.open({name: '  Walt  DiFnek ', stock: [{slug: 'pile-test', qty: 2}, {name: 'Babiole maison', price: 3}]});
        assert.strictEqual(merchant.getState().name, 'Walt DiFnek');

        // Achat en monnaie par un joueur
        let bought = await merchant.buy({index: 0, slug: 'pile-test', buyer: {type: 'player', id: A}, pay: 'credits'});
        assert.ok(!bought.error, bought.error);
        assert.strictEqual(await money.balance({type: 'player', id: A}), 30 - 12);
        assert.strictEqual((await inventory.getInventory(A)).find(i => i.slug === 'pile-test').count, 1);
        assert.strictEqual(merchant.getState().stock[0].qty, 1);
        assert.ok((await merchant.buy({index: 0, buyer: {type: 'player', id: A}, pay: 'credits', count: 2})).error, 'pas plus que le stock');
        assert.ok((await merchant.buy({index: 0, slug: 'autre', buyer: {type: 'player', id: A}})).error, 'mauvais objet');
        assert.ok((await merchant.buy({index: 0, buyer: {type: 'player', id: 'personne'}})).error);
        // Pas assez d'argent : rien ne change
        await money.add({type: 'player', id: A}, -18);
        assert.ok((await merchant.buy({index: 0, buyer: {type: 'player', id: A}, pay: 'credits'})).error);
        assert.strictEqual(merchant.getState().stock[0].qty, 1);
        assert.strictEqual((await inventory.getInventory(A)).find(i => i.slug === 'pile-test').count, 1);

        // Achat en cryopods, pour le vaisseau
        bought = await merchant.buy({index: 0, buyer: {type: 'ship'}, pay: 'cryopods'});
        assert.strictEqual(bought.event.paid, money.cryopodPrice(12));
        assert.strictEqual(await money.cryopods(), 1000 - money.cryopodPrice(12));
        assert.strictEqual(bought.event.cryopods, 1000 - money.cryopodPrice(12));
        assert.strictEqual(merchant.getState().stock[0].qty, 0);
        assert.ok((await merchant.buy({index: 0, buyer: {type: 'ship'}, pay: 'cryopods'})).error, 'épuisé');
        assert.strictEqual((await inventory.getShip()).find(i => i.slug === 'pile-test').count, 1);
        // Objet saisi à la main : créé à l'achat
        await money.add({type: 'player', id: B}, 0);
        bought = await merchant.buy({index: 1, buyer: {type: 'player', id: B}, pay: 'credits', count: 2});
        assert.ok(!bought.error, bought.error);
        assert.strictEqual(await money.balance({type: 'player', id: B}), 30 - 6);
        assert.strictEqual((await inventory.getInventory(B)).find(i => i.name === 'Babiole maison').count, 2);
        await DB.tables.ship.update({cryopods: 5}, {where: {}});
        assert.ok((await merchant.buy({index: 1, buyer: {type: 'ship'}, pay: 'cryopods'})).error, 'pas assez de cryopods');
        assert.strictEqual(await money.cryopods(), 5);

        // Vente : la part du prix de l'éditeur, ou le prix du MJ ; le stock remonte
        let sold = await merchant.sell({slug: 'pile-test', seller: {type: 'player', id: A}});
        assert.ok(!sold.error, sold.error);
        assert.strictEqual(sold.event.paid, money.sellPrice(12));
        assert.strictEqual(await money.balance({type: 'player', id: A}), money.sellPrice(12));
        assert.ok(!(await inventory.getInventory(A)).some(i => i.slug === 'pile-test'));
        assert.strictEqual(merchant.getState().stock[0].qty, 1);
        assert.ok((await merchant.sell({slug: 'pile-test', seller: {type: 'player', id: A}})).error, 'plus rien à vendre');
        sold = await merchant.sell({slug: 'pile-test', seller: {type: 'ship'}, price: 9});
        assert.strictEqual(await money.balance({type: 'ship'}), 25 + 9);

        // Messages du serveur : l'étal, les bourses et les inventaires
        let msgs = await merchant.handle({action: 'money-add', data: {target: {type: 'player', id: B}, amount: '-4'}});
        assert.strictEqual(msgs[0].action, 'merchant');
        assert.strictEqual(msgs[0].data.wallets.players[B], 20);
        assert.ok(msgs.some(m => m.action === 'inventory'));
        assert.strictEqual((await merchant.handle({action: 'money-add', data: {target: {type: 'player', id: B}, amount: -500}})).action, 'merchant-error');
        msgs = await merchant.handle({action: 'money-transfer', data: {from: {type: 'player', id: B}, to: {type: 'player', id: A}, amount: 5}});
        assert.strictEqual(msgs[0].data.wallets.players[A], money.sellPrice(12) + 5);
        msgs = await merchant.handle({action: 'merchant-close'});
        assert.strictEqual(msgs[0].data.state.open, false);
        assert.ok((await merchant.sell({slug: 'pile-test', seller: {type: 'ship'}})).error, 'boutique fermée');
        merchant.reset();
        console.log('Money and merchant OK');
    }
    finally {
        fs.writeFileSync(file, backup);
        await DB.tables.items.destroy({where: {slug: ['pile-test', 'custom-babiole-maison']}});
        await DB.tables.players.destroy({where: {discord_id: [A, B]}});
        await DB.tables.ship.update({cryopods: 1000, credits: 0}, {where: {}});
    }
}

// Artisanat : recettes de l'éditeur d'objets, fabrication, dé et armurerie
async function test_craft() {
    console.log('Testing craft');
    const craft = require('../src/controllers/craft');
    const inventory = require('../src/controllers/inventory');
    const combat = require('../src/controllers/combat');
    const itemsEditor = require('../src/controllers/itemsEditor');
    const file = __dirname + '/../src/config/items.json';
    const backup = fs.readFileSync(file);
    const A = 'craft-joueur-a';
    const SLUGS = ['ferraille-test', 'colle-test', 'bouclier-test', 'custom-totem-test'];
    const count = async (slug, who) => inventory.countOf(slug, who);
    const player = {type: 'player', id: A}, ship = {type: 'ship'};
    try {
        // Recettes propres : ingrédients connus, fusionnés, jamais l'objet lui-même
        let known = {a: true, b: true, c: true};
        assert.deepStrictEqual(craft.cleanRecipe({ingredients: [{slug: 'a', qty: 2}, {slug: 'a', qty: '1'}, {slug: 'x'}, {slug: 'c'}, {slug: 'b', qty: -5}], qty: 0}, known, 'c'),
            {ingredients: [{slug: 'a', qty: 3}, {slug: 'b', qty: 1}], qty: 1});
        assert.strictEqual(craft.cleanRecipe({ingredients: [{slug: 'x'}]}, known, 'c'), null);
        assert.strictEqual(craft.cleanRecipe(null, known, 'c'), null);
        assert.strictEqual(craft.cleanRecipe({ingredients: 'a'}, known, 'c'), null);

        // Recette saisie dans l'éditeur d'objets
        await itemsEditor.save({name: 'Ferraille test', pool: 'atelier_test'});
        await itemsEditor.save({name: 'Colle test', pool: 'atelier_test'});
        let out = await itemsEditor.save({name: 'Bouclier test', pool: 'atelier_test',
            recipe: {ingredients: [{slug: 'ferraille-test', qty: 2}, {slug: 'colle-test', qty: 1}, {slug: 'inconnu'}, {slug: 'bouclier-test'}], qty: 2}});
        assert.deepStrictEqual(out.item.recipe, {ingredients: [{slug: 'ferraille-test', qty: 2}, {slug: 'colle-test', qty: 1}], qty: 2});
        assert.deepStrictEqual(JSON.parse(fs.readFileSync(file)).atelier_test.find(i => i.slug === 'bouclier-test').recipe, out.item.recipe);
        out = await itemsEditor.save({slug: 'colle-test', name: 'Colle test', pool: 'atelier_test', recipe: {ingredients: []}});
        assert.strictEqual(out.item.recipe, null);
        assert.strictEqual(JSON.parse(fs.readFileSync(file)).atelier_test.find(i => i.slug === 'colle-test').recipe, undefined, 'sans ingrédient : pas de recette écrite');
        let recipe = craft.recipes().find(r => r.slug === 'bouclier-test');
        assert.strictEqual(recipe.ingredients[0].name, 'Ferraille test');
        assert.strictEqual(recipe.qty, 2);

        // Armurerie et chance de réussite
        const cfg = craft.config();
        assert.strictEqual(craft.chance(0, {baseChance: 70, armoryBonus: 10}), 70);
        assert.strictEqual(craft.chance(5, {baseChance: 70, armoryBonus: 10}), 100, 'jamais plus de 100 %');
        assert.strictEqual((await craft.setArmory(99)).level, cfg.armoryMax);
        assert.strictEqual(await craft.armory(), cfg.armoryMax);
        assert.strictEqual((await craft.setArmory(-2)).level, 0);
        let msg = (await craft.handle({action: 'craft-armory', data: {level: 1}}))[0];
        assert.strictEqual(msg.action, 'craft');
        assert.strictEqual(msg.data.armory, 1);
        assert.strictEqual(msg.data.chance, craft.chance(1, cfg));

        // Fabrication : il faut tous les ingrédients chez l'artisan
        await new Player().create({discord_id: A, name: 'Ca', race: 'aku'});
        let ferraille = await inventory.ensureItem({slug: 'ferraille-test'});
        let colle = await inventory.ensureItem({slug: 'colle-test'});
        await inventory.giveTo(ferraille, player, 3);
        assert.ok((await craft.make({crafter: player, slug: 'bouclier-test'})).error.includes('Colle test'), 'il manque la colle');
        assert.ok((await craft.make({crafter: {type: 'player', id: 'personne'}, slug: 'bouclier-test'})).error);
        assert.ok((await craft.make({crafter: player, slug: 'ferraille-test'})).error, 'pas de recette');
        await inventory.giveTo(colle, player, 1);

        // Jamais en plein combat
        await combat.handle({action: 'combat-start', data: {enemies: [{name: 'Pirate', hp: 5}]}});
        assert.ok((await craft.make({crafter: player, slug: 'bouclier-test'})).error.includes('combat'));
        await combat.handle({action: 'combat-end'});

        let made = await craft.make({crafter: player, slug: 'bouclier-test'});
        assert.ok(!made.error, made.error);
        assert.strictEqual(made.event.type, 'craft');
        assert.strictEqual(await count('ferraille-test', player), 1);
        assert.strictEqual(await count('colle-test', player), 0);
        assert.strictEqual(await count('bouclier-test', player), 2, 'la recette donne 2 exemplaires');

        // Dé raté : les ingrédients sont perdus (config failLosesIngredients)
        await inventory.giveTo(ferraille, ship, 2);
        await inventory.giveTo(colle, ship, 1);
        await craft.setArmory(0);
        const random = Math.random;
        Math.random = () => 0.999;      // 100 : raté
        try {
            made = await craft.make({crafter: ship, slug: 'bouclier-test', roll: true});
        } finally {
            Math.random = random;
        }
        assert.strictEqual(made.event.type, 'craft-failed');
        assert.strictEqual(made.event.roll, 100);
        assert.strictEqual(made.item, null);
        assert.strictEqual(await count('bouclier-test', ship), 0);
        assert.strictEqual(await count('ferraille-test', ship), cfg.failLosesIngredients ? 0 : 2);

        // Assemblage libre : le MJ choisit les ingrédients et le résultat
        assert.ok((await craft.make({crafter: player, ingredients: [], name: 'Totem test'})).error);
        assert.ok((await craft.make({crafter: player, ingredients: [{slug: 'ferraille-test', qty: 1}]})).error, 'il faut un résultat');
        assert.ok((await craft.make({crafter: player, ingredients: [{slug: 'ferraille-test', qty: 5}], name: 'Totem test'})).error, 'pas assez de ferraille');
        let msgs = await craft.handle({action: 'craft-make', data: {crafter: player, ingredients: [{slug: 'ferraille-test', qty: 1}, {slug: 'bouclier-test', qty: 1}], name: 'Totem test', qty: 1}});
        assert.strictEqual(msgs[0].action, 'craft');
        assert.strictEqual(msgs[0].data.event.free, true);
        assert.ok(msgs.some(m => m.action === 'inventory' && m.data.event && m.data.event.item.name === 'Totem test'), 'l\'écran de jeu voit l\'objet arriver');
        assert.strictEqual(msgs[0].data.holdings.players[A]['custom-totem-test'], 1);
        assert.strictEqual(await count('ferraille-test', player), 0);
        assert.strictEqual(await count('bouclier-test', player), 1);
        assert.strictEqual((await craft.handle({action: 'craft-make', data: {crafter: player, slug: 'bouclier-test'}})).action, 'craft-error');
        assert.strictEqual(msgs[0].data.log.length, 3);
        craft.reset();
        assert.strictEqual((await craft.message()).data.log.length, 0);
        console.log('Craft OK');
    }
    finally {
        fs.writeFileSync(file, backup);
        await DB.tables.items.destroy({where: {slug: SLUGS}});
        await DB.tables.players.destroy({where: {discord_id: A}});
        await DB.tables.ship.update({armory_up: 0}, {where: {}});
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
