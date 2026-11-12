// Relay tests (relay/lobby-core.js) with the Node development relay
const assert = require('assert');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const relay = require('../relay/dev-server');
const {MAX_PLAYERS} = require('../relay/lobby-core');

// Test client: keeps the received messages and waits for the requested ones
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
    // RELAY_URL=http://127.0.0.1:8787: tests an already running relay (wrangler dev)
    let external = process.env.RELAY_URL;
    let {server, port} = external ? {} : await relay.start(0, {expiryMs: 300});
    let httpBase = external ? external.replace(/\/+$/, '') : 'http://127.0.0.1:' + port;
    let base = httpBase.replace(/^http/, 'ws');
    let join = (code, id, name, v) => client(`${base}/join/${code}?id=${id}&name=${encodeURIComponent(name)}&v=${v || 1}`);

    console.log('Testing relay');

    // Player page served on /
    let page = await get(httpBase + '/');
    assert.equal(page.status, 200);
    assert.ok(page.body.includes('Rejoindre'));
    assert.equal((await get(httpBase + '/../package.json')).status, 404);

    // The GM opens a lobby
    let host = client(base + '/host');
    let ready = await host.next('ready');
    assert.match(ready.code, /^[A-Z2-9]{6}$/);
    assert.ok(ready.token.length >= 32);
    assert.deepEqual(ready.players, []);
    let code = ready.code;

    // A player joins (code typed in lowercase with a dash)
    let alice = join(code.slice(0, 3).toLowerCase() + '-' + code.slice(3), 'alice-0001', 'Alice');
    let welcome = await alice.next('welcome');
    assert.equal(welcome.host, true);
    assert.deepEqual(welcome.you, {id: 'alice-0001', name: 'Alice'});
    assert.deepEqual((await host.next('join')).player, {id: 'alice-0001', name: 'Alice'});

    // Messages in both directions
    alice.json({type: 'msg', data: {kind: 'chat', text: 'salut'}});
    assert.deepEqual(await host.next('msg'), {type: 'msg', from: 'alice-0001', data: {kind: 'chat', text: 'salut'}});
    host.json({type: 'send', to: '*', data: {kind: 'roster', players: []}});
    assert.equal((await alice.next('msg')).data.kind, 'roster');

    // Private message: only the recipient gets it
    let bob = join(code, 'bob-00000001', 'Bob');
    await bob.next('welcome');
    await host.next('join', m => m.player.id === 'bob-00000001');
    host.json({type: 'send', to: 'bob-00000001', data: {kind: 'secret'}});
    assert.equal((await bob.next('msg')).data.kind, 'secret');
    await sleep(50);
    await assert.rejects(alice.next('msg', m => m.data.kind === 'secret'));

    // Errors: unknown code, wrong version, invalid id
    for (let [ws, err] of [[join('ABCDEF', 'carol-0001', 'Carol'), 'unknown'], [join(code, 'carol-0001', 'Carol', 2), 'version'], [join(code, 'x', 'Carol'), 'invalid']]) {
        assert.equal((await ws.next('error')).code, err);
        assert.equal(await ws.closed, 4000);
    }

    // Same player connected elsewhere: the old connection is replaced, with no departure announced
    let alice2 = join(code, 'alice-0001', 'Alice');
    assert.equal((await alice.next('error')).code, 'replaced');
    await alice2.next('welcome');
    await host.next('join', m => m.player.id === 'alice-0001');
    await sleep(50);
    await assert.rejects(host.next('leave', m => m.id === 'alice-0001'));

    // A player leaves
    bob.close();
    assert.equal((await host.next('leave')).id, 'bob-00000001');

    // The GM disconnects then comes back with their token
    host.close();
    assert.equal((await alice2.next('host')).online, false);
    let badHost = client(`${base}/host/${code}?token=faux`);
    assert.equal((await badHost.next('error')).code, 'token');
    host = client(`${base}/host/${code}?token=${ready.token}`);
    let back = await host.next('ready');
    assert.equal(back.code, code);
    assert.deepEqual(back.players, [{id: 'alice-0001', name: 'Alice'}]);
    assert.equal((await alice2.next('host')).online, true);

    // Full game
    let others = [];
    for (let i = 1; i < MAX_PLAYERS; i++) {
        let ws = join(code, 'player-000' + i, 'P' + i);
        await ws.next('welcome');
        others.push(ws);
    }
    let late = join(code, 'player-late', 'Late');
    assert.equal((await late.next('error')).code, 'full');

    // The GM removes a player
    host.json({type: 'kick', id: 'player-0001'});
    assert.equal((await others[0].next('error')).code, 'kicked');
    assert.equal((await host.next('leave', m => m.id === 'player-0001')).id, 'player-0001');

    // The GM closes the game: the code is no longer used
    host.json({type: 'close'});
    assert.equal((await alice2.next('error')).code, 'closed');
    await host.closed;
    assert.equal((await join(code, 'alice-0001', 'Alice').next('error')).code, 'unknown');

    // GM gone too long: the lobby is forgotten (shortened delay locally)
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
    // Without a Discord application configured: login disabled
    if (!process.env.DISCORD_CLIENT_ID)
        assert.deepEqual(JSON.parse((await get(httpBase + '/auth/discord/config')).body), {enabled: false});
    server.close();
    await test_discord();
    console.log('Relay OK');
}

// Discord login: the relay signs the profile and refuses those it didn't sign
async function test_discord() {
    console.log('Testing Discord login');
    const auth = require('../relay/discord-auth');
    const env = {DISCORD_CLIENT_ID: '1234567890', DISCORD_CLIENT_SECRET: 'secret-de-test'};
    let {server, port} = await relay.start(0, {env: env});
    let httpBase = 'http://127.0.0.1:' + port;
    let base = httpBase.replace(/^http/, 'ws');

    assert.deepEqual(JSON.parse((await get(httpBase + '/auth/discord/config')).body), {enabled: true});
    // To Discord: identify scope only, return to the relay, signed state
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

    // What the game keeps: id, nickname, avatar URL
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
    // Profile from another relay, expired or not a profile at all: ignored
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
