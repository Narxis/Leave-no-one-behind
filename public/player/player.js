// Page joueur : rejoindre une partie avec son code et attendre le MJ.
// Servie par le relais (lien partagé par le MJ) et ouverte par l'app de
// bureau en mode joueur (adresse du relais dans ?relay=).
(function () {
    const PROTOCOL = 1;
    const $ = (id) => document.getElementById(id);
    const params = new URLSearchParams(location.search);

    // Adresse WebSocket du relais
    const relayBase = (function () {
        let base = params.get('relay') || (/^https?:$/.test(location.protocol) ? location.origin : '');
        return base.replace(/^http/, 'ws').replace(/\/+$/, '');
    })();

    const store = {
        get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
        set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* stockage indisponible */ } }
    };

    // Identifiant du joueur, gardé d'une partie à l'autre pour retrouver son perso
    const playerId = (function () {
        let id = store.get('lnob-player-id');
        if (!/^[A-Za-z0-9_-]{8,64}$/.test(id || '')) {
            let bytes = new Uint8Array(16);
            crypto.getRandomValues(bytes);
            id = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
            store.set('lnob-player-id', id);
        }
        return id;
    })();

    const formatCode = (code) => code.length === 6 ? code.slice(0, 3) + '-' + code.slice(3) : code;
    const cleanCode = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

    let socket = null;
    let leaving = false;
    let retryDelay = 1000;
    let retryTimer = null;
    let session = null; // {code, name}
    let roster = [];
    let me = null;
    let hostOnline = false;

    const show = function (panel) {
        $('join').hidden = panel !== 'join';
        $('lobby').hidden = panel !== 'lobby';
    };

    const setStatus = function (text, kind) {
        $('status').textContent = text;
        $('status').className = 'status ' + (kind || '');
    };

    const showError = function (message) {
        $('join-error').textContent = message;
        $('join-error').hidden = !message;
    };

    const renderPlayers = function () {
        let list = roster.length ? roster : (me ? [me] : []);
        $('players').replaceChildren(...list.map(p => {
            let li = document.createElement('li');
            li.textContent = p.name + (p.id === playerId ? ' (toi)' : '') + (p.online === false ? ' · déconnecté' : '');
            if (p.id === playerId)
                li.className = 'me';
            return li;
        }));
    };

    const renderStatus = function () {
        if (hostOnline)
            setStatus('Connecté. En attente que le MJ lance la partie.', 'ok');
        else
            setStatus('Le MJ est déconnecté : la partie reprendra à son retour.', 'wait');
    };

    const connect = function () {
        clearTimeout(retryTimer);
        let url = relayBase + '/join/' + encodeURIComponent(session.code)
            + '?id=' + encodeURIComponent(playerId)
            + '&name=' + encodeURIComponent(session.name)
            + '&v=' + PROTOCOL;
        let ws = new WebSocket(url);
        let rejected = false;
        socket = ws;

        ws.onmessage = (event) => {
            let msg;
            try { msg = JSON.parse(event.data); } catch (e) { return; }

            if (msg.type === 'welcome') {
                retryDelay = 1000;
                me = msg.you;
                hostOnline = msg.host;
                $('lobby-code').textContent = formatCode(session.code);
                store.set('lnob-last-code', session.code);
                show('lobby');
                renderStatus();
                renderPlayers();
            }
            else if (msg.type === 'host') {
                hostOnline = msg.online;
                renderStatus();
            }
            else if (msg.type === 'error') {
                rejected = true;
                leaving = true;
                show('join');
                $('submit').disabled = false;
                showError(msg.message);
            }
            else if (msg.type === 'msg' && msg.data && msg.data.kind === 'roster') {
                roster = Array.isArray(msg.data.players) ? msg.data.players : [];
                renderPlayers();
            }
        };

        ws.onclose = () => {
            if (socket !== ws)
                return;
            socket = null;
            if (leaving || rejected) {
                $('submit').disabled = false;
                return;
            }
            // Coupure réseau ou relais redémarré : on se reconnecte tout seul
            if (!$('lobby').hidden)
                setStatus('Connexion perdue, reconnexion…', 'wait');
            else {
                $('submit').disabled = false;
                showError('Impossible de joindre le relais. Vérifie ta connexion et réessaie.');
                return;
            }
            retryTimer = setTimeout(connect, retryDelay);
            retryDelay = Math.min(retryDelay * 2, 10000);
        };
    };

    $('join').addEventListener('submit', (event) => {
        event.preventDefault();
        let code = cleanCode($('code').value);
        let name = $('name').value.replace(/\s+/g, ' ').trim();
        if (code.length !== 6)
            return showError('Le code de la partie fait 6 caractères (par exemple K7Q-2MX).');
        if (!name)
            return showError('Choisis un pseudo.');
        if (!relayBase)
            return showError('Adresse du relais inconnue.');
        showError('');
        store.set('lnob-player-name', name);
        session = {code, name};
        roster = [];
        leaving = false;
        $('submit').disabled = true;
        connect();
    });

    $('leave').addEventListener('click', () => {
        leaving = true;
        clearTimeout(retryTimer);
        if (socket)
            socket.close(1000, 'leave');
        show('join');
    });

    // Code reçu dans le lien du MJ, sinon le dernier utilisé
    $('code').value = formatCode(cleanCode(params.get('code') || store.get('lnob-last-code') || ''));
    $('name').value = store.get('lnob-player-name') || '';
    $('code').addEventListener('input', () => {
        let code = cleanCode($('code').value).slice(0, 6);
        $('code').value = code.length > 3 ? code.slice(0, 3) + '-' + code.slice(3) : code;
    });
    ($('code').value && !$('name').value ? $('name') : $('code')).focus();
})();
