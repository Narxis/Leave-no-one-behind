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
