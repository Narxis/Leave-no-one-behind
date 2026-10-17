// Tests du relais (relay/lobby-core.js) avec le relais Node de développement
const assert = require('assert');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const relay = require('../relay/dev-server');
const {MAX_PLAYERS} = require('../relay/lobby-core');

// Client de test : garde les messages reçus et attend ceux qu'on demande
const client = function (url) {
    let ws = new WebSocket(url);
    let inbox = [];
    let waiters = [];
    ws.on('message', (data) => {
        let msg = JSON.parse(data.toString());
        let i = waiters.findIndex(w => w.match(msg));
        if (i >= 0)
            waiters.splice(i, 1)[0].resolve(msg);
        else
            inbox.push(msg);
    });
    ws.closed = new Promise(resolve => ws.on('close', (code) => resolve(code)));
    ws.next = (type, extra) => new Promise((resolve, reject) => {
        let match = (m) => m.type === type && (!extra || extra(m));
        let i = inbox.findIndex(match);
        if (i >= 0)
            return resolve(inbox.splice(i, 1)[0]);
        let timer = setTimeout(() => reject(new Error('pas de message ' + type)), 2000);
        waiters.push({match, resolve: (m) => { clearTimeout(timer); resolve(m); }});
    });
    ws.json = (obj) => ws.send(JSON.stringify(obj));
    return ws;
};

const get = (url) => new Promise((resolve, reject) => {
    (url.startsWith('https:') ? https : http).get(url, res => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve({status: res.statusCode, body, headers: res.headers}));
    }).on('error', reject);
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function test() {
    // RELAY_URL=http://127.0.0.1:8787 : teste un relais déjà lancé (wrangler dev)
    let external = process.env.RELAY_URL;
    let {server, port} = external ? {} : await relay.start(0, {expiryMs: 300});
    let httpBase = external ? external.replace(/\/+$/, '') : 'http://127.0.0.1:' + port;
    let base = httpBase.replace(/^http/, 'ws');
    let join = (code, id, name, v) => client(`${base}/join/${code}?id=${id}&name=${encodeURIComponent(name)}&v=${v || 1}`);

    console.log('Testing relay');

    // Page joueur servie sur /
    let page = await get(httpBase + '/');
    assert.equal(page.status, 200);
    assert.ok(page.body.includes('Rejoindre'));
    assert.equal((await get(httpBase + '/../package.json')).status, 404);

    // Le MJ ouvre un lobby
    let host = client(base + '/host');
    let ready = await host.next('ready');
    assert.match(ready.code, /^[A-Z2-9]{6}$/);
    assert.ok(ready.token.length >= 32);
    assert.deepEqual(ready.players, []);
    let code = ready.code;

    // Un joueur rejoint (code tapé en minuscules avec un tiret)
    let alice = join(code.slice(0, 3).toLowerCase() + '-' + code.slice(3), 'alice-0001', 'Alice');
    let welcome = await alice.next('welcome');
    assert.equal(welcome.host, true);
    assert.deepEqual(welcome.you, {id: 'alice-0001', name: 'Alice'});
    assert.deepEqual((await host.next('join')).player, {id: 'alice-0001', name: 'Alice'});

    // Messages dans les deux sens
    alice.json({type: 'msg', data: {kind: 'chat', text: 'salut'}});
    assert.deepEqual(await host.next('msg'), {type: 'msg', from: 'alice-0001', data: {kind: 'chat', text: 'salut'}});
    host.json({type: 'send', to: '*', data: {kind: 'roster', players: []}});
    assert.equal((await alice.next('msg')).data.kind, 'roster');

    // Message privé : seul le destinataire le reçoit
    let bob = join(code, 'bob-00000001', 'Bob');
    await bob.next('welcome');
    await host.next('join', m => m.player.id === 'bob-00000001');
    host.json({type: 'send', to: 'bob-00000001', data: {kind: 'secret'}});
    assert.equal((await bob.next('msg')).data.kind, 'secret');
    await sleep(50);
    await assert.rejects(alice.next('msg', m => m.data.kind === 'secret'));

    // Erreurs : code inconnu, mauvaise version, identifiant invalide
    for (let [ws, err] of [[join('ABCDEF', 'carol-0001', 'Carol'), 'unknown'], [join(code, 'carol-0001', 'Carol', 2), 'version'], [join(code, 'x', 'Carol'), 'invalid']]) {
        assert.equal((await ws.next('error')).code, err);
        assert.equal(await ws.closed, 4000);
    }

    // Même joueur connecté ailleurs : l'ancienne connexion est remplacée, sans départ annoncé
    let alice2 = join(code, 'alice-0001', 'Alice');
    assert.equal((await alice.next('error')).code, 'replaced');
    await alice2.next('welcome');
    await host.next('join', m => m.player.id === 'alice-0001');
    await sleep(50);
    await assert.rejects(host.next('leave', m => m.id === 'alice-0001'));

    // Départ d'un joueur
    bob.close();
    assert.equal((await host.next('leave')).id, 'bob-00000001');

    // Le MJ se déconnecte puis revient avec son jeton
    host.close();
    assert.equal((await alice2.next('host')).online, false);
    let badHost = client(`${base}/host/${code}?token=faux`);
    assert.equal((await badHost.next('error')).code, 'token');
    host = client(`${base}/host/${code}?token=${ready.token}`);
    let back = await host.next('ready');
    assert.equal(back.code, code);
    assert.deepEqual(back.players, [{id: 'alice-0001', name: 'Alice'}]);
    assert.equal((await alice2.next('host')).online, true);

    // Partie complète
    let others = [];
    for (let i = 1; i < MAX_PLAYERS; i++) {
        let ws = join(code, 'player-000' + i, 'P' + i);
        await ws.next('welcome');
        others.push(ws);
    }
    let late = join(code, 'player-late', 'Late');
    assert.equal((await late.next('error')).code, 'full');

    // Le MJ retire un joueur
    host.json({type: 'kick', id: 'player-0001'});
    assert.equal((await others[0].next('error')).code, 'kicked');
    assert.equal((await host.next('leave', m => m.id === 'player-0001')).id, 'player-0001');

    // Le MJ ferme la partie : le code ne sert plus
    host.json({type: 'close'});
    assert.equal((await alice2.next('error')).code, 'closed');
    await host.closed;
    assert.equal((await join(code, 'alice-0001', 'Alice').next('error')).code, 'unknown');

    // MJ parti trop longtemps : le lobby est oublié (délai raccourci en local)
    if (external) {
        for (let ws of [alice2, ...others])
            ws.terminate();
        console.log('Relay OK');
        return;
    }
    let host2 = client(base + '/host');
    let code2 = (await host2.next('ready')).code;
    let dave = join(code2, 'dave-0001', 'Dave');
    await dave.next('welcome');
    host2.close();
    assert.equal((await dave.next('host')).online, false);
    assert.equal((await dave.next('error')).code, 'closed');

    for (let ws of [alice2, ...others])
        ws.terminate();
    // Sans application Discord réglée : connexion désactivée
    if (!process.env.DISCORD_CLIENT_ID)
        assert.deepEqual(JSON.parse((await get(httpBase + '/auth/discord/config')).body), {enabled: false});
    server.close();
    await test_discord();
    console.log('Relay OK');
}

