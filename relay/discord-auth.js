// Players' Discord login (OAuth2, "identify" scope only), without
// the bot. Shared by the Cloudflare relay (worker.js) and the Node relay
// (dev-server.js).
//
// The relay is the only fixed and public place of the online game: it is
// the one receiving the return from Discord and exchanging the code for a token, with
// the application secret kept in its variables (never in the player page
// nor on the GM side). It keeps nothing: it sends back to the player page a
// "signed profile" (id, nickname, avatar URL), which the page presents when
// joining a game. The relay checks the signature: a player can't
// impersonate someone else's Discord account.
//
// Without DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET, everything is disabled:
// /auth/discord/config answers {enabled: false} and the page doesn't show the
// button. Setup: see relay/README.md.
//
// Routes:
//   GET /auth/discord/config    {enabled}
//   GET /auth/discord/login     → Discord (?app=1 from the desktop app)
//   GET /auth/discord/callback  return from Discord → player page, profile in #discord=
//   GET /auth/discord/done      (desktop app: the app grabs ?profile= on the way)

const API = 'https://discord.com/api/v10';
const PROFILE_DAYS = 30;
const STATE_MINUTES = 10;

const encoder = new TextEncoder();

const base64url = (bytes) => {
    let text = '';
    for (let b of new Uint8Array(bytes))
        text += String.fromCharCode(b);
    return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64url = (text) => {
    let raw = atob(String(text).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
};

const configOf = (env) => {
    let id = env && String(env.DISCORD_CLIENT_ID || '').trim();
    let secret = env && String(env.DISCORD_CLIENT_SECRET || '').trim();
    return id && secret ? {id, secret} : null;
};

// HMAC-SHA256 signature, with a key derived from the application secret
const keyOf = (secret) => crypto.subtle.importKey('raw', encoder.encode('lnob-profile:' + secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign', 'verify']);

const sign = async function (secret, payload) {
    let body = base64url(encoder.encode(JSON.stringify(payload)));
    let mac = await crypto.subtle.sign('HMAC', await keyOf(secret), encoder.encode(body));
    return body + '.' + base64url(mac);
};

// Content of a signed, unexpired token, otherwise null
const verify = async function (secret, token) {
    try {
        let [body, mac] = String(token || '').split('.');
        if (!body || !mac || !secret)
            return null;
        if (!await crypto.subtle.verify('HMAC', await keyOf(secret), fromBase64url(mac), encoder.encode(body)))
            return null;
        let payload = JSON.parse(new TextDecoder().decode(fromBase64url(body)));
        return payload && payload.exp > Date.now() ? payload : null;
    } catch (e) {
        return null;
    }
};

// What the game keeps from the account: id, display name, avatar URL
const profileOf = function (user) {
    let id = String(user.id || '');
    let avatar = user.avatar
        ? 'https://cdn.discordapp.com/avatars/' + id + '/' + user.avatar + '.png?size=64'
        : 'https://cdn.discordapp.com/embed/avatars/' + Number((BigInt(id || 0) >> 22n) % 6n) + '.png';
    return {id: id, name: String(user.global_name || user.username || '').slice(0, 32), avatar: avatar};
};

// Signed profile presented by a player → {id, name, avatar}, or null
const checkProfile = async function (env, token) {
    let config = configOf(env);
    let payload = config && token ? await verify(config.secret, token) : null;
    if (!payload || payload.kind !== 'profile' || !/^\d{5,25}$/.test(payload.id) || !/^https:\/\/cdn\.discordapp\.com\//.test(payload.avatar))
        return null;
    return {id: payload.id, name: String(payload.name || '').slice(0, 32), avatar: payload.avatar};
};

const redirect = (location) => new Response(null, {status: 302, headers: {location: location, 'cache-control': 'no-store'}});
const json = (obj) => new Response(JSON.stringify(obj), {headers: {'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store'}});
const page = (status, text) => new Response('<!doctype html><meta charset="utf-8"><title>LNOB</title><body style="font-family:sans-serif;background:#0b0c14;color:#eee;padding:24px"><p>' + text + '</p><p><a style="color:#4fd8e0" href="/">Retour</a></p>', {status: status, headers: {'content-type': 'text/html; charset=utf-8'}});

// Answer to the /auth/discord/* routes, null for the others
const handle = async function (request, env) {
    let url = new URL(request.url);
    if (!url.pathname.startsWith('/auth/discord/'))
        return null;
    let route = url.pathname.slice('/auth/discord/'.length);
    let config = configOf(env);
    if (route === 'config')
        return json({enabled: !!config});
    if (!config)
        return page(404, 'La connexion Discord n\'est pas configurée sur ce relais.');
    let callback = url.origin + '/auth/discord/callback';

    if (route === 'login') {
        let state = await sign(config.secret, {kind: 'state', app: url.searchParams.get('app') === '1', exp: Date.now() + STATE_MINUTES * 60000});
        let params = new URLSearchParams({client_id: config.id, response_type: 'code', scope: 'identify', redirect_uri: callback, state: state, prompt: 'none'});
        return redirect('https://discord.com/oauth2/authorize?' + params);
    }

    if (route === 'callback') {
        let state = await verify(config.secret, url.searchParams.get('state'));
        if (!state || state.kind !== 'state')
            return page(400, 'Connexion expirée : réessaie depuis la page de la partie.');
        let code = url.searchParams.get('code');
        if (!code)
            return redirect(url.origin + '/'); // refused on Discord
        let token = await fetch(API + '/oauth2/token', {
            method: 'POST',
            headers: {'content-type': 'application/x-www-form-urlencoded'},
            body: new URLSearchParams({client_id: config.id, client_secret: config.secret, grant_type: 'authorization_code', code: code, redirect_uri: callback})
        }).then(r => r.ok ? r.json() : null).catch(() => null);
        let user = token && token.access_token
            ? await fetch(API + '/users/@me', {headers: {authorization: 'Bearer ' + token.access_token}}).then(r => r.ok ? r.json() : null).catch(() => null)
            : null;
        if (!user || !user.id)
            return page(502, 'Discord n\'a pas répondu : réessaie dans un instant.');
        // The Discord token isn't kept: only the signed profile
        let profile = await sign(config.secret, Object.assign({kind: 'profile', exp: Date.now() + PROFILE_DAYS * 86400000}, profileOf(user)));
        if (state.app)
            return redirect(url.origin + '/auth/discord/done?profile=' + encodeURIComponent(profile));
        return redirect(url.origin + '/#discord=' + encodeURIComponent(profile));
    }

    // Desktop app: it intercepts this address; in a browser, we
    // simply go back to the player page
    if (route === 'done')
        return redirect(url.origin + '/#discord=' + encodeURIComponent(url.searchParams.get('profile') || ''));

    return page(404, 'Introuvable');
};

module.exports = {handle, checkProfile, configOf, sign, verify, profileOf};
