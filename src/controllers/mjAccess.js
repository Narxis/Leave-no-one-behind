// GM access to the server pages.
// The game server runs on the GM's PC and can also be opened from the local
// network. GM is: the server PC itself, or a device that opened the
// GM link (QR code "Panneau MJ sur un téléphone", with the ?mj=… key), which
// then keeps a cookie. Other devices are players: the menu
// hides the GM pages from them, and these pages send them back to the main menu.
const crypto = require('crypto');
const fs = require('fs');
const paths = require('../config/paths');

const COOKIE = 'lnob_mj';
// Game pages and actions reserved for the GM
const MJ_PATHS = [
    '/mj-menu', '/template-card', '/template-card-lieu', '/template-planet', '/planet-lab',
    '/buildCard', '/races', '/items', '/bestiaire', '/end-screen',
    '/reset', '/start', '/land', '/next', '/deck', '/score'
].map(p => p.toLowerCase());

// Express routes ignore case and the trailing "/"
const mjOnly = (path) => MJ_PATHS.includes(String(path).toLowerCase().replace(/\/+$/, ''));

// Key kept in the data folder: the GM link stays the same from one
// game to the next
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
            // Without a data folder, the key is valid for this launch
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

// Middleware: remembers the GM link, then blocks GM pages for players
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

// Link to open on a phone to get GM access
const mjUrl = (base, page) => `${base}/${page || ''}?mj=${getKey()}`;

module.exports = {middleware, isMJ, mjOnly, mjUrl, getKey};
