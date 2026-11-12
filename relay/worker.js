// LNOB relay on Cloudflare Workers: one Durable Object per lobby.
// It serves the player page (public/player, see wrangler.toml), the
// WebSocket connections on /host, /host/CODE and /join/CODE, and the players'
// Discord login on /auth/discord/* (discord-auth.js).
// The logic is in lobby-core.js, shared with the Node relay.
import {DurableObject} from 'cloudflare:workers';
import core from './lobby-core.js';
import discordAuth from './discord-auth.js';

const {Lobby, newCode, normalizeCode, EXPIRY_MS} = core;

export class LobbyRoom extends DurableObject {

    async lobby() {
        let code = await this.ctx.storage.get('code');
        return new Lobby(code || '', {
            // Only open sockets: during webSocketClose, the one closing is no longer part of them
            sockets: () => this.ctx.getWebSockets()
                .filter(ws => ws.readyState === WebSocket.OPEN)
                .map(ws => ({ws, meta: readMeta(ws)})),
            metaOf: readMeta,
            setMeta: (ws, meta) => {
                try { ws.serializeAttachment(meta); } catch (e) { /* socket closed */ }
            },
            send: (ws, obj) => {
                try { ws.send(JSON.stringify(obj)); } catch (e) { /* socket closed */ }
            },
            close: (ws, code, reason) => {
                try { ws.close(code, reason); } catch (e) { /* already closed */ }
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
            cancelExpiry: () => this.ctx.storage.deleteAlarm(),
            checkProfile: (token) => discordAuth.checkProfile(this.env, token)
        });
    }

    async fetch(request) {
        let url = new URL(request.url);
        let q = url.searchParams;
        let role = q.get('role');

        // New lobby on a code already taken: the worker draws another one
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
            await lobby.playerConnect(server, {id: q.get('id'), name: q.get('name'), protocol: q.get('v'), discord: q.get('discord')});

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

        let auth = await discordAuth.handle(request, env);
        if (auth)
            return auth;
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

        // Invalid code: the "XXXXXX" lobby never exists and answers with a readable error
        let code = normalizeCode(parts[1]) || 'XXXXXX';
        if (parts[0] === 'host')
            return forward(env, code, request, {role: 'host', token: q.get('token') || ''});
        return forward(env, code, request, {role: 'player', id: q.get('id') || '', name: q.get('name') || '', v: q.get('v') || '', discord: q.get('discord') || ''});
    }
};
