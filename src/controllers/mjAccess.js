// Accès MJ aux pages du serveur.
// Le serveur du jeu tourne sur le PC du MJ et s'ouvre aussi depuis le réseau
// local. Est MJ : le PC du serveur lui-même, ou un appareil qui a ouvert le
// lien MJ (QR code « Panneau MJ sur un téléphone », avec la clé ?mj=…), qui
// garde ensuite un cookie. Les autres appareils sont des joueurs : le menu
// leur cache les pages MJ, et ces pages les renvoient au menu principal.
const crypto = require('crypto');
const fs = require('fs');
const paths = require('../config/paths');

const COOKIE = 'lnob_mj';
// Pages et actions de partie réservées au MJ
const MJ_PATHS = [
    '/mj-menu', '/template-card', '/template-card-lieu', '/template-planet', '/planet-lab',
    '/buildCard', '/races', '/items', '/bestiaire', '/end-screen',
    '/reset', '/start', '/land', '/next', '/deck', '/score'
].map(p => p.toLowerCase());

// Les routes d'Express ignorent la casse et le « / » final
const mjOnly = (path) => MJ_PATHS.includes(String(path).toLowerCase().replace(/\/+$/, ''));

// Clé gardée dans le dossier de données : le lien MJ reste le même d'une
// partie à l'autre
let key = null;
const getKey = function () {
    if (key)
        return key;
    let file = paths.storage('mj-key');
    try {
        key = fs.readFileSync(file, 'utf8').trim();
    } catch (e) {
        key = '';
    }
    if (!/^[0-9a-f]{32}$/.test(key)) {
        key = crypto.randomBytes(16).toString('hex');
        try {
            fs.mkdirSync(paths.storage(), {recursive: true});
            fs.writeFileSync(file, key);
        } catch (e) {
            // Sans dossier de données, la clé vaut pour ce lancement
        }
    }
    return key;
};

const isLoopback = (ip) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);

const cookieOf = function (req) {
    let found = String(req.headers.cookie || '').split(';')
        .map(c => c.trim().split('='))
        .find(([name]) => name === COOKIE);
    return found ? decodeURIComponent(found.slice(1).join('=')) : null;
};

const isMJ = function (req) {
    if (isLoopback(req.socket && req.socket.remoteAddress))
        return true;
    return cookieOf(req) === getKey();
};

// Middleware : retient le lien MJ, puis bloque les pages MJ aux joueurs
const middleware = function (req, res, next) {
    if (req.query && req.query.mj === getKey()) {
        res.setHeader('Set-Cookie', `${COOKIE}=${getKey()}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`);
        req.headers.cookie = `${COOKIE}=${getKey()}`;
    }
    let mj = isMJ(req);
    res.locals.isMJ = mj;
    if (!mj && req.method === 'GET' && mjOnly(req.path))
        return res.redirect('/index');
    next();
};

// Lien à ouvrir sur un téléphone pour avoir l'accès MJ
const mjUrl = (base, page) => `${base}/${page || ''}?mj=${getKey()}`;

module.exports = {middleware, isMJ, mjOnly, mjUrl, getKey};
