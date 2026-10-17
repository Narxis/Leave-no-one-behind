// Cœur du relais LNOB, commun au relais Cloudflare (worker.js) et au relais
// Node de développement (dev-server.js).
//
// Un lobby = un code de partie. Le MJ (« host ») s'y connecte depuis le
// serveur du jeu ; les joueurs s'y connectent avec le code. Le relais ne
// connaît pas les règles : il transmet les messages entre le MJ et les
// joueurs, et prévient le MJ des arrivées et des départs.
//
// Messages (JSON) :
//   relais → MJ      {type:'ready', code, token, players}
//                    {type:'join', player}   {type:'leave', id}
//                    {type:'msg', from, data}
//   MJ → relais      {type:'send', to: id | '*', data}   {type:'kick', id}
//   relais → joueur  {type:'welcome', you, host}   {type:'host', online}
//                    {type:'msg', data}   {type:'error', code, message}
//   joueur → relais  {type:'msg', data}
//
// Le stockage (sockets ouverts, jeton du MJ) est fourni par un adaptateur :
//   sockets()            liste des {ws, meta} ouverts sur ce lobby
//   metaOf(ws)           infos attachées à un socket, même en train de se fermer
//   setMeta(ws, meta)    infos attachées à un socket ({role, id, name})
//   send(ws, obj)        envoie un message (ignore un socket fermé)
//   close(ws, code, why) ferme un socket
//   getToken() / setToken(token)   jeton secret du MJ (null = lobby inconnu)
//   expireLater() / cancelExpiry() sans MJ, le lobby est oublié au bout de
//                    EXPIRY_MS : l'adaptateur appelle alors lobby.expire()

const PROTOCOL = 1;
const MAX_PLAYERS = 8;
const MAX_MESSAGE = 64 * 1024;
const CODE_LENGTH = 6;
const EXPIRY_MS = 12 * 60 * 60 * 1000;
// Sans 0/O, 1/I/L : un code se lit et se dicte sans confusion
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const ERRORS = {
    unknown: 'Aucune partie avec ce code.',
    full: 'La partie est complète (' + MAX_PLAYERS + ' joueurs au plus).',
    version: 'Ton app n\'a pas la même version que celle du MJ : mets-la à jour.',
    invalid: 'Code ou pseudo invalide.',
    kicked: 'Le MJ t\'a retiré de la partie.',
    replaced: 'Tu t\'es connecté ailleurs avec le même profil.',
    closed: 'Le MJ a fermé la partie.',
    token: 'Jeton du MJ invalide.'
};

const randomString = function (alphabet, length) {
    let bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    let out = '';
    for (let b of bytes)
        out += alphabet[b % alphabet.length];
    return out;
};

const newCode = () => randomString(CODE_ALPHABET, CODE_LENGTH);
const newToken = () => randomString('abcdefghijklmnopqrstuvwxyz0123456789', 32);

// « k7q-2mx » ou « K7Q 2MX » → « K7Q2MX » ; null si ce n'est pas un code
const normalizeCode = function (value) {
    let code = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== CODE_LENGTH || [...code].some(c => !CODE_ALPHABET.includes(c)))
        return null;
    return code;
};

const formatCode = (code) => code.slice(0, 3) + '-' + code.slice(3);
const cleanName = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 20) || 'Joueur';
const cleanId = (value) => /^[A-Za-z0-9_-]{8,64}$/.test(String(value || '')) ? String(value) : null;

class Lobby {
    constructor(code, adapter) {
        this.code = code;
        this.a = adapter;
    }

    sockets(role) {
        return this.a.sockets().filter(s => s.meta && (!role || s.meta.role === role));
    }

    host() {
        return this.sockets('host')[0] || null;
    }

    players() {
        return this.sockets('player').map(s => ({id: s.meta.id, name: s.meta.name}));
    }

    reject(ws, code) {
        this.a.send(ws, {type: 'error', code: code, message: ERRORS[code] || code});
        this.a.close(ws, 4000, code);
    }

