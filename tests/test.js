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
    await test_card_rolls();
    await test_card_outcomes();
    await test_statuses_after_planet();
    test_random_ship();
    await test_last_planet();
    await test_custom_statuses();
    await test_blank_card();
    await test_roll();
    await test_roles();
    test_ship_alerts();
    await test_items_editor();
    await test_item_quantities();
    await test_merchant();
    await test_craft();
    test_npcs();
    await test_combat();
    test_spelling();
    test_wiki_tables();
    test_random_companion();
    await test_remote();
}

// Orthographe des noms affichés : les identifiants (slugs) ne changent pas
function test_spelling() {
    console.log('Testing spelling');
    const races = require('../src/controllers/races');
    assert.strictEqual(races.nameOf('nek_eau'), 'Nek-Eau');
    assert.strictEqual(races.nameOf('nek_terre'), 'Nek-Terre');
    assert.strictEqual(races.nameOf('fnek'), 'Fnek');
    assert.strictEqual(LANG.card_vars.race.nek_feu.nos, 'Nek-Feux');
    const items = JSON.parse(fs.readFileSync(__dirname + '/../src/config/items.json', 'utf8'));
    const bySlug = {};
    for (let pool in items) for (let item of items[pool]) bySlug[item.slug] = item.name;
    assert.strictEqual(bySlug['pelotte'], 'Pelote de laine');
    assert.strictEqual(bySlug['nourriture-deshydrate'], 'Nourriture déshydratée');
    assert.strictEqual(bySlug['shrymp-kit'], 'Shrymp Utility Kit');
    assert.strictEqual(bySlug['meche-ygrl'], "Mèche d'Ygrl");
    assert.strictEqual(bySlug['nek-ronomicon'], "Nek'Ronomicon");
    assert.strictEqual(bySlug['spider-bomb'], 'SPIDER bomb');
    const statuses = JSON.parse(fs.readFileSync(__dirname + '/../src/config/statuses.json', 'utf8'));
    assert.strictEqual(statuses.find(s => s.slug === 'weak').name, 'Affaibli');
    console.log('OK');
}

