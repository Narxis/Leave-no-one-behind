// Page joueur : rejoindre une partie avec son code, puis suivre la partie.
// Servie par le relais (lien partagé par le MJ) et ouverte par l'app de
// bureau en mode joueur (adresse du relais dans ?relay=).
//
// Le MJ envoie l'état du jeu (kind 'game') et celui du joueur (kind 'you') ;
// le joueur envoie des actions ({kind:'action'}), que le MJ accepte ou non.
(function () {
    const PROTOCOL = 1;
    const $ = (id) => document.getElementById(id);
    const params = new URLSearchParams(location.search);

    const STAT_LABELS = {combat: 'Combat', pilotage: 'Pilotage', engineering: 'Ingénierie', survival: 'Survie', recon: 'Reconnaissance', moral: 'Moral'};
    const ROLL_MODULES = [['', 'Sans module'], ['scanner', 'Scanners de surface'], ['proximity', 'Détecteurs de proximité'], ['motors', 'Moteurs'], ['oxygen', 'Module d\'oxygène'], ['energy', 'Électricité'], ['gravity', 'Gravité artificielle']];
    const EMOTES = ['👍', '👎', '😮', '😂', '😱', '❤️', '🤔', '🎉'];
    const CARD_KINDS = {event: 'Événement', place: 'Lieu', planet: 'Planète'};
    // Site du wiki des règles (même adresse dans src/controllers/codex.js)
    const WIKI_URL = 'https://narxis.github.io/Leave-no-one-behind-Wiki/';
    const RARITIES = {commun: 'Commun', peu_commun: 'Peu commun', rare: 'Rare', epique: 'Épique', legendaire: 'Légendaire'};
    const PHASES = {
        init: 'En attente que le MJ lance la partie.',
        creation: 'Création des personnages en cours : va dans l\'onglet Perso.',
        gameLive: '',
        postGame: 'La partie est terminée.'
    };

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

    // ---- Connexion Discord ------------------------------------------------
    // Le relais fait la connexion (OAuth2, scope identify) et renvoie un
    // profil signé {id, name, avatar}, gardé sur l'appareil et présenté en
    // rejoignant une partie. Rien ne s'affiche si le relais n'est pas réglé.
    const relayHttp = relayBase.replace(/^ws/, 'http');
    const discordPayload = function (token) {
        try {
            let body = String(token).split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
            let json = new TextDecoder().decode(Uint8Array.from(atob(body), c => c.charCodeAt(0)));
            let p = JSON.parse(json);
            return p && p.exp > Date.now() && /^https:\/\/cdn\.discordapp\.com\//.test(p.avatar) ? p : null;
        } catch (e) {
            return null;
        }
    };
    // Retour de Discord : #discord= (navigateur) ou ?discord= (app de bureau)
    (function () {
        let hash = new URLSearchParams(location.hash.slice(1));
        let token = hash.get('discord') || params.get('discord');
        if (token && discordPayload(token))
            store.set('lnob-discord', token);
        if (hash.has('discord'))
            history.replaceState(null, '', location.pathname + location.search);
    })();
    let discordToken = discordPayload(store.get('lnob-discord')) ? store.get('lnob-discord') : null;

    const formatCode = (code) => code.length === 6 ? code.slice(0, 3) + '-' + code.slice(3) : code;
    const cleanCode = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

    // Petit utilitaire : élément avec classe et texte (jamais de HTML venu du réseau)
    const el = function (tag, cls, text) {
        let node = document.createElement(tag);
        if (cls)
            node.className = cls;
        if (text !== undefined && text !== null)
            node.textContent = text;
        return node;
    };

    // Texte de carte : quelques balises de mise en forme (<s>Non</s>) sont
    // gardées, tout le reste devient du texte. Le HTML est lu dans un document
    // inerte (rien ne s'exécute), puis reconstruit balise par balise.
    const RICH_TAGS = ['S', 'B', 'I', 'U', 'EM', 'STRONG', 'BR'];
    const richText = function (node, text) {
        let doc = new DOMParser().parseFromString('<body>' + String(text || ''), 'text/html');
        const copy = (from, to) => {
            for (let child of from.childNodes) {
                if (child.nodeType === Node.TEXT_NODE)
                    to.append(child.textContent);
                else if (child.nodeType === Node.ELEMENT_NODE) {
                    let target = to;
                    if (RICH_TAGS.includes(child.tagName)) {
                        target = document.createElement(child.tagName.toLowerCase());
                        to.append(target);
                    }
                    copy(child, target);
                }
            }
        };
        node.replaceChildren();
        copy(doc.body, node);
        return node;
    };

    let socket = null;
    let leaving = false;
    let retryDelay = 1000;
    let retryTimer = null;
    let session = null; // {code, name}
    let roster = [];
    let me = null;
    let hostOnline = false;
    let game = null;    // dernier état du jeu reçu
    let you;            // dernier état du joueur reçu (undefined : pas encore reçu)
    let tab = store.get('lnob-player-tab') || 'game';
    let codex = null;       // ce que l'équipage a rencontré (kind 'codex')
    let codexFilter = 'all';
    const codexImages = new Map(); // images des fiches envoyées par le MJ (customs, objets)
    let chat = [];          // messages visibles par ce joueur
    let chatChannel = 'room'; // 'room' (salon) ou 'gm' (privé avec le MJ)
    const chatUnread = {room: 0, gm: 0};

    const show = function (panel) {
        $('join').hidden = panel !== 'join';
        $('lobby').hidden = panel !== 'lobby';
        $('main').classList.toggle('wide', panel === 'lobby');
    };

    const setStatus = function (text, kind) {
        $('status').textContent = text;
        $('status').className = 'status ' + (kind || '');
    };

    const showError = function (message) {
        $('join-error').textContent = message;
        $('join-error').hidden = !message;
    };

    let errorTimer = null;
    const showActionError = function (message, info) {
        clearTimeout(errorTimer);
        $('action-error').classList.toggle('info', !!info);
        $('action-error').textContent = message || '';
        $('action-error').hidden = !message;
        if (message)
            errorTimer = setTimeout(() => showActionError(''), 6000);
    };

    // Message au MJ (le relais le transmet si le MJ est là)
    const sendAction = function (action, data) {
        if (!hostOnline)
            return showActionError('Le MJ est déconnecté.');
        if (socket && socket.readyState === WebSocket.OPEN)
            socket.send(JSON.stringify({type: 'msg', data: {kind: 'action', action: action, data: data || {}}}));
    };

    // ---- Onglets ----------------------------------------------------------

    const selectTab = function (name) {
        tab = name;
        if (name === 'chat') {
            chatUnread[chatChannel] = 0;
            renderChatBadges();
        }
        store.set('lnob-player-tab', name);
        document.querySelectorAll('.tab').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === name);
            b.setAttribute('aria-selected', b.dataset.tab === name);
        });
        document.querySelectorAll('.tab-panel').forEach(p => { p.hidden = p.dataset.panel !== name; });
    };

    // ---- Chat ------------------------------------------------------------

    const channelOf = (m) => m.to ? 'gm' : 'room';
    const chatTime = (at) => new Date(at).toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'});

    const renderChatBadges = function () {
        for (let c of ['room', 'gm']) {
            let b = document.querySelector('[data-badge="' + c + '"]');
            b.textContent = chatUnread[c];
            b.hidden = !chatUnread[c];
        }
        let total = chatUnread.room + chatUnread.gm;
        $('chat-badge').textContent = total;
        $('chat-badge').hidden = !total;
    };

    const renderChat = function () {
        document.querySelectorAll('.chat-channel').forEach(b => b.classList.toggle('active', b.dataset.channel === chatChannel));
        let list = chat.filter(m => channelOf(m) === chatChannel);
        $('chat-empty').hidden = list.length > 0;
        $('chat-messages').replaceChildren(...list.map(m => {
            let li = el('li', 'chat-message' + (m.from.gm ? ' gm' : '') + (m.from.id === playerId ? ' mine' : ''));
            let head = el('div', 'chat-head');
            head.append(el('strong', '', m.from.name), el('span', 'dim', chatTime(m.at)));
            li.append(head, el('p', 'chat-text', m.text));
            return li;
        }));
        $('chat-messages').scrollTop = $('chat-messages').scrollHeight;
        $('chat-text').placeholder = chatChannel === 'gm' ? 'Message privé au MJ…' : 'Écrire à l\'équipage…';
        renderChatBadges();
    };

    const addChat = function (m) {
        chat.push(m);
        let c = channelOf(m);
        if (m.from.id !== playerId && (tab !== 'chat' || c !== chatChannel))
            chatUnread[c]++;
        renderChat();
    };

    // ---- Statut de connexion -------------------------------------------

    const renderStatus = function () {
        if (hostOnline)
            setStatus('Connecté au MJ.', 'ok');
        else
            setStatus('Le MJ est déconnecté : la partie reprendra à son retour.', 'wait');
    };

    // ---- Équipage --------------------------------------------------------

    // Avatar et pseudo Discord d'un joueur, s'il s'est connecté avec
    const discordTag = function (discord) {
        if (!discord || !/^https:\/\/cdn\.discordapp\.com\//.test(discord.avatar || ''))
            return null;
        let tag = el('span', 'discord-tag');
        let img = el('img');
        img.src = discord.avatar;
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        tag.append(img, el('span', '', discord.name));
        tag.title = 'Discord : ' + discord.name;
        return tag;
    };

    const renderPlayers = function () {
        let list = roster.length ? roster : (me ? [me] : []);
        let characters = new Map(((game && game.team) || []).map(c => [c.id, c]));
        $('players').replaceChildren(...list.map(p => {
            let li = el('li', p.id === playerId ? 'me' : '');
            li.append(el('span', 'player-name', p.name + (p.id === playerId ? ' (toi)' : '')));
            let tag = discordTag(p.discord);
            if (tag)
                li.append(tag);
            let c = characters.get(p.id);
            li.append(el('span', 'dim', c ? c.name + (c.race ? ' · ' + c.race : '') : 'pas de perso'));
            if (p.online === false)
                li.append(el('span', 'dim', 'déconnecté'));
            return li;
        }));
    };

    // ---- Partie : carte en cours, status, alerte ---------------------------

    const renderGame = function () {
        let phase = game ? game.phase : 'init';
        $('phase').textContent = PHASES[phase] !== undefined ? PHASES[phase] : '';
        $('phase').hidden = !$('phase').textContent;

        let card = game && game.card;
        $('game-card').hidden = !card;
        if (!card || card.kind !== 'planet')
            renderPlanet(null);
        if (card) {
            $('card-kind').textContent = CARD_KINDS[card.kind] || '';
            richText($('card-desc'), card.desc);
            $('card-desc').hidden = !card.desc;
            // Choix : on vote, le MJ tranche. Votes possibles quand la page
            // de jeu a annoncé ses choix (card.screen) et que le MJ n'a pas
            // encore cliqué.
            let canVote = !!card.screen && card.chosen === null && !!you && !!you.character;
            let myVote = you ? you.vote : null;
            $('card-choices').replaceChildren(...(card.choices || []).map((c, i) => {
                let li = el('li', 'card-choice');
                let count = (card.counts || [])[i] || 0;
                li.classList.toggle('voted', myVote === i);
                li.classList.toggle('chosen', card.chosen === i);
                let body = richText(el(canVote ? 'button' : 'span', 'choice-text'), c);
                if (canVote) {
                    body.type = 'button';
                    body.title = myVote === i ? 'Retirer mon vote' : 'Voter pour ce choix';
                    body.addEventListener('click', () => sendAction('vote', {index: myVote === i ? null : i}));
                }
                li.append(body);
                if (count)
                    li.append(el('span', 'choice-votes', count + (count > 1 ? ' votes' : ' vote')));
                return li;
            }));
            renderPlanet(card.kind === 'planet' ? card.planet : null);
            $('planet-vote-title').hidden = !(card.choices && card.choices.length);
            let note = '';
            if (card.kind === 'planet' && canVote)
                note = myVote === null || myVote === undefined ? 'Vote pour la suite, le MJ scanne sur l\'écran principal.' : 'Vote envoyé. Touche ton choix à nouveau pour le retirer.';
            else if (card.kind === 'planet')
                note = card.chosen !== null && card.chosen !== undefined ? 'Le MJ a choisi.' : 'Le MJ scanne la planète sur l\'écran principal.';
            else if (card.chosen !== null && card.chosen !== undefined)
                note = 'Le MJ a choisi.';
            else if (canVote)
                note = myVote === null || myVote === undefined ? 'Vote pour un choix, le MJ tranche.' : 'Vote envoyé. Touche ton choix à nouveau pour le retirer.';
            else if (card.choices && card.choices.length)
                note = you && you.character ? 'Le MJ choisit pour l\'équipage.' : 'Il faut un perso pour voter.';
            $('card-note').textContent = note;
        }

        let statuses = (game && game.statuses) || [];
        $('statuses').replaceChildren(...statuses.map(s => {
            let chip = el('span', 'chip', s.name + ' · ' + s.duration + (s.duration > 1 ? ' tours' : ' tour'));
            chip.title = s.desc || '';
            return chip;
        }));

        let alert = game && game.alerts && game.alerts.alert;
        $('ship-alert').hidden = !alert;
        if (alert)
            $('ship-alert').textContent = '⚠ ' + alert.name + (alert.message ? ' : ' + alert.message : '');
        // Le MJ affiche le plan : on bascule sur l'onglet Vaisseau
        if (game && game.alerts && (game.alerts.showMap || alert) && !renderGame.mapShown)
            selectTab('ship');
        renderGame.mapShown = !!(game && game.alerts && (game.alerts.showMap || alert));
    };

    // ---- Planète : dessin couche par couche, points de détection, scans -----

    // Le dessin ne connaît que les stats scannées : à chaque scan il est refait
    // avec la nouvelle valeur, puis la couche apparaît avec son animation
    let planetDrawn = null; // {id, keys: [couches affichées]}
    const renderPlanet = function (planet) {
        $('planet').hidden = !planet;
        if (!planet) {
            if (planetDrawn) {
                $('planet-frame').replaceChildren();
                planetDrawn = null;
            }
            return;
        }
        let scans = planet.scans || [];
        let keys = scans.filter(s => s.revealed).map(s => s.key);
        let fresh = !planetDrawn || planetDrawn.id !== planet.id;
        let added = fresh ? keys : keys.filter(k => !planetDrawn.keys.includes(k));
        if ((fresh || added.length) && window.PlanetView) {
            let canvas = el('canvas', 'planet-canvas');
            canvas.setAttribute('aria-hidden', 'true');
            $('planet-frame').replaceChildren(canvas);
            let size = canvas.clientWidth || 260;
            let view = PlanetView.create(canvas, {
                size: size,
                radius: size * .225,
                modules: planet.modules || {},
                seed: planet.id,
                revealed: fresh ? keys : planetDrawn.keys
            });
            if (!fresh)
                view.reveal(added);
            planetDrawn = {id: planet.id, keys: keys};
        }

        let points = planet.points === null || planet.points === undefined ? '…' : planet.points;
        $('planet-points').textContent = 'Points de détection : ' + points + (planet.drones ? ' · Drones : ' + planet.drones : '');
        $('planet-scans').replaceChildren(...scans.map(s => {
            let li = el('li', s.revealed ? 'scanned' : '');
            let head = el('div', 'scan-head');
            head.append(el('span', 'scan-label', s.label));
            if (!s.revealed && s.cost !== null && s.cost !== undefined)
                head.append(el('span', 'scan-cost', s.cost + ' pts'));
            li.append(head);
            li.append(el('p', 'scan-text', s.revealed ? s.text : 'Pas encore scanné.'));
            return li;
        }));
    };

    // ---- Vaisseau ----------------------------------------------------------

    const bar = function (label, value, max) {
        let row = el('div', 'bar-row');
        row.append(el('span', 'bar-label', label));
        let track = el('span', 'bar-track');
        let fill = el('span', 'bar-fill');
        let pct = Math.max(0, Math.min(100, (Number(value) || 0) / (max || 100) * 100));
        fill.style.width = pct + '%';
        fill.classList.toggle('low', pct < 35);
        track.append(fill);
        row.append(track, el('span', 'bar-value', String(value)));
        return row;
    };

    const shipSvg = function () {
        let box = $('ship-plan');
        if (!box.firstElementChild && window.LNOB_SHIP_SVG)
            box.innerHTML = window.LNOB_SHIP_SVG; // fichier statique de la page, pas du réseau
        return box.querySelector('svg');
    };

    const renderShip = function () {
        let ship = game && game.ship;
        $('cryopods').textContent = ship ? 'Colons en cryogénie : ' + ship.cryopods : 'Pas encore de vaisseau.';
        $('ship-modules').replaceChildren(...(ship ? ship.modules.map(m => bar(m.label, m.value, 100)) : []));

        let svg = shipSvg();
        if (!svg || typeof ShipMap === 'undefined')
            return;
        let alerts = (game && game.alerts) || {blink: [], alert: null};
        let alert = alerts.alert;
        let g = ShipMap.layer(svg, 'player-ship-layer');
        (alerts.blink || []).filter(id => !alert || id !== alert.room)
            .forEach(id => ShipMap.roomFill(svg, id, 'ship-blink-fill', g));
        if (alert) {
            ShipMap.roomFill(svg, alert.room, 'ship-alert-fill', g);
            ShipMap.alertMarker(svg, alert.room, alert.name, g);
        }
        ShipMap.markAlertLabel(svg, alert ? alert.room : null);
    };

    // ---- Perso -------------------------------------------------------------

    const modText = (mod) => mod > 0 ? '+' + mod : String(mod);

    // Fiche d'une race : image, bonus et malus, description, affinités
    // (création du perso et Codex)
    const raceSheet = function (node, r) {
        node.append(cardImage(r, 'img/races/wat.webp'));
        let body = el('span', 'race-body');
        body.append(el('strong', '', r.name));
        let mods = Object.entries(r.stats || {}).filter(([, v]) => v).map(([k, v]) => (STAT_LABELS[k] || k) + ' ' + modText(v));
        body.append(el('span', 'dim small-text', mods.length ? mods.join(', ') : 'Aucun bonus ni malus'));
        if (r.desc)
            body.append(el('span', 'race-desc', r.desc.replace(/<[^>]*>/g, '')));
        if (r.affinities && r.affinities.length) {
            let list = el('ul', 'race-affinities');
            list.append(...r.affinities.map(a => el('li', '', a)));
            body.append(list);
        }
        if (r.noAffinity)
            body.append(el('span', 'dim small-text', 'Affinités : ni le jeu ni le wiki n\'en définissent pour cette race.'));
        else if (r.moreAffinities)
            body.append(el('span', 'dim small-text', r.moreAffinities > 1 ? r.moreAffinities + ' affinités avec des races pas encore croisées.' : 'Une affinité avec une race pas encore croisée.'));
        node.append(body);
        return node;
    };

    const renderRaces = function (character) {
        let races = (game && game.races) || [];
        $('race-list').replaceChildren(...races.map(r => {
            let b = raceSheet(el('button', 'race' + (character.race === r.slug ? ' selected' : '')), r);
            b.type = 'button';
            b.setAttribute('aria-pressed', character.race === r.slug);
            b.addEventListener('click', () => sendAction('set-race', {race: r.slug}));
            return b;
        }));
    };

    // Image d'une fiche : livrée avec la page (races de base), envoyée par le
    // MJ (customs, objets), sinon une image par défaut
    const cardImage = function (entry, fallback) {
        let src = entry.image || (entry.imageKey && codexImages.get(entry.imageKey)) || fallback;
        let img = el('img', 'sheet-img' + (entry.imageKey && entry.imageKey.startsWith('item:') ? ' pixel' : ''));
        img.alt = '';
        if (src) {
            img.src = src;
            if (fallback)
                img.onerror = () => { img.onerror = null; img.src = fallback; };
        }
        else
            img.classList.add('empty');
        return img;
    };

    // ---- Codex ---------------------------------------------------------------

    const statusIcon = function (slug) {
        let icon = el('span', 'sheet-img status-icon');
        icon.setAttribute('aria-hidden', 'true');
        let svg = window.LNOB_STATUS_SVG && window.LNOB_STATUS_SVG[slug];
        if (svg)
            icon.innerHTML = svg; // fichier statique de la page, pas du réseau
        return icon;
    };

    const renderCodex = function () {
        let book = codex || {races: [], items: [], statuses: [], totals: {}};
        let totals = book.totals || {};
        for (let kind of ['races', 'items', 'statuses']) {
            let count = document.querySelector('[data-count="' + kind + '"]');
            count.textContent = (book[kind] || []).length + '/' + (totals[kind] || 0);
        }
        document.querySelectorAll('.codex-filter').forEach(b => b.classList.toggle('active', b.dataset.filter === codexFilter));

        let query = $('codex-search').value.trim().toLowerCase();
        const match = (...texts) => !query || texts.join(' ').toLowerCase().includes(query);
        const wanted = (kind) => codexFilter === 'all' || codexFilter === kind;
        let entries = [];
        if (wanted('races'))
            for (let r of book.races || [])
                if (match(r.name, r.desc, (r.affinities || []).join(' ')))
                    entries.push(raceSheet(el('li', 'codex-entry race'), r));
        if (wanted('items'))
            for (let item of book.items || [])
                if (match(item.name, item.desc, item.type, item.race)) {
                    let li = el('li', 'codex-entry');
                    li.append(cardImage(item, null));
                    let body = el('span', 'race-body');
                    body.append(el('strong', '', item.name));
                    let meta = [item.type, RARITIES[item.rarity] || item.rarity, item.race && 'objet de départ ' + item.race].filter(Boolean);
                    if (meta.length)
                        body.append(el('span', 'dim small-text', meta.join(' · ')));
                    if (item.desc)
                        body.append(el('span', 'race-desc', item.desc));
                    li.append(body);
                    entries.push(li);
                }
        if (wanted('statuses'))
            for (let st of book.statuses || [])
                if (match(st.name, st.desc)) {
                    let li = el('li', 'codex-entry');
                    li.append(statusIcon(st.slug));
                    let body = el('span', 'race-body');
                    body.append(el('strong', '', st.name), el('span', 'race-desc', st.desc));
                    if (/^https:\/\//.test(st.link || '')) {
                        let a = el('a', 'small-text', 'La règle sur le wiki ↗');
                        a.href = st.link;
                        a.target = '_blank';
                        a.rel = 'noopener';
                        body.append(a);
                    }
                    li.append(body);
                    entries.push(li);
                }
        $('codex-list').replaceChildren(...entries);
        let empty = '';
        if (!entries.length)
            empty = query ? 'Rien ne correspond à ta recherche.' : 'Rien pour l\'instant : l\'équipage n\'a encore rien rencontré.';
        $('codex-empty').textContent = empty;
        $('codex-empty').hidden = !empty;
    };

    const renderRolls = function (creation) {
        $('stat-rolls').hidden = !creation || creation.step !== 'stats';
        if ($('stat-rolls').hidden)
            return;
        $('stat-table').replaceChildren(...creation.stats.map(s => {
            let row = el('div', 'stat-row');
            row.append(el('span', 'stat-name', (STAT_LABELS[s.stat] || s.stat) + (s.mod ? ' (' + modText(s.mod) + ')' : '')));
            let dice = el('span', 'dice');
            for (let i = 0; i < s.total; i++) {
                let v = s.dice[i];
                let d = el('span', 'die' + (v === undefined ? ' empty' : '') + (v !== undefined && v === s.kept ? ' kept' : ''), v === undefined ? '?' : String(v));
                dice.append(d);
            }
            row.append(dice);
            let left = s.total - s.dice.length;
            let b = el('button', 'secondary small', left ? '🎲 Lancer' : '= ' + (s.kept + 50));
            b.type = 'button';
            b.disabled = !left;
            b.addEventListener('click', () => { b.disabled = true; sendAction('roll-stat', {stat: s.stat}); });
            row.append(b);
            return row;
        }));
    };

    const renderSheet = function (character) {
        $('sheet-name').textContent = character.name;
        $('sheet-race').textContent = character.raceName || '';
        $('sheet-stats').replaceChildren(...Object.keys(STAT_LABELS).map(s => bar(STAT_LABELS[s], character[s] || 0, 100)));
        $('roll-box').hidden = !game || game.phase !== 'gameLive';
    };

    const renderMe = function () {
        let phase = game ? game.phase : 'init';
        let character = you && you.character;
        let creation = you && you.creation;
        $('no-character').hidden = you === undefined || !!character;
        $('no-character-text').textContent = phase === 'creation'
            ? 'Tu n\'as pas encore de personnage dans cette partie.'
            : 'Tu n\'as pas de personnage dans cette partie. Les persos se créent quand le MJ ouvre la création.';
        $('create').hidden = phase !== 'creation';
        $('create').disabled = !hostOnline;

        let creating = !!(character && creation && creation.step !== 'done');
        $('creation').hidden = !creating;
        if (creating) {
            if (document.activeElement !== $('char-name'))
                $('char-name').value = character.name;
            renderRaces(character);
            renderRolls(creation);
        }
        $('sheet').hidden = !character || creating;
        if (character && !creating)
            renderSheet(character);
    };

    // ---- Inventaire ----------------------------------------------------------

    const renderItems = function () {
        let items = (you && you.inventory) || [];
        let others = ((game && game.team) || []).filter(c => c.id !== playerId);
        $('items-empty').hidden = items.length > 0;
        $('items').replaceChildren(...items.map(item => {
            let li = el('li', 'item');
            li.append(el('strong', '', item.name + (item.count > 1 ? ' ×' + item.count : '')));
            if (item.desc)
                li.append(el('span', 'dim small-text', String(item.desc).replace(/<[^>]*>/g, '')));
            // Utiliser : demande au MJ, qui accepte ou refuse
            if (game && game.phase === 'gameLive') {
                let pending = ((you && you.pendingItems) || []).includes(item.slug);
                let use = el('button', 'secondary small use-item', pending ? 'Demande envoyée au MJ' : 'Utiliser');
                use.type = 'button';
                use.disabled = pending;
                use.addEventListener('click', () => sendAction('item-use', {slug: item.slug}));
                li.append(use);
            }
            if (others.length) {
                let form = el('form', 'inline-form');
                let select = el('select');
                select.setAttribute('aria-label', 'Donner à');
                for (let c of others) {
                    let o = el('option', '', c.name);
                    o.value = c.id;
                    select.append(o);
                }
                let b = el('button', 'secondary small', 'Donner');
                b.type = 'submit';
                form.append(select, b);
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    sendAction('inventory-move', {slug: item.slug, to: {type: 'player', id: select.value}});
                });
                li.append(form);
            }
            return li;
        }));
    };

    const renderAll = function () {
        renderGame();
        renderMe();
        renderShip();
        renderItems();
        renderPlayers();
        renderCodex();
    };

    // ---- Connexion au relais -------------------------------------------------

    const onGameMessage = function (data) {
        if (data.kind === 'roster') {
            roster = Array.isArray(data.players) ? data.players : [];
            renderPlayers();
        }
        else if (data.kind === 'game') {
            game = data;
            renderAll();
        }
        else if (data.kind === 'you') {
            you = data;
            renderGame();
            renderMe();
            renderItems();
        }
        else if (data.kind === 'codex') {
            codex = data;
            renderCodex();
        }
        // Image d'une fiche, en data URL (rien d'autre n'est accepté)
        else if (data.kind === 'codex-image' && typeof data.key === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(data.src || '')) {
            codexImages.set(data.key, data.src);
            renderCodex();
            renderMe();
        }
        else if (data.kind === 'chat-history') {
            chat = Array.isArray(data.messages) ? data.messages : [];
            renderChat();
        }
        else if (data.kind === 'chat' && data.message) {
            addChat(data.message);
        }
        else if (data.kind === 'refused') {
            showActionError(data.message);
            renderMe();
        }
        // Réponse du MJ à une demande (objet utilisé ou non)
        else if (data.kind === 'notice' && data.text) {
            showActionError(String(data.text), true);
        }
        else if (data.kind === 'result' && data.action === 'roll' && data.data) {
            let r = data.data;
            $('roll-result').hidden = false;
            $('roll-result').className = 'roll-result ' + (r.success ? 'ok' : 'fail');
            $('roll-result').textContent = '🎲 ' + r.dice_result + ' → ' + r.result + ' : ' + (r.success ? 'réussite !' : 'échec.');
        }
    };

    const connect = function () {
        clearTimeout(retryTimer);
        let url = relayBase + '/join/' + encodeURIComponent(session.code)
            + '?id=' + encodeURIComponent(playerId)
            + '&name=' + encodeURIComponent(session.name)
            + (discordToken ? '&discord=' + encodeURIComponent(discordToken) : '')
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
                // Profil refusé par le relais (expiré, ou relais sans Discord) : on l'oublie
                if (discordToken && !(me && me.discord)) {
                    discordToken = null;
                    store.set('lnob-discord', '');
                    renderDiscord();
                }
                hostOnline = msg.host;
                $('lobby-code').textContent = formatCode(session.code);
                store.set('lnob-last-code', session.code);
                show('lobby');
                renderStatus();
                renderAll();
            }
            else if (msg.type === 'host') {
                hostOnline = msg.online;
                renderStatus();
                renderMe();
            }
            else if (msg.type === 'error') {
                rejected = true;
                leaving = true;
                show('join');
                $('submit').disabled = false;
                showError(msg.message);
            }
            else if (msg.type === 'msg' && msg.data && typeof msg.data === 'object')
                onGameMessage(msg.data);
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

    // ---- Connexion Discord : bouton ou compte connecté -----------------------

    let discordEnabled = false;
    const renderDiscord = function () {
        let profile = discordToken ? discordPayload(discordToken) : null;
        $('discord-box').hidden = !discordEnabled && !profile;
        $('discord-login').hidden = !!profile || !discordEnabled;
        $('discord-me').hidden = !profile;
        if (profile) {
            $('discord-avatar').src = profile.avatar;
            $('discord-name').textContent = profile.name;
        }
    };
    if (/^https?:/.test(relayHttp)) {
        // L'app de bureau intercepte le retour (?app=1) et rouvre la page
        $('discord-login').href = relayHttp + '/auth/discord/login' + (location.protocol === 'file:' ? '?app=1' : '');
        fetch(relayHttp + '/auth/discord/config').then(r => r.json()).then(c => {
            discordEnabled = !!(c && c.enabled);
            renderDiscord();
        }).catch(() => {});
    }
    $('discord-logout').addEventListener('click', () => {
        discordToken = null;
        store.set('lnob-discord', '');
        renderDiscord();
    });
    renderDiscord();

    // ---- Formulaires et boutons ------------------------------------------

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
        game = null;
        you = undefined;
        codex = null;
        codexImages.clear();
        chat = [];
        chatUnread.room = chatUnread.gm = 0;
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

    $('create').addEventListener('click', () => {
        $('create').disabled = true;
        showActionError('');
        sendAction('join');
    });

    $('name-form').addEventListener('submit', (e) => {
        e.preventDefault();
        let nick = $('char-name').value.trim();
        if (nick)
            sendAction('set-name', {nick: nick});
        $('char-name').blur();
    });

    document.querySelectorAll('.chat-channel').forEach(b => b.addEventListener('click', () => {
        chatChannel = b.dataset.channel;
        chatUnread[chatChannel] = 0;
        renderChat();
        $('chat-text').focus();
    }));

    $('chat-form').addEventListener('submit', (e) => {
        e.preventDefault();
        let text = $('chat-text').value.trim();
        if (!text)
            return;
        sendAction('chat', {text: text, private: chatChannel === 'gm'});
        $('chat-text').value = '';
    });
    // Entrée envoie, Maj+Entrée va à la ligne
    $('chat-text').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            $('chat-form').requestSubmit();
        }
    });

    $('roll-form').addEventListener('submit', (e) => {
        e.preventDefault();
        $('roll-result').hidden = true;
        sendAction('roll', {stat: $('roll-stat').value, module: $('roll-module').value});
    });

    for (let s of Object.keys(STAT_LABELS).filter(s => s !== 'moral')) {
        let o = el('option', '', STAT_LABELS[s]);
        o.value = s;
        $('roll-stat').append(o);
    }
    for (let [value, label] of ROLL_MODULES) {
        let o = el('option', '', label);
        o.value = value;
        $('roll-module').append(o);
    }
    $('emotes').replaceChildren(...EMOTES.map(e => {
        let b = el('button', 'emote', e);
        b.type = 'button';
        b.addEventListener('click', () => sendAction('emote', {emoji: e}));
        return b;
    }));
    document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => selectTab(b.dataset.tab)));
    $('codex-search').addEventListener('input', renderCodex);
    document.querySelectorAll('.codex-filter').forEach(b => b.addEventListener('click', () => {
        codexFilter = b.dataset.filter;
        renderCodex();
    }));
    document.querySelectorAll('.wiki-link').forEach(a => { a.href = WIKI_URL + (a.dataset.page || ''); });
    selectTab(document.querySelector('.tab[data-tab="' + tab + '"]') ? tab : 'game');

    // Code reçu dans le lien du MJ, sinon le dernier utilisé
    $('code').value = formatCode(cleanCode(params.get('code') || store.get('lnob-last-code') || ''));
    $('name').value = store.get('lnob-player-name') || '';
    $('code').addEventListener('input', () => {
        let code = cleanCode($('code').value).slice(0, 6);
        $('code').value = code.length > 3 ? code.slice(0, 3) + '-' + code.slice(3) : code;
    });
    ($('code').value && !$('name').value ? $('name') : $('code')).focus();
})();