    // Le MJ ouvre un nouveau lobby (isNew) ou revient avec son jeton
    async hostConnect(ws, {isNew, token}) {
        let saved = await this.a.getToken();
        if (isNew) {
            if (saved)
                return false; // code déjà pris : le worker en tire un autre
            saved = newToken();
            await this.a.setToken(saved);
        }
        else if (!saved || token !== saved) {
            this.reject(ws, saved ? 'token' : 'unknown');
            return true;
        }
        for (let old of this.sockets('host'))
            this.a.close(old.ws, 4001, 'replaced');
        this.a.setMeta(ws, {role: 'host'});
        await this.a.cancelExpiry();
        this.a.send(ws, {type: 'ready', code: this.code, token: saved, players: this.players()});
        for (let p of this.sockets('player'))
            this.a.send(p.ws, {type: 'host', online: true});
        return true;
    }

    async playerConnect(ws, {id, name, protocol}) {
        id = cleanId(id);
        if (!id)
            return this.reject(ws, 'invalid');
        if (!await this.a.getToken())
            return this.reject(ws, 'unknown');
        if (parseInt(protocol) !== PROTOCOL)
            return this.reject(ws, 'version');

        let same = this.sockets('player').filter(s => s.meta.id === id);
        if (!same.length && this.sockets('player').length >= MAX_PLAYERS)
            return this.reject(ws, 'full');
        // Même joueur reconnecté (ou ouvert dans un autre onglet) : la
        // nouvelle connexion remplace l'ancienne
        for (let old of same) {
            this.a.setMeta(old.ws, null);
            this.reject(old.ws, 'replaced');
        }

        let player = {id: id, name: cleanName(name)};
        this.a.setMeta(ws, Object.assign({role: 'player'}, player));
        let host = this.host();
        this.a.send(ws, {type: 'welcome', you: player, code: this.code, host: !!host});
        if (host)
            this.a.send(host.ws, {type: 'join', player: player});
    }

    async message(ws, raw) {
        let size = typeof raw === 'string' ? raw.length : raw.byteLength;
        if (size > MAX_MESSAGE)
            return;
        let msg;
        try {
            msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
        } catch (e) {
            return;
        }
        let meta = this.a.metaOf(ws);
        if (!meta || !msg || typeof msg !== 'object')
            return;

        if (meta.role === 'player') {
            let host = this.host();
            if (msg.type === 'msg' && host)
                this.a.send(host.ws, {type: 'msg', from: meta.id, data: msg.data});
            return;
        }

        // Messages du MJ
        if (msg.type === 'send') {
            for (let p of this.sockets('player'))
                if (msg.to === '*' || msg.to === p.meta.id)
                    this.a.send(p.ws, {type: 'msg', data: msg.data});
        }
        else if (msg.type === 'kick') {
            for (let p of this.sockets('player').filter(s => s.meta.id === msg.id)) {
                this.a.setMeta(p.ws, null);
                this.reject(p.ws, 'kicked');
                this.a.send(ws, {type: 'leave', id: msg.id});
            }
        }
        else if (msg.type === 'close') {
            // Le MJ ferme la partie : le code ne sert plus
            for (let p of this.sockets('player')) {
                this.a.setMeta(p.ws, null);
                this.reject(p.ws, 'closed');
            }
            await this.a.setToken(null);
            this.a.setMeta(ws, null);
            this.a.close(ws, 1000, 'closed');
        }
    }

    // Le MJ n'est pas revenu à temps : la partie est oubliée
    async expire() {
        if (this.host())
            return;
        for (let p of this.sockets('player')) {
            this.a.setMeta(p.ws, null);
            this.reject(p.ws, 'closed');
        }
        await this.a.setToken(null);
    }

    async closed(ws) {
        let meta = this.a.metaOf(ws);
        if (!meta)
            return;
        this.a.setMeta(ws, null);
        if (meta.role === 'player') {
            let host = this.host();
            if (host)
                this.a.send(host.ws, {type: 'leave', id: meta.id});
        }
        else if (!this.host()) {
            for (let p of this.sockets('player'))
                this.a.send(p.ws, {type: 'host', online: false});
            await this.a.expireLater();
        }
    }
}

module.exports = {Lobby, PROTOCOL, EXPIRY_MS, MAX_PLAYERS, ERRORS, newCode, normalizeCode, formatCode, cleanName};