// Tableaux du wiki : seul le texte entre les marqueurs est remplacé
function test_wiki_tables() {
    console.log('Testing wiki tables');
    const wiki = require('../scripts/wiki-tableaux');
    let page = 'Avant\n<!-- jeu:debut stats-races fnek -->\nvieux\n<!-- jeu:fin -->\nAprès\n';
    let out = wiki.render(page);
    assert.ok(out.startsWith('Avant\n<!-- jeu:debut stats-races fnek -->\n'));
    assert.ok(out.endsWith('<!-- jeu:fin -->\nAprès\n'));
    assert.ok(!out.includes('vieux'));
    let fnek = require('../src/config/raceStats.json').fnek;
    assert.ok(out.includes('| ' + (fnek.combat > 0 ? '+' : '') + fnek.combat + ' |'), 'stats de la race');
    assert.strictEqual(wiki.render(out), out, 'deux passages donnent le même texte');
    out = wiki.render('<!-- jeu:debut stats-races nek_eau,nek_air -->\n<!-- jeu:fin -->');
    assert.ok(out.includes('| Race | Combat'));
    assert.strictEqual(out.split('\n').filter(l => l.startsWith('| Nek-')).length, 2);
    assert.ok(wiki.render('<!-- jeu:debut statuts -->\n<!-- jeu:fin -->').includes('Blackout'));
    assert.ok(wiki.render('<!-- jeu:debut objets-depart -->\n<!-- jeu:fin -->').includes('Fronde Fnek'));
    assert.throws(() => wiki.render('<!-- jeu:debut inconnu -->\n<!-- jeu:fin -->'));
    assert.strictEqual(wiki.render('Sans marqueur'), 'Sans marqueur');
    console.log('OK');
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
    await test_votes();
    await test_item_use();
    test_stat_rolls();
    test_player_view();
    test_player_assets();
    await test_codex();
    await test_discord_profiles();
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

// Votes : sur les choix affichés par la page de jeu, remis à zéro au
// suivant, fermés quand le MJ a cliqué
async function test_votes() {
    console.log('Testing votes');
    const votes = require('../src/controllers/votes');
    const remote = require('../src/controllers/remote');
    const playerView = require('../src/controllers/playerView');
    let alice = {id: 'a1b2c3d4e5f6a7b8', name: 'Alice'};
    let bob = {id: 'b0b0b0b0b0b0b0b0', name: 'Bob'};
    let vote = (player, index) => remote.translate(player, {kind: 'action', action: 'vote', data: {index}});
    votes.clear();
    CONFIG.gameState = 'gameLive';

    assert.ok((await vote(alice, 0)).refused); // rien d'affiché
    let card = {id: 4, type: TYPE_NEGATIVE, desc: 'Une alarme retentit', choices: [{value: 'Fuir', reveal: 'secret'}, {value: 'Combattre'}]};
    votes.setScreen({cardId: 4, text: card.desc, choices: ['Fuir', 'Combattre']});
    let sent = await vote(alice, 1);
    assert.equal(sent.action, 'passThrough');
    assert.deepEqual(sent.data.data.counts, [0, 1]);
    assert.deepEqual(sent.data.data.voters, [{id: alice.id, name: 'Alice', index: 1}]); // nom du perso
    await vote(bob, 1);
    await vote(alice, 0); // changer d'avis
    assert.deepEqual(votes.payload().data.counts, [1, 1]);
    assert.ok((await vote(bob, 2)).refused);
    assert.ok((await vote(bob, -1)).refused);
    assert.equal(votes.voteOf(alice.id), 0);
    await vote(alice, null); // retirer son vote
    assert.equal(votes.voteOf(alice.id), null);
    await vote(alice, 0);

    // Les joueurs voient l'affichage de la page de jeu, avec les votes
    let seen = playerView.publicCard(card);
    assert.deepEqual(seen.choices, ['Fuir', 'Combattre']);
    assert.deepEqual(seen.counts, [1, 1]);
    assert.equal(seen.chosen, null);
    // ... mais pas celui d'une autre carte
    assert.equal(playerView.publicCard({id: 5, type: TYPE_NEGATIVE, desc: 'x', choices: []}).counts, undefined);

    // Même affichage annoncé deux fois : votes gardés
    votes.setScreen({cardId: 4, text: card.desc, choices: ['Fuir', 'Combattre']});
    assert.deepEqual(votes.payload().data.counts, [1, 1]);

    // Le MJ clique : votes fermés, choix retenu visible
    votes.setScreen({cardId: 4, text: card.desc, choices: ['Fuir', 'Combattre'], chosen: 1});
    assert.equal(playerView.publicCard(card).chosen, 1);
    assert.ok((await vote(bob, 0)).refused);

    // Suite affichée : nouveaux choix, votes remis à zéro, texte révélé public
    votes.setScreen({cardId: 4, text: 'Vous fuyez{....} de justesse', choices: ['Continuer votre chemin']});
    seen = playerView.publicCard(card);
    assert.equal(seen.desc, 'Vous fuyez… de justesse');
    assert.deepEqual(seen.counts, [0]);
    assert.equal(votes.voteOf(alice.id), null);

    // Hors partie : pas de vote
    CONFIG.gameState = 'creation';
    assert.ok((await vote(alice, 0)).refused);
    CONFIG.gameState = 'gameLive';
    votes.clear();
    console.log('Votes OK');
}

// Objets : un joueur demande, le MJ accepte (objet retiré) ou refuse
async function test_item_use() {
    console.log('Testing item use');
    const itemUse = require('../src/controllers/itemUse');
    const remote = require('../src/controllers/remote');
    const inventory = require('../src/controllers/inventory');
    const chat = require('../src/controllers/chat');
    let alice = {id: 'a1b2c3d4e5f6a7b8', name: 'Alice'};
    let use = (slug) => remote.translate(alice, {kind: 'action', action: 'item-use', data: {slug}});
    itemUse.clear();
    chat.clear();
    CONFIG.gameState = 'gameLive';
    await DB.tables.items.create({slug: 'test-medkit', name: 'Medkit', desc: '', pool: '', race: '', quantity: 0, image: '', owners: alice.id + ',' + alice.id});
    let row = await DB.tables.items.findOne({raw: true, where: {slug: 'test-medkit'}});

    assert.ok((await use('pas-a-moi')).refused);
    let sent = await use(row.slug);
    assert.equal(sent.action, 'passThrough');
    let req = sent.data.data.requests[0];
    assert.deepEqual([req.playerName, req.slug], ['Alice', row.slug]); // nom du perso
    assert.ok((await use(row.slug)).refused); // déjà demandé
    assert.deepEqual(itemUse.pendingFor(alice.id), [row.slug]);

    // Refusé : rien ne change
    await itemUse.answer({id: req.id, ok: false});
    assert.equal((await inventory.getInventory(alice.id)).find(i => i.slug === row.slug).count, 2);
    assert.deepEqual(itemUse.pendingFor(alice.id), []);

    // Accepté : un exemplaire retiré, annoncé au salon
    req = (await use(row.slug)).data.data.requests[0];
    let out = await itemUse.answer({id: req.id, ok: true});
    assert.equal(out[0].data.requests.length, 0);
    assert.equal((await inventory.getInventory(alice.id)).find(i => i.slug === row.slug).count, 1);
    assert.ok(chat.historyFor(alice.id).pop().text.includes('utilise'));
    // Réponse à une demande inconnue : sans effet
    assert.equal((await itemUse.answer({id: 'x', ok: true})).data.requests.length, 0);

    CONFIG.gameState = 'creation';
    assert.ok((await use(row.slug)).refused);
    CONFIG.gameState = 'gameLive';
    await DB.tables.items.destroy({where: {id: row.id}});
    chat.clear();
    console.log('Item use OK');
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
    assert.deepEqual([planet.id, planet.kind, planet.desc, planet.choices, planet.lastPlanet], [9, 'planet', '', [], null]);
    assert.deepEqual(planet.planet.modules, {}); // rien de scanné : aucune valeur
    let last = playerView.publicCard({id: 9, type: TYPE_PLANET, modules: {}, lastPlanet: true});
    assert.deepEqual(last.lastPlanet, LANG.last_planet);
    assert(LANG.last_planet.title && LANG.last_planet.text);
    test_planet_scan();
    assert.equal(playerView.publicCard(null), null);
    console.log('Player view OK');
}

// Planète : les joueurs ne reçoivent que les valeurs des stats scannées
function test_planet_scan() {
    console.log('Testing planet scans');
    const planetScan = require('../src/controllers/planetScan');
    const playerView = require('../src/controllers/playerView');
    const votes = require('../src/controllers/votes');
    let card = {id: 12, type: TYPE_PLANET, modules: {oxy: {val: 80, cost: 2}, cli: {val: 30, cost: 3}, fau: {val: 50, cost: 4}, flo: {val: 20, cost: 4}, civ: {val: 5, cost: 4}, res: {val: 70}, wtr: {val: 10}, grv: {val: 41}}};
    planetScan.setScreen({cardId: 12, points: 6, drones: 1, scans: [
        {key: 'oxy', cost: 2, revealed: true, text: 'Air respirable'},
        {key: 'ff', cost: 4, revealed: true, text: 'Forêts'},
        {key: 'cli', cost: 3, revealed: false, text: 'secret'},
        {key: '__proto__', cost: 1, revealed: true}
    ]});
    let seen = playerView.publicCard(card).planet;
    assert.deepEqual(seen.modules, {oxy: {val: 80}, fau: {val: 50}, flo: {val: 20}, civ: {val: 5}});
    assert.equal(seen.points, 6);
    assert.equal(seen.drones, 1);
    let cli = seen.scans.find(s => s.key === 'cli');
    assert.deepEqual([cli.revealed, cli.text, cli.cost], [false, '', 3]);
    assert.equal(seen.scans.find(s => s.key === 'oxy').text, 'Air respirable');
    assert.equal(seen.scans.length, 6);
    // Autre planète : rien de celle-ci
    assert.deepEqual(playerView.publicCard({id: 13, type: TYPE_PLANET, modules: card.modules}).planet.modules, {});
    // Vote pour le scan suivant
    votes.setScreen({cardId: 12, text: '', choices: ['Climat', 'Gravité']});
    assert.deepEqual(playerView.publicCard(card).choices, ['Climat', 'Gravité']);
    votes.clear();
    planetScan.clear();
    console.log('Planet scans OK');
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

// Codex des joueurs : seulement ce que l'équipage a rencontré, races customs
// cochées par le MJ, mémoire vidée à chaque nouvelle partie
async function test_codex() {
    console.log('Testing codex');
    const codex = require('../src/controllers/codex');
    const races = require('../src/controllers/races');
    const remote = require('../src/controllers/remote');
    const playerView = require('../src/controllers/playerView');
    const paths = require('../src/config/paths');
    const backups = {};
    for (let file of ['customRaces.json', 'raceSettings.json'])
        backups[file] = fs.existsSync(paths.cache(file)) ? fs.readFileSync(paths.cache(file)) : null;
    codex.reset();
    CONFIG.gameState = 'gameLive';
    await new (require('../src/models/items').Items)().hydrateDB();
    await DB.tables.players.destroy({where: {}});
    await DB.tables.items.update({owners: '', quantity: 0}, {where: {}});
    await DB.tables.statuses.update({duration: 0}, {where: {}});

    // Rien de rencontré : le Codex est vide, mais les totaux sont connus
    let book = await codex.forPlayers();
    assert.deepEqual([book.races, book.items, book.statuses], [[], [], []]);
    assert.ok(book.totals.races >= 11 && book.totals.items > 0 && book.totals.statuses > 0);
    assert.ok(/^https:\/\//.test(book.wiki));

    // Races nommées dans un texte vu par les joueurs, avec leurs formes
    assert.deepEqual(codex.racesIn('Un Fnek vous salue'), ['fnek']);
    assert.deepEqual(codex.racesIn('<b>Des Nek-feux</b> arrivent'), ['nek_feu']);
    assert.deepEqual(codex.racesIn('Le Fnekarium et un Nek'), []);

    // Seul ce que voient les joueurs compte : pas les révélations du MJ
    let card = {id: 30, type: TYPE_NEGATIVE, desc: 'Un Yorc vous barre la route', mjreveal: 'C\'est un Sylv déguisé',
        choices: [{value: 'Parler', reveal: 'Le Shrymp caché attaque'}]};
    let seen = playerView.publicCard(card);
    assert.ok(await codex.observe([seen.desc].concat(seen.choices)));
    assert.deepEqual(codex.known().races, ['yorc']);
    assert.equal(await codex.observe([seen.desc]), false); // déjà connu

    // Objet passé dans un inventaire, statut subi, race de l'équipage
    let row = await DB.tables.items.findOne({raw: true, where: {slug: 'corde'}});
    await DB.tables.items.update({owners: 'codex-player-01'}, {where: {id: row.id}});
    let status = await DB.tables.statuses.findOne({raw: true});
    await DB.tables.statuses.update({duration: 2}, {where: {id: status.id}});
    await DB.tables.players.create({discord_id: 'codex-player-01', name: 'Zed', race: 'aku'});
    CONFIG.gameState = 'creation';
    await codex.observe([]);
    assert.ok(!codex.known().races.includes('aku')); // choix en cours : pas encore rencontré
    CONFIG.gameState = 'gameLive';
    await codex.observe([]);
    book = await codex.forPlayers();
    assert.deepEqual(book.races.map(r => r.slug).sort(), ['aku', 'yorc']);
    assert.deepEqual(book.items.map(i => i.slug), ['corde']);
    assert.deepEqual(book.statuses.map(s => s.slug), [status.slug]);
    // Rendu au joueur : texte brut, image livrée avec la page ou envoyée par le MJ
    let yorc = book.races.find(r => r.slug === 'yorc');
    assert.equal(yorc.image, 'img/races/yorc.webp');
    assert.ok(!/[<>]|&quot;/.test(yorc.desc));
    assert.equal(book.items[0].imageKey, 'item:corde');
    assert.ok(/^data:image\/png;base64,/.test(await codex.imageData('item:corde')));
    assert.equal(await codex.imageData('item:../../package'), null);
    // Une fois l'objet donné ou utilisé, il reste dans le Codex
    await DB.tables.items.update({owners: ''}, {where: {id: row.id}});
    await codex.observe([]);
    assert.deepEqual(codex.known().items, ['corde']);

    // Affinités du wiki : visibles quand toutes leurs races ont été croisées
    assert.deepEqual(yorc.affinities, []);
    assert.equal(yorc.moreAffinities, 1);
    assert.equal(book.races.find(r => r.slug === 'aku').noAffinity, true); // le wiki n'en donne pas
    codex.remember({races: ['fnek']});
    yorc = (await codex.forPlayers()).races.find(r => r.slug === 'yorc');
    assert.equal(yorc.affinities.length, 1);
    // À la création, la fiche montre toutes les affinités
    assert.ok(codex.raceCard(races.list().find(r => r.slug === 'sylv')).affinities.length >= 2);

    // Page du MJ : tout, avec ce qui a été rencontré
    let gm = await codex.forGm();
    assert.equal(gm.races.length, races.list().length);
    assert.ok(gm.races.find(r => r.slug === 'yorc').seen);
    assert.ok(!gm.races.find(r => r.slug === 'sylv').seen);
    assert.ok(gm.items.length > book.items.length);

    // Races customs : seules celles que le MJ coche sont jouables et visibles
    let custom = races.save({name: 'Codexien', stats: {combat: 1}}).race;
    assert.ok(races.isAllowed(custom.slug)); // jamais réglé : toutes autorisées
    races.setAllowed([]);
    assert.ok(!races.isAllowed(custom.slug));
    assert.ok(races.isAllowed('fnek'));
    assert.ok(!races.playable().some(r => r.slug === custom.slug));
    assert.ok(!LANG.card_vars.race[custom.slug]); // plus citée par les cartes
    assert.deepEqual(codex.racesIn('Un Codexien approche'), []);
    codex.remember({races: [custom.slug]});
    assert.ok(!(await codex.forPlayers()).races.some(r => r.slug === custom.slug));
    CONFIG.gameState = 'creation';
    let refused = await remote.translate({id: 'codex-player-01', name: 'Zed'}, {kind: 'action', action: 'set-race', data: {race: custom.slug}});
    assert.ok(refused.refused);
    assert.ok(!(await playerView.gameState()).races.some(r => r.slug === custom.slug));
    races.setAllowed([custom.slug, 'inconnue']);
    assert.deepEqual(races.allowedState().find(r => r.slug === custom.slug).allowed, true);
    assert.ok(LANG.card_vars.race[custom.slug]);
    assert.ok((await playerView.gameState()).races.some(r => r.slug === custom.slug && r.imageKey === 'race:' + custom.slug));
    assert.equal((await remote.translate({id: 'codex-player-01', name: 'Zed'}, {kind: 'action', action: 'set-race', data: {race: custom.slug}})).race, custom.slug);
    assert.ok((await codex.forPlayers()).races.some(r => r.slug === custom.slug && r.custom && r.noAffinity));
    CONFIG.gameState = 'gameLive';

    // Chaque race de base a sa vignette dans la page joueur
    for (let slug of Object.keys(require('../src/config/raceStats.json')))
        assert.ok(fs.existsSync(paths.ROOT + '/public/player/img/races/' + slug + '.webp'), 'vignette de ' + slug);

    // Nouvelle partie : mémoire vidée, fichier supprimé
    assert.ok(fs.existsSync(paths.cache('codex.json')));
    codex.reset();
    assert.deepEqual(codex.known(), {races: [], items: [], statuses: []});
    assert.ok(!fs.existsSync(paths.cache('codex.json')));
    assert.deepEqual((await codex.forPlayers()).races, []);

    // Nettoyage
    await races.remove(custom.slug).catch(() => {});
    await DB.tables.players.destroy({where: {discord_id: 'codex-player-01'}});
    await DB.tables.statuses.update({duration: 0}, {where: {id: status.id}});
    for (let [file, content] of Object.entries(backups)) {
        if (content)
            fs.writeFileSync(paths.cache(file), content);
        else if (fs.existsSync(paths.cache(file)))
            fs.unlinkSync(paths.cache(file));
    }
    races.applyToLang();
    console.log('Codex OK');
}

// Compte Discord vérifié par le relais : gardé avec le joueur du lobby
// (id, pseudo, avatar seulement), affiché à côté de son perso
async function test_discord_profiles() {
    console.log('Testing Discord profiles');
    const lobby = require('../src/controllers/lobby');
    const playerView = require('../src/controllers/playerView');
    const join = (player) => lobby.onRelayMessage(Buffer.from(JSON.stringify({type: 'join', player: player})));
    let discord = {id: '80351110224678912', name: 'Nelly', avatar: 'https://cdn.discordapp.com/avatars/80351110224678912/abc.png?size=64'};
    join({id: 'nelly-app-0001', name: 'Nel', discord: Object.assign({email: 'x@y.z', token: 'secret'}, discord)});
    assert.deepEqual(lobby.discordOf('nelly-app-0001'), discord);
    assert.deepEqual(lobby.getState().players.find(p => p.id === 'nelly-app-0001').discord, discord);
    // Sans connexion Discord, ou avatar hors du cdn de Discord : rien
    join({id: 'bob-app-0001', name: 'Bob'});
    join({id: 'eve-app-0001', name: 'Eve', discord: {id: '123456', name: 'Eve', avatar: 'javascript:alert(1)'}});
    assert.equal(lobby.discordOf('bob-app-0001'), null);
    assert.equal(lobby.discordOf('eve-app-0001'), null);
    assert.equal(lobby.discordOf('inconnu'), null);
    // Vue des autres joueurs : le pseudo Discord à côté du perso
    await DB.tables.players.create({discord_id: 'nelly-app-0001', name: 'Capitaine Zorg', race: 'fnek'});
    let team = (await playerView.gameState()).team;
    assert.deepEqual(team.find(c => c.id === 'nelly-app-0001').discord, discord);
    for (let id of ['nelly-app-0001', 'bob-app-0001', 'eve-app-0001'])
        lobby.kick(id);
    await DB.tables.players.destroy({where: {discord_id: 'nelly-app-0001'}});
    console.log('Discord profiles OK');
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
    for (let m of await DB.tables.card_modules.findAll({where: {type: 'choice'}, raw: true})) {
        texts.push(m.value, m.reveal, m.mjreveal);
        if (m.roll)
            for (let issue of Object.values(JSON.parse(m.roll)).filter(i => i && typeof i === 'object'))
                texts.push(issue.reveal, issue.mjreveal);
        for (let outcome of m.outcomes ? JSON.parse(m.outcomes) : []) {
            texts.push(outcome.reveal, outcome.mjreveal);
            if (outcome.roll)
                texts.push(outcome.roll.success.reveal, outcome.roll.success.mjreveal, outcome.roll.failure.reveal, outcome.roll.failure.mjreveal);
        }
    }
    for (let a of await DB.tables.cards_alt.findAll({raw: true}))
        texts.push(a.value, a.reveal, a.mjreveal);
    for (let text of texts) {
        // Une variable a la forme [article_type_id] ou [type_id], sans espace (« [rev B] » est du texte)
        assert(!/\[[^\]\s]+_[^\]\s]+\]/.test(text || ''), 'Variable non remplacée : ' + text);
        assert(!(text || '').includes('undefined'), 'Variable vide : ' + text);
    }
    console.log('OK');

    // Listes de variables : toutes les entrées d'une liste ont les mêmes articles
    // (sinon un tirage au hasard peut donner « undefined »)
    const lists = Object.keys(LANG.card_vars).filter(type => !['planet_text', 'end_screen'].includes(type)
        && Object.values(LANG.card_vars[type]).every(e => e && typeof e === 'object'));
    for (let type of lists) {
        assert(!type.includes('_'), 'Nom de liste avec « _ » : ' + type);
        let entries = Object.entries(LANG.card_vars[type]);
        let articles = Object.keys(entries[0][1]).sort().join(',');
        for (let [key, forms] of entries) {
            assert.strictEqual(Object.keys(forms).sort().join(','), articles, 'Articles différents dans ' + type + '.' + key);
            assert(Object.values(forms).every(v => typeof v === 'string' && v.trim()), 'Forme vide dans ' + type + '.' + key);
        }
    }

    // Chaque variable des cartes a une liste qui connaît son article
    let raw = fs.readFileSync(__dirname + '/../src/config/baseCards.json', 'utf8');
    for (let token of new Set(raw.match(/\[[^\]\s"]+_[^\]\s"]+\]/g))) {
        let parts = token.slice(1, -1).split('_');
        if (parts.length === 2 && LANG.card_vars[parts[0].toLowerCase()])
            parts = ['no', parts[0].toLowerCase(), parts[1]];
        let article = parts[0].toLowerCase(), type = parts[1];
        if (article === 'conf') {
            assert(CONFIG[parts[1]] !== undefined, 'Paramètre inconnu : ' + token);
            continue;
        }
        assert(lists.includes(type), 'Pas de liste pour ' + token);
        assert(article in Object.values(LANG.card_vars[type])[0], 'Article inconnu pour ' + token);
    }

    // Les nouvelles listes se résolvent sans trou
    let sample = new Card().replaceVars('[Le_lieu_1] [du_pnj_1] [au_organisation_1] [le_bande_1] [du_personnage_1] [le_systeme_1] [le_film_1]');
    assert(!/\[|undefined/.test(sample), sample);
    console.log('OK');

    // Même variable = même valeur dans tous les textes d'une carte (et de ses suites)
    let card = new Card();
    let first = card.replaceVars('[le_race_1]|[No_objet_1]|[no_boisson_1]|[no_bouteille_1]');
    let second = card.replaceVars('[le_race_1]|[objet_1]|[no_boisson_1]|[no_bouteille_1]');
    assert.strictEqual(first, second);
    assert.notStrictEqual(card.replaceVars('[no_race_1]'), card.replaceVars('[no_race_2]'));
    // Crochets sans « _ » : du texte, laissé tel quel
    assert.strictEqual(card.replaceVars('Plan [rev B]'), 'Plan [rev B]');
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

// Suites d'un choix : la sienne, ou réussite et échec de son jet ; pour des
// issues au hasard, celles de chaque issue (et non seulement de celle tirée)
const issueSuites = (issue) => issue.roll ? [issue.roll.success, issue.roll.failure] : [issue];
const choiceSuites = (choice) => (choice.outcomes || [choice]).flatMap(issueSuites);

// Une suite unique : un résultat ou une carte qui existe
function assertSuite(suite, names, label) {
    let hasReveal = !!(suite.reveal && suite.reveal.trim());
    let hasNext = !!suite.next;
    assert(hasReveal !== hasNext, 'Choix sans suite unique : ' + label);
    if (hasNext)
        assert(names.includes(suite.next), 'Suite inconnue : ' + suite.next);
}

// Lieux : chaque choix a une seule suite (ou, pour un jet, une suite réussite
// et une suite échec), un résultat (fin du lieu, suivie d'un seul « Continuer
// votre chemin ») ou une carte du lieu qui existe
async function test_place_endings(){
    console.log('Testing place choices');
    let rows = await DB.tables.cards.findAll({where: {type: [TYPE_PLACE, TYPE_FOLLOWUP]}, raw: true});
    let names = rows.map(r => r.name).filter(n => n);
    assert(rows.length > 0);
    for (let row of rows) {
        let card = await new Card(row.id).getData();
        assert(card.choices.length > 0, 'Carte de lieu sans choix : ' + row.name);
        for (let choice of card.choices) {
            if (choice.roll)
                assert(!choice.next && !(choice.reveal || '').trim(), 'Choix à jet avec sa propre suite : ' + row.name + ' / ' + choice.value);
            for (let suite of choiceSuites(choice))
                assertSuite(suite, names, row.name + ' / ' + choice.value);
        }
    }
    console.log('OK');
}

// Jets des choix : une suite réussite et une suite échec, cartes sans jet inchangées
async function test_card_rolls() {
    console.log('Testing card rolls');
    const {parseRoll} = require('../src/models/card');
    let names = (await DB.tables.cards.findAll({raw: true})).map(r => r.name).filter(n => n);
    let rolls = 0;
    for (let row of await DB.tables.cards.findAll({where: {type: [TYPE_POSITIVE, TYPE_NEGATIVE, TYPE_NEUTRAL, TYPE_INITIAL]}, raw: true})) {
        let card = await new Card(row.id).getData();
        for (let choice of card.choices) {
            if (!choice.roll && !choice.outcomes)
                continue;
            rolls += choice.roll ? 1 : 0;
            if (choice.roll)
                assert(!choice.next && !(choice.reveal || '').trim(), 'Choix à jet avec sa propre suite : ' + choice.value);
            for (let suite of choiceSuites(choice))
                assertSuite(suite, names, choice.value);
        }
    }
    // Exemple de baseCards.json : la manoeuvre d'évitement des débris
    assert(rolls > 0, 'aucune carte avec un jet');
    console.log('OK');

    console.log('Roll format and compatibility');
    assert.strictEqual(parseRoll(''), null);
    assert.strictEqual(parseRoll('pas du json'), null);
    assert.strictEqual(parseRoll({stat: 'pilotage', success: {reveal: 'ok'}}), null);
    assert.deepStrictEqual(parseRoll({stat: 'inconnue', success: {reveal: 'ok'}, failure: {next: 'x', humans: '-5', loot: ['medkit']}}), {
        stat: '',
        success: {reveal: 'ok', mjreveal: '', next: '', humans: 0, loot: []},
        failure: {reveal: '', mjreveal: '', next: 'x', humans: -5, loot: ['medkit']}
    });
    let card = await new Card().create({
        type: TYPE_NEUTRAL, desc: 'Un astéroïde', timer: 1,
        choices: [
            {value: 'Esquiver', mjreveal: 'Jet de pilotage', roll: {stat: 'pilotage', success: {reveal: 'Évité [le_race_1]'}, failure: {reveal: 'Touché', humans: -10}}},
            {value: 'Ne rien faire', reveal: 'Boum'}
        ]
    });
    let [dodge, nothing] = card.choices;
    assert.strictEqual(dodge.roll.stat, 'pilotage');
    assert(!dodge.roll.success.reveal.includes('[') && dodge.roll.failure.humans === -10);
    assert.strictEqual(nothing.roll, undefined);
    assert.strictEqual(nothing.reveal, 'Boum');
    // Card.delete efface la carte et tous ses modules
    await card.delete();
    assert.strictEqual(await DB.tables.card_modules.count({where: {card_id: card.id}}), 0);
    assert.strictEqual(await DB.tables.cards.count({where: {id: card.id}}), 0);
    console.log('OK');
}

// Issues tirées au hasard pour un même choix
async function test_card_outcomes() {
    console.log('Testing card outcomes');
    const {parseOutcomes, drawOutcome} = require('../src/models/card');

    // Exemple de baseCards.json : le conteneur ouvert
    let examples = 0;
    for (let row of await DB.tables.cards.findAll({where: {type: [TYPE_POSITIVE, TYPE_NEGATIVE, TYPE_NEUTRAL, TYPE_PLACE, TYPE_FOLLOWUP]}, raw: true}))
        for (let choice of (await new Card(row.id).getData()).choices)
            if (choice.outcomes) {
                examples++;
                assert(choice.outcome >= 0 && choice.outcome < choice.outcomes.length);
                assert(!!choice.reveal || !!choice.next || !!choice.roll, 'Issue tirée sans suite : ' + choice.value);
            }
    assert(examples > 0, 'aucun choix avec des issues au hasard');
    console.log('OK');

    console.log('Outcomes format and draw');
    assert.strictEqual(parseOutcomes(''), null);
    assert.strictEqual(parseOutcomes([{reveal: 'seule'}]), null);   // une seule issue : choix normal
    let list = parseOutcomes([{reveal: 'a'}, {weight: 3, next: 'b', loot: ['Outils']}, {weight: -2, reveal: 'c', roll: {stat: 'combat', success: {reveal: 'ok'}, failure: {reveal: 'ko'}}}]);
    assert.deepStrictEqual(list.map(o => o.weight), [1, 3, 1]);
    assert.strictEqual(list[1].next, 'b');
    assert.strictEqual(list[2].roll.stat, 'combat');
    // Poids 1 / 3 / 1 sur 5 : [0, .2[ → 0, [.2, .8[ → 1, [.8, 1[ → 2
    assert.deepStrictEqual([0, .19, .2, .79, .8, .99].map(r => drawOutcome(list, () => r)), [0, 0, 1, 1, 2, 2]);
    assert.strictEqual(drawOutcome([{weight: 0}, {weight: 0}], () => .6), 1);
    console.log('OK');

    console.log('Outcomes in game');
    let card = await new Card().create({
        type: TYPE_NEUTRAL, desc: 'Un conteneur',
        choices: [
            {value: 'Ouvrir', mjreveal: 'MJ', humans: -5, loot: ['Corde'], outcomes: [
                {reveal: 'Des araignées [le_race_1]', mjreveal: 'perte de moral'},
                {reveal: 'Des outils', humans: 10, loot: ['Outils']},
                {roll: {stat: 'pilotage', success: {reveal: 'esquivé'}, failure: {reveal: 'touché'}}}
            ]},
            {value: 'Partir', reveal: 'Rien'}
        ]
    });
    let seen = new Set();
    for (let i = 0; i < 60 && seen.size < 3; i++) {
        let open = (await new Card(card.id).getData()).choices.find(c => c.value === 'Ouvrir');
        seen.add(open.outcome);
        assert.strictEqual(open.outcomes.length, 3);
        if (open.outcome === 0)
            assert(open.reveal.startsWith('Des araignées') && !open.reveal.includes('[') && open.mjreveal === 'MJ\nperte de moral' && !open.roll);
        if (open.outcome === 1)
            assert(open.reveal === 'Des outils' && open.humans === 5 && open.loot.join() === 'Corde,Outils');
        if (open.outcome === 2)
            assert(open.roll && open.roll.success.reveal === 'esquivé' && open.reveal === '');
    }
    assert.strictEqual(seen.size, 3, 'toutes les issues doivent pouvoir sortir');
    let leave = (await new Card(card.id).getData()).choices.find(c => c.value === 'Partir');
    assert(leave.outcomes === undefined && leave.outcome === undefined && leave.reveal === 'Rien');
    await DB.tables.card_modules.destroy({where: {card_id: card.id}});
    await DB.tables.cards.destroy({where: {id: card.id}});
    console.log('OK');
}

// Statuts hors combat au retour d'une planète, selon l'option du MJ
// Carte blanche : « Autre… » sur les cartes à choix, carte écrite par le MJ
async function test_blank_card() {
    console.log('Testing blank card');
    const blankCard = require('../src/controllers/blankCard');
    const gameSettings = require('../src/controllers/gameSettings');
    const playerView = require('../src/controllers/playerView');
    const get = gameSettings.get;
    const choices = (n) => Array.from({length: n}, (_, i) => ({value: 'C' + i, reveal: '', next: '', humans: 0, loot: []}));
    const others = (card) => card.choices.filter(c => c.other).length;

    try {
        console.log('« Autre… » : cartes RP à choix, sans chrono, une seule fois');
        assert.strictEqual(get().otherChoice, true);
        let card = blankCard.addOther(blankCard.addOther({type: TYPE_NEGATIVE, timer: 0, choices: choices(2)}));
        assert.equal(card.choices.length, 3);
        assert.equal(card.choices[2].value, blankCard.OTHER_LABEL);
        assert.equal(others(card), 1);
        assert.equal(others(blankCard.addOther({type: TYPE_PLACE, timer: 0, choices: choices(3)})), 1);
        assert.equal(others(blankCard.addOther({type: TYPE_NEGATIVE, timer: 1, choices: choices(2)})), 0);
        assert.equal(others(blankCard.addOther({type: TYPE_NEUTRAL, timer: 0, choices: choices(1)})), 0);
        assert.equal(others(blankCard.addOther({type: TYPE_INITIAL, timer: 'false', choices: choices(2)})), 0);
        assert.deepEqual(playerView.publicCard(card).choices, ['C0', 'C1', blankCard.OTHER_LABEL]);
        gameSettings.get = () => Object.assign(get(), {otherChoice: false});
        assert.equal(others(blankCard.addOther({type: TYPE_POSITIVE, timer: 0, choices: choices(2)})), 0);
        gameSettings.get = get;
        console.log('OK');

        console.log('Carte du MJ bornée : 4 choix au plus, choix sans texte ignorés');
        assert.equal(blankCard.clean({desc: '  ', choices: [{value: ''}]}), null);
        let clean = blankCard.clean({desc: ' Une porte ', choices: [
            {value: 'A', reveal: 'ra', moral: '-7', humans: 'x', loot: 'Medkit'},
            {value: ''}, {value: 'B', moral: 500}, {value: 'C'}, {value: 'D'}, {value: 'E'}]});
        assert.equal(clean.desc, 'Une porte');
        assert.deepEqual(clean.choices.map(c => c.value), ['A', 'B', 'C', 'D']);
        assert.deepEqual(clean.choices[0], {value: 'A', reveal: 'ra', moral: -7, humans: 0, loot: ['Medkit']});
        assert.equal(clean.choices[1].moral, 100);
        console.log('OK');

        console.log('Demande, affichage, choix : moral de chaque joueur, borné');
        await new Player().create({discord_id: 'blank1', name: 'B1'});
        await new Player().create({discord_id: 'blank2', name: 'B2'});
        await new Player().update({moral: 50}, 'blank1');
        await new Player().update({moral: 3}, 'blank2');
        assert.equal((await blankCard.handle({action: 'blank-card-request', data: {desc: 'carte'}})).data.status, 'waiting');
        assert.equal(blankCard.publicCard().kind, 'blank');
        assert.ok((await blankCard.handle({action: 'blank-card-show', data: {desc: '', choices: []}})).error);
        let shown = await blankCard.handle({action: 'blank-card-show', data: {desc: 'Suite', choices: [{value: 'Ouvrir', reveal: 'Ouvert', moral: -5}]}});
        assert.equal(shown.action, 'blank-card-show');
        // Les joueurs en ligne voient le texte et les choix, pas les résultats
        assert.deepEqual(blankCard.publicCard(), {id: 'blank', kind: 'blank', desc: 'Suite', timer: false, choices: ['Ouvrir']});
        let out = await blankCard.handle({action: 'blank-card-choice', data: {index: 0}});
        assert.equal(out[0].action, 'blank-card-choice');
        assert.equal(out.filter(m => m.action === 'playerStat').length, 2);
        assert.equal((await new Player().getData('blank1')).moral, 45);
        assert.equal((await new Player().getData('blank2')).moral, 0);
        assert.equal(blankCard.getState(), null);
        assert.ok((await blankCard.handle({action: 'blank-card-choice', data: {index: 0}})).error);
        await blankCard.handle({action: 'blank-card-request', data: {}});
        await blankCard.handle({action: 'blank-card-cancel', data: {}});
        assert.equal(blankCard.getState(), null);
        console.log('OK');
    }
    finally {
        gameSettings.get = get;
        blankCard.reset();
        await new Player().delete('blank1');
        await new Player().delete('blank2');
    }
}

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

// Option « Vaisseau aléatoire » : désactivée par défaut, stats à ±10 % sans dépasser 100
function test_random_ship() {
    console.log('Testing random ship');
    const gameSettings = require('../src/controllers/gameSettings');
    const variation = gameSettings.SHIP_START_VARIATION;
    assert.strictEqual(gameSettings.OPTIONS.find(o => o.key === 'randomShipStats').default, false);
    let low = Ship.randomStart(variation, () => 0);
    let high = Ship.randomStart(variation, () => 0.999999);
    assert.strictEqual(low.motors, 90);
    assert.strictEqual(high.motors, 100);
    assert.strictEqual(low.cryopods, undefined);
    for (let i = 0; i < 50; i++)
        for (let [stat, v] of Object.entries(Ship.randomStart(variation)))
            assert(Number.isInteger(v) && v >= 90 && v <= 100, stat + ' = ' + v);
    console.log('Random ship OK');
}

// Alerte « dernière planète » : seule la dernière planète du paquet est marquée
async function test_last_planet() {
    console.log('Testing last planet');
    const {cardPop, planetsLeft} = require('../src/controllers/deck');
    let deck = await DB.tables.deck.findAll({where: {deck_id: 0}, order: [['id', 'ASC']], raw: true});
    let cards = await DB.tables.cards.findAll({attributes: ['id', 'type'], raw: true});
    let typeOf = (id) => cards.find(c => c.id === id).type;
    let planets = deck.filter(d => typeOf(d.card_id) === TYPE_PLANET);
    assert(planets.length >= 2);
    // Paquet joué jusqu'avant une planète donnée : elle sort au prochain tirage
    const popPlanet = async (row) => {
        await DB.tables.deck.update({played: 0}, {where: {deck_id: 0}});
        for (let d of deck.filter(d => d.id < row.id))
            await DB.tables.deck.update({played: 1}, {where: {id: d.id}});
        return await cardPop();
    };
    try {
        assert.strictEqual(await planetsLeft(), planets.length);
        let first = await popPlanet(planets[0]);
        assert.strictEqual(first.type, TYPE_PLANET);
        assert.strictEqual(first.lastPlanet, false);
        let last = await popPlanet(planets[planets.length - 1]);
        assert.strictEqual(last.lastPlanet, true);
        assert.strictEqual(await planetsLeft(), 0);
        console.log('Last planet OK');
    }
    finally {
        await DB.tables.deck.update({played: 0}, {where: {deck_id: 0}});
    }
}

// Statuts créés à la volée, statuts d'un seul joueur et Diverti
async function test_custom_statuses() {
    console.log('Testing custom statuses');
    const api = require('../src/controllers/api');
    const gameSettings = require('../src/controllers/gameSettings');
    const {Statuses} = require('../src/models/statuses');
    const get = gameSettings.get;
    const statuses = new Statuses();
    await statuses.hydrateDB();
    const res = {json() {}};
    const row = (slug, player = '') => DB.tables.statuses.findOne({where: {slug: slug, player_id: player}, raw: true});
    let bob = await new Player().create({discord_id: 'status-bob', name: 'Bob', moral: 100});
    let eve = await new Player().create({discord_id: 'status-eve', name: 'Eve', moral: 100});

    try {
        console.log('Diverti fait partie des statuts de base');
        assert.ok(await row('diverti'));
        console.log('OK');

        console.log('Création à la volée');
        assert.strictEqual(await statuses.createCustom({name: '  '}), false);
        assert.strictEqual(await statuses.createCustom({name: 'Blackout'}), false);
        let slug = await statuses.createCustom({name: 'Sous le charme', desc: 'Les joueurs rêvassent.', clearAfterPlanet: false});
        assert.strictEqual(slug, 'c-sous-le-charme');
        assert.strictEqual((await row(slug)).desc, 'Les joueurs rêvassent.');
        assert.strictEqual(await statuses.createCustom({name: 'Sous le charme', desc: 'Autre texte', clearAfterPlanet: true}), slug);
        assert.strictEqual((await row(slug)).desc, 'Autre texte');
        assert.ok((await statuses.getAllStatuses(false)).some(s => s.slug === slug));
        console.log('OK');

        console.log('Statut d\'un seul joueur');
        await statuses.updateStatus(slug, 2, bob.discord_id);
        assert.strictEqual((await row(slug)).duration, 0);
        let active = await statuses.getAllStatuses();
        assert.deepStrictEqual(active.map(s => [s.slug, s.player_name, s.desc]), [[slug, 'Bob', 'Autre texte']]);
        assert.strictEqual((await statuses.getAllStatuses(false)).filter(s => s.slug === slug).length, 1);
        await statuses.updateStatus(slug, 0, bob.discord_id);
        assert.strictEqual(await row(slug, bob.discord_id), null);
        console.log('OK');

        console.log('Diverti : pertes de moral divisées par deux, arrondi vers le bas');
        assert.strictEqual(await statuses.moralAfterLoss(bob.discord_id, 100, 90), 90);
        await statuses.updateStatus('diverti', 3, bob.discord_id);
        assert.strictEqual(await statuses.moralAfterLoss(bob.discord_id, 100, 90), 95);
        assert.strictEqual(await statuses.moralAfterLoss(bob.discord_id, 100, 93), 97);
        assert.strictEqual(await statuses.moralAfterLoss(bob.discord_id, 100, 99), 100);
        assert.strictEqual(await statuses.moralAfterLoss(bob.discord_id, 50, 60), 60);
        assert.strictEqual(await statuses.moralAfterLoss(eve.discord_id, 100, 90), 90);
        await statuses.updateStatus('diverti', 3);
        assert.strictEqual(await statuses.moralAfterLoss(eve.discord_id, 100, 90), 95);
        await statuses.updateStatus('diverti', 0);
        await statuses.updateStatus('diverti', 0, bob.discord_id);
        console.log('OK');

        console.log('Carte du vaisseau Sylv : le choix donne Diverti');
        let sylv = await DB.tables.card_modules.findOne({where: {status: {[require('sequelize').Op.ne]: ''}}, raw: true});
        assert.deepStrictEqual(JSON.parse(sylv.status), {slug: 'diverti', duration: 3});
        let card = await new Card(sylv.card_id).getData();
        assert.deepStrictEqual(card.choices.find(c => c.status).status, {slug: 'diverti', duration: 3});
        console.log('OK');

        console.log('Après une planète : la case du statut créé l\'emporte sur l\'option');
        let kept = await statuses.createCustom({name: 'Tenace', clearAfterPlanet: false});
        let gone = await statuses.createCustom({name: 'Fragile', clearAfterPlanet: true});
        gameSettings.get = () => Object.assign(get(), {clearStatusesAfterPlanet: false});
        await statuses.updateStatus(kept, 3);
        await statuses.updateStatus(gone, 3);
        await statuses.updateStatus('blackout', 3);
        await statuses.updateStatus(kept, 1, eve.discord_id);
        let deck = await DB.tables.deck.findAll({where: {deck_id: 0}, order: [['id', 'ASC']], raw: true});
        for (let elt of deck) {
            await DB.tables.deck.update({played: 1}, {where: {id: elt.id}});
            if ((await DB.tables.cards.findOne({where: {id: elt.card_id}, raw: true})).type === TYPE_PLANET)
                break;
        }
        await api.popNextCard({}, res);
        assert.strictEqual((await row(kept)).duration, 2);
        assert.strictEqual((await row(gone)).duration, 0);
        assert.strictEqual((await row('blackout')).duration, 2);
        // Le statut du joueur arrivé à 0 disparaît
        assert.strictEqual(await row(kept, eve.discord_id), null);
        console.log('OK');
    }
    finally {
        gameSettings.get = get;
        await DB.tables.deck.update({played: 0}, {where: {deck_id: 0}});
        await DB.tables.players.destroy({where: {discord_id: [bob.discord_id, eve.discord_id]}});
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

// Rôles des joueurs : config, dés en plus sur la stat du rôle, un seul joueur par rôle
async function test_roles() {
    console.log('Testing roles');
    const roles = require('../src/controllers/roles');
    const remote = require('../src/controllers/remote');
    const STATS = ['combat', 'pilotage', 'engineering', 'survival', 'recon'];

    let list = roles.list();
    assert.ok(list.length >= 6);
    assert.ok(roles.find('capitaine'));
    let slugs = new Set();
    for (let role of list) {
        assert.ok(role.slug && role.name && role.effect, JSON.stringify(role));
        assert.ok(!slugs.has(role.slug), 'rôle en double : ' + role.slug);
        slugs.add(role.slug);
        assert.ok(role.stat === null || STATS.includes(role.stat), role.slug + ' : stat ' + role.stat);
        assert.ok(fs.existsSync(__dirname + '/../public' + role.icon), 'icône manquante : ' + role.icon);
    }

    // Dés : 1 de base, +bonus sur la stat du rôle ; on garde le meilleur
    assert.equal(roles.diceCount({role: 'pilote'}, 'pilotage'), 2);
    assert.equal(roles.diceCount({role: 'pilote'}, 'combat'), 1);
    assert.equal(roles.diceCount({role: 'capitaine'}, 'pilotage'), 1);
    assert.equal(roles.diceCount({role: ''}, 'combat'), 1);
    assert.equal(roles.diceCount({role: 'inconnu'}, 'combat'), 1);
    let values = [0.10, 0.75];
    let rolled = roles.rollDice(2, () => values.shift());
    assert.deepStrictEqual(rolled, {dice: [11, 76], kept: 76});
    assert.equal(roles.rollDice(1, () => 0.5).dice.length, 1);

    // Attribution : rôle unique, le joueur qui l'avait le perd
    await new Player().create({discord_id: 'role-a', name: 'A', moral: 100});
    await new Player().create({discord_id: 'role-b', name: 'B', moral: 100});
    let changed = await roles.assign('role-a', 'pilote');
    assert.equal(changed.length, 1);
    assert.equal((await new Player().getData('role-a')).role, 'pilote');
    changed = await roles.assign('role-b', 'pilote');
    assert.deepStrictEqual(changed.map(p => [p.discord_id, p.role]), [['role-a', ''], ['role-b', 'pilote']]);
    assert.equal(await roles.assign('role-a', 'inconnu'), null);
    assert.equal(await roles.assign('personne', 'pilote'), null);
    await roles.assign('role-b', '');
    assert.equal((await new Player().getData('role-b')).role, '');
    assert.equal(roles.publicRole('pilote').name, 'Pilote');
    assert.equal(roles.publicRole(''), null);

    // Seul le MJ donne les rôles
    assert.ok((await remote.translate({id: 'role-a', name: 'A'}, {kind: 'action', action: 'player-role', data: {role: 'capitaine'}})).refused);
    console.log('Roles OK');
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

// Combat : une attaque validée par le MJ peut poser un statut si elle touche
async function test_combat() {
    console.log('Testing combat');
    const combat = require('../src/controllers/combat');
    const run = async (action, data) => [].concat(await combat.handle({action, data})).pop().data;
    let hero = await new Player().create({discord_id: 'combat-hero', name: 'Héro', combat: 50, moral: 50});
    let id = String(hero.discord_id);

    let {state} = await run('combat-start', {enemies: [{name: 'Yorc', hp: 30, offense: 100, defense: 50, damage: 'faible'}]});
    let yorc = state.enemies[0];

    // Les joueurs en ligne voient les adversaires et leurs PV, pas leurs stats
    const playerView = require('../src/controllers/playerView');
    let seen = playerView.combatState();
    assert.deepEqual(seen.enemies, [{id: yorc.id, name: 'Yorc', hp: 30, maxHp: 30, ko: false}]);
    assert.equal(seen.turn, 1);
    assert.equal(seen.loot, null);
    assert.ok(seen.order.some(f => f.kind === 'enemy' && f.name === 'Yorc'));

    // Touché, dégâts imposés et saignement posé sur la cible
    let {event} = await run('combat-enemy-attack', {enemy_id: yorc.id, discord_id: id, outcome: 'hit', damage: 5,
        status: {status: 'saignement', turns: 2}});
    assert.ok(event.hit);
    assert.strictEqual(event.hp, 495);
    assert.deepStrictEqual(event.status, {key: 'saignement', name: 'Saignement', turns: 2});
    assert.strictEqual(combat.getState().fighters[id].saignement.turns, 2);

    // Raté : pas de statut
    ({event} = await run('combat-enemy-attack', {enemy_id: yorc.id, discord_id: id, outcome: 'miss', status: {status: 'poison'}}));
    assert.ok(!event.hit && !event.status);
    assert.ok(!combat.getState().fighters[id].poison);

    // Attaque d'un joueur : le statut attend son jet, posé s'il touche
    ({state} = await run('combat-target', {enemy_id: yorc.id, discord_id: id, status: {status: 'poison', turns: 4}}));
    assert.strictEqual(state.pending.status.status, 'poison');
    const roll = (result) => ({error: false, data: {discord_id: id, stat: 'combat', module: '', result: result, dice_result: result}});
    let attack = combat.resolveRoll(roll(60));
    assert.ok(attack.data.event.hit && !attack.data.event.ko);
    assert.strictEqual(attack.data.event.status.name, 'Poison');
    assert.strictEqual(attack.data.state.enemies[0].statuses.poison.turns, 4);
    assert.strictEqual(attack.data.state.pending, null);

    // Un jet raté ne pose rien
    await run('combat-status', {target: {enemy_id: yorc.id}, status: 'poison', turns: 0});
    await run('combat-target', {enemy_id: yorc.id, discord_id: id, status: {status: 'etourdi'}});
    attack = combat.resolveRoll(roll(10));
    assert.ok(!attack.data.event.hit && !attack.data.state.enemies[0].statuses.etourdi);

    // Statut personnalisé, toujours posé depuis le panneau des statuts
    ({event} = await run('combat-status', {target: {discord_id: id}, name: 'Brûlure', damage: 2, turns: 3}));
    assert.strictEqual(event.name, 'Brûlure');
    assert.deepStrictEqual(combat.getState().fighters[id]['c-brulure'].damage, [2, 2]);

    await run('combat-end', {});
    assert.equal(playerView.combatState(), null);

    // Initiative : joueurs puis compagnons du moral le plus haut au plus bas,
    // à égalité dans l'ordre d'arrivée ; qui commence selon le mode
    const P = (id, moral) => ({discord_id: id, name: id, moral: moral});
    const foes = [{id: 9, name: 'Yorc'}];
    const names = (o) => o.order.map(f => f.name);
    let o = combat.makeOrder('joueurs', [P('a', 50), P('b', 80), P('c', 80)], [{id: 1, name: 'Zorg', moral: 80}], foes);
    assert.strictEqual(o.first, 'joueurs');
    assert.deepStrictEqual(names(o), ['b', 'c', 'Zorg', 'a', 'Yorc']);
    assert.deepStrictEqual(names(combat.makeOrder('adversaires', [P('a', 90)], [], foes)), ['Yorc', 'a']);
    assert.deepStrictEqual(names(combat.makeOrder('manuel', [P('a', 10), P('b', 90)], [], foes)), ['a', 'b', 'Yorc']);
    o = combat.makeOrder('hasard', [P('a', 75)], [], foes, () => 0);
    assert.strictEqual(o.reason, 'moral', 'aucun joueur au-dessus de 75 : les adversaires commencent');
    assert.strictEqual(o.first, 'adversaires');
    assert.strictEqual(combat.makeOrder('hasard', [P('a', 76)], [], foes, () => 0).first, 'joueurs');
    assert.strictEqual(combat.makeOrder('hasard', [P('a', 76)], [], foes, () => 0.9).first, 'adversaires');

    // Pendant le combat : au suivant, ordre changé à la main, renfort en dernier
    ({state} = await run('combat-start', {enemies: [{name: 'Yorc', hp: 30}], initiative: 'adversaires'}));
    assert.strictEqual(state.order[0].kind, 'enemy');
    assert.strictEqual(state.current, 0);
    assert.strictEqual(state.log[1].type, 'initiative');
    let keys = state.order.map(f => f.kind + ':' + f.id);
    // Les joueurs à 0 de moral (K.O.) des tests précédents sont sautés
    ({state} = await run('combat-next', {}));
    let acting = keys[state.current];
    assert.ok(state.current > 0);
    ({state} = await run('combat-order', {order: keys.slice().reverse()}));
    assert.deepStrictEqual(state.order.map(f => f.kind + ':' + f.id), keys.slice().reverse());
    assert.strictEqual(state.order[state.current].kind + ':' + state.order[state.current].id, acting, 'la main ne change pas');
    ({state} = await run('combat-order', {current: 'player:' + id}));
    assert.strictEqual(state.order[state.current].id, id);
    ({state} = await run('combat-add', {enemy: {name: 'Pirate'}}));
    assert.strictEqual(state.order[state.order.length - 1].name, 'Pirate');
    // Un ennemi K.O. passe son tour ; après le dernier, le tour passe
    await run('combat-hp', {enemy_id: state.enemies[1].id, hp: 0});
    await run('combat-order', {current: keys[0]});
    let turn = state.turn;
    for (let i = 0; i < state.order.length && combat.getState().turn === turn; i++)
        ({state} = await run('combat-next', {}));
    assert.strictEqual(state.turn, turn + 1);
    assert.strictEqual(state.current, 0);
    await run('combat-end', {});
    console.log('Combat OK');
}

// Compagnon tiré au hasard depuis le menu MJ, et ses jets hors combat
function test_random_companion() {
    const allies = require("../src/controllers/allies");
    const names = require("../src/config/companionNames.json");
    const saved = allies.getAllies();
    allies.clear();
    try {
        // Dés toujours à 50 : bonus ou malus, la stat vaut 100
        let ally = allies.randomCompanion({race: 'sylv'}, () => 0.99);
        assert.strictEqual(ally.race, 'Sylv');
        assert.ok(names.sylv.includes(ally.name), 'nom pris dans la liste de la race');
        assert.deepStrictEqual([ally.combat, ally.recon, ally.moral], [100, 100, 100]);
        // Dés à 1 : 51 partout
        assert.strictEqual(allies.randomCompanion({race: 'aku'}, () => 0).pilotage, 51);
        // Race tirée au hasard, nom de sa liste ou de la liste par défaut
        for (let i = 0; i < 20; i++) {
            let any = allies.randomCompanion();
            assert.ok(any.race && any.name.length <= 20);
            for (let stat of ['combat', 'pilotage', 'engineering', 'survival', 'recon'])
                assert.ok(any[stat] >= 51 && any[stat] <= 100);
        }

        // Ajouté par l'action du menu, sans reprendre un nom déjà pris
        let first = allies.handle({action: 'ally-random', data: {race: 'yorc'}}).data.allies[0];
        assert.ok(names.yorc.includes(first.name));
        let second = allies.randomCompanion({race: 'yorc'});
        assert.notStrictEqual(second.name, first.name);

        // Jet hors combat : affiché comme celui d'un joueur (id « npc<id> »)
        let roll = allies.rollAction({id: first.id, stat: 'recon'});
        assert.strictEqual(roll.action, 'roll');
        assert.strictEqual(roll.data.discord_id, 'npc' + first.id);
        assert.strictEqual(roll.data.stat, 'recon');
        assert.strictEqual(roll.data.success, roll.data.result >= 50);
        assert.ok(allies.rollAction({id: first.id, stat: 'moral'}).error);
        assert.ok(allies.rollAction({id: 999, stat: 'recon'}).error);
    }
    finally {
        allies.clear();
        for (let ally of saved)
            allies.handle({action: 'ally-add', data: ally});
    }
    console.log('Random companion OK');
}