// Connexion Discord : le relais signe le profil et refuse ceux qu'il n'a pas signés
async function test_discord() {
    console.log('Testing Discord login');
    const auth = require('../relay/discord-auth');
    const env = {DISCORD_CLIENT_ID: '1234567890', DISCORD_CLIENT_SECRET: 'secret-de-test'};
    let {server, port} = await relay.start(0, {env: env});
    let httpBase = 'http://127.0.0.1:' + port;
    let base = httpBase.replace(/^http/, 'ws');

    assert.deepEqual(JSON.parse((await get(httpBase + '/auth/discord/config')).body), {enabled: true});
    // Vers Discord : scope identify seulement, retour sur le relais, état signé
    let login = await get(httpBase + '/auth/discord/login');
    assert.equal(login.status, 302);
    let to = new URL(login.headers.location);
    assert.equal(to.origin + to.pathname, 'https://discord.com/oauth2/authorize');
    assert.equal(to.searchParams.get('scope'), 'identify');
    assert.equal(to.searchParams.get('client_id'), '1234567890');
    assert.equal(to.searchParams.get('redirect_uri'), httpBase + '/auth/discord/callback');
    assert.ok(!login.headers.location.includes('secret-de-test'));
    assert.equal((await auth.verify(env.DISCORD_CLIENT_SECRET, to.searchParams.get('state'))).kind, 'state');
    assert.equal((await get(httpBase + '/auth/discord/callback?code=x&state=faux')).status, 400);

    // Ce que le jeu garde : id, pseudo, URL de l'avatar
    assert.deepEqual(auth.profileOf({id: '80351110224678912', username: 'nelly', global_name: 'Nelly', avatar: 'abc', email: 'x@y.z'}),
        {id: '80351110224678912', name: 'Nelly', avatar: 'https://cdn.discordapp.com/avatars/80351110224678912/abc.png?size=64'});
    assert.match(auth.profileOf({id: '80351110224678912', username: 'nelly', avatar: null}).avatar, /^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/[0-5]\.png$/);

    let profile = Object.assign({kind: 'profile', exp: Date.now() + 60000}, auth.profileOf({id: '80351110224678912', username: 'nelly', avatar: 'abc'}));
    let good = await auth.sign(env.DISCORD_CLIENT_SECRET, profile);
    let forged = await auth.sign('autre-secret', profile);
    let expired = await auth.sign(env.DISCORD_CLIENT_SECRET, Object.assign({}, profile, {exp: Date.now() - 1}));
    let state = await auth.sign(env.DISCORD_CLIENT_SECRET, {kind: 'state', exp: Date.now() + 60000});

    let host = client(base + '/host');
    let code = (await host.next('ready')).code;
    let join = (id, token) => client(`${base}/join/${code}?id=${id}&name=Nelly&v=1&discord=${encodeURIComponent(token)}`);
    let nelly = join('nelly-0001', good);
    let expected = {id: '80351110224678912', name: 'nelly', avatar: 'https://cdn.discordapp.com/avatars/80351110224678912/abc.png?size=64'};
    assert.deepEqual((await nelly.next('welcome')).you.discord, expected);
    assert.deepEqual((await host.next('join')).player.discord, expected);
    // Profil d'un autre relais, expiré ou qui n'en est pas un : ignoré
    for (let [i, token] of [forged, expired, state, 'n.importe.quoi'].entries()) {
        let ws = join('other-000' + i, token);
        assert.equal((await ws.next('welcome')).you.discord, undefined);
        assert.equal((await host.next('join')).player.discord, undefined);
        ws.terminate();
    }
    nelly.terminate();
    host.terminate();
    server.close();
    console.log('Discord login OK');
}

test().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
});
