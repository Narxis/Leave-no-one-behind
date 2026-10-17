// Relais LNOB sur Cloudflare Workers : un Durable Object par lobby.
// Il sert la page joueur (public/player, voir wrangler.toml) et les
// connexions WebSocket sur /host, /host/CODE et /join/CODE.
// La logique est dans lobby-core.js, partagée avec le relais Node.
import {DurableObject} from 'cloudflare:workers';
import core from './lobby-core.js';

const {Lobby, newCode, normalizeCode, EXPIRY_MS} = core;

export class LobbyRoom extends DurableObject {

    async lobby() {
        let code = await this.ctx.storage.get('code');
        return new Lobby(code || '', {
            // Seuls les sockets ouverts : pendant webSocketClose, celui qui se ferme n'en fait plus partie
            sockets: () => this.ctx.getWebSockets()
                .filter(ws => ws.readyState === WebSocket.OPEN)
                .map(ws => ({ws, meta: readMeta(ws)})),
            metaOf: readMeta,
            setMeta: (ws, meta) => {
                try { ws.serializeAttachment(meta); } catch (e) { /* socket fermé */ }
            },
            send: (ws, obj) => {
                try { ws.send(JSON.stringify(obj)); } catch (e) { /* socket fermé */ }
            },
            close: (ws, code, reason) => {
                try { ws.close(code, reason); } catch (e) { /* déjà fermé */ }
            },
            getToken: async () => (await this.ctx.storage.get('token')) || null,
            setToken: async (token) => {
                if (token)
                    await this.ctx.storage.put('token', token);
                else {
                    await this.ctx.storage.deleteAlarm();
                    await this.ctx.storage.deleteAll();
                }
            },
            expireLater: () => this.ctx.storage.setAlarm(Date.now() + EXPIRY_MS),
            cancelExpiry: () => this.ctx.storage.deleteAlarm()
        });
    }

    async fetch(request) {
        let url = new URL(request.url);
        let q = url.searchParams;
        let role = q.get('role');

        // Nouveau lobby sur un code déjà pris : le worker en tire un autre
        if (role === 'new-host' && await this.ctx.storage.get('token'))
            return new Response('code pris', {status: 409});
        if (role === 'new-host')
            await this.ctx.storage.put('code', q.get('code'));

        let pair = new WebSocketPair();
        let [client, server] = Object.values(pair);
        this.ctx.acceptWebSocket(server);
        server.serializeAttachment(null);

        let lobby = await this.lobby();
        if (role === 'new-host')
            await lobby.hostConnect(server, {isNew: true});
        else if (role === 'host')
            await lobby.hostConnect(server, {isNew: false, token: q.get('token')});
        else
            await lobby.playerConnect(server, {id: q.get('id'), name: q.get('name'), protocol: q.get('v')});

        return new Response(null, {status: 101, webSocket: client});
    }

    async webSocketMessage(ws, message) {
        await (await this.lobby()).message(ws, message);
    }

    async webSocketClose(ws) {
        await (await this.lobby()).closed(ws);
    }

    async webSocketError(ws) {
        await (await this.lobby()).closed(ws);
    }

    async alarm() {
        await (await this.lobby()).expire();
    }
}

const readMeta = function (ws) {
    try {
        return ws.deserializeAttachment() || null;
    } catch (e) {
        return null;
    }
};

const forward = function (env, code, request, params) {
    let url = new URL(request.url);
    url.pathname = '/connect';
    url.search = new URLSearchParams(Object.assign({code: code}, params)).toString();
    return env.LOBBY.get(env.LOBBY.idFromName(code)).fetch(new Request(url, request));
};

export default {
    async fetch(request, env) {
        let url = new URL(request.url);
        let parts = url.pathname.split('/').filter(Boolean);
        let q = url.searchParams;

        if (parts[0] !== 'host' && parts[0] !== 'join')
            return env.ASSETS.fetch(request);
        if (request.headers.get('Upgrade') !== 'websocket')
            return new Response('WebSocket attendu', {status: 426});

        if (parts[0] === 'host' && parts.length === 1) {
            for (let i = 0; i < 10; i++) {
                let code = newCode();
                let response = await forward(env, code, request, {role: 'new-host'});
                if (response.status !== 409)
                    return response;
            }
            return new Response('Aucun code libre', {status: 503});
        }

        // Code invalide : le lobby « XXXXXX » n'existe jamais et répond par une erreur lisible
        let code = normalizeCode(parts[1]) || 'XXXXXX';
        if (parts[0] === 'host')
            return forward(env, code, request, {role: 'host', token: q.get('token') || ''});
        return forward(env, code, request, {role: 'player', id: q.get('id') || '', name: q.get('name') || '', v: q.get('v') || ''});
    }
};
