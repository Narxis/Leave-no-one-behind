// Connexion Discord des joueurs (OAuth2, scope « identify » seulement), sans
// le bot. Commun au relais Cloudflare (worker.js) et au relais Node
// (dev-server.js).
//
// Le relais est le seul endroit fixe et public de la partie en ligne : c'est
// lui qui reçoit le retour de Discord et échange le code contre un jeton, avec
// le secret de l'application gardé dans ses variables (jamais dans la page
// joueur ni chez le MJ). Il ne garde rien : il renvoie à la page joueur un
// « profil signé » (id, pseudo, URL de l'avatar), que la page présente en
// rejoignant une partie. Le relais vérifie la signature : un joueur ne peut
// pas se faire passer pour le compte Discord d'un autre.
//
// Sans DISCORD_CLIENT_ID et DISCORD_CLIENT_SECRET, tout est désactivé :
// /auth/discord/config répond {enabled: false} et la page n'affiche pas le
// bouton. Réglage : voir relay/README.md.
//
// Routes :
//   GET /auth/discord/config    {enabled}
//   GET /auth/discord/login     → Discord (?app=1 depuis l'app de bureau)
//   GET /auth/discord/callback  retour de Discord → page joueur, profil dans #discord=
//   GET /auth/discord/done      (app de bureau : l'app récupère ?profile= au passage)

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

// Signature HMAC-SHA256, avec une clé tirée du secret de l'application
const keyOf = (secret) => crypto.subtle.importKey('raw', encoder.encode('lnob-profile:' + secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign', 'verify']);

const sign = async function (secret, payload) {
    let body = base64url(encoder.encode(JSON.stringify(payload)));
    let mac = await crypto.subtle.sign('HMAC', await keyOf(secret), encoder.encode(body));
    return body + '.' + base64url(mac);
};

// Contenu d'un jeton signé et pas expiré, sinon null
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

// Ce que le jeu garde du compte : id, pseudo affiché, URL de l'avatar
const profileOf = function (user) {
    let id = String(user.id || '');
    let avatar = user.avatar
        ? 'https://cdn.discordapp.com/avatars/' + id + '/' + user.avatar + '.png?size=64'
        : 'https://cdn.discordapp.com/embed/avatars/' + Number((BigInt(id || 0) >> 22n) % 6n) + '.png';
    return {id: id, name: String(user.global_name || user.username || '').slice(0, 32), avatar: avatar};
};

// Profil signé présenté par un joueur → {id, name, avatar}, ou null
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

// Réponse aux routes /auth/discord/*, null pour les autres
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
            return redirect(url.origin + '/'); // refusé sur Discord
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
        // Le jeton Discord n'est pas gardé : seulement le profil, signé
        let profile = await sign(config.secret, Object.assign({kind: 'profile', exp: Date.now() + PROFILE_DAYS * 86400000}, profileOf(user)));
        if (state.app)
            return redirect(url.origin + '/auth/discord/done?profile=' + encodeURIComponent(profile));
        return redirect(url.origin + '/#discord=' + encodeURIComponent(profile));
    }

    // App de bureau : elle intercepte cette adresse ; dans un navigateur, on
    // revient simplement à la page joueur
    if (route === 'done')
        return redirect(url.origin + '/#discord=' + encodeURIComponent(url.searchParams.get('profile') || ''));

    return page(404, 'Introuvable');
};

module.exports = {handle, checkProfile, configOf, sign, verify, profileOf};
