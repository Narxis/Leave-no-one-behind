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
    const CARD_KINDS = {event: 'Événement', place: 'Lieu', planet: 'Planète en approche', blank: 'Carte blanche'};
    // Panneau « Statistiques » et cadrans des modules, comme sur l'écran de jeu
    const HUD_STATS = [['combat', 'Combat/offense'], ['pilotage', 'Pilotage'], ['engineering', 'Ingénierie'], ['survival', 'Survie/défense'], ['recon', 'Reconnaissance'], ['moral', 'Moral']];
    const MAIN_MODULES = {motors: 'Moteurs', scanner: 'Scanner', proximity: 'Détecteur', oxygen: 'Oxygène', energy: 'Électricité', gravity: 'Gravité'};
    const SECOND_MODULES = [['landing', 'Atterrissage'], ['construction', 'Construction'], ['dbscience', 'BDD scientifique'], ['dbhistory', 'BDD historique']];
    // Relevés autour de la planète : à gauche, puis à droite (écran de jeu)
    const PLANET_LEFT = ['oxy', 'cli', 'grv'];
    let starWarp = () => {}; // voyage entre deux cartes (fond étoilé, plus bas)
    const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Site du wiki des règles (même adresse dans src/controllers/codex.js)
    const WIKI_URL = 'https://narxis.github.io/Leave-no-one-behind-Wiki/';
    const RARITIES = {commun: 'Commun', peu_commun: 'Peu commun', rare: 'Rare', epique: 'Épique', legendaire: 'Légendaire'};
    const PHASES = {
        init: 'En attente que le MJ lance la partie.',
        creation: 'Création des personnages en cours.',
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
        document.body.classList.toggle('in-game', panel === 'lobby');
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

    // Planète affichée sur l'onglet Partie : disposition de la page planète
    // du MJ (scans à gauche, planète au centre, humains et modules à droite)
    let planetShown = false;
    const updatePlanetMode = function () {
        document.body.classList.toggle('planet-mode', planetShown && tab === 'game');
    };

    // ---- Écran de jeu du MJ, porté tel quel (mj/screen.html, mj/planet.html) --
    // Sur ordinateur, l'onglet Partie affiche une copie des pages de jeu du MJ
    // (même balisage, mêmes styles, mêmes scripts), dans un cadre : la page de
    // la carte, ou celle de la planète. La page lui transmet l'état de la
    // partie et ce que la page du MJ écrit ; il renvoie les votes du joueur.
    // Sur téléphone, la page garde sa mise en page.
    const mjFrame = $('mj-screen');
    let mjReady = false;
    let mjPage = mjFrame ? mjFrame.getAttribute('src') : null;
    let mjLastText = null;   // dernier texte annoncé par le MJ (pour un écran rechargé)
    let mjLastTimer = null;
    const MJ_REPLAY = ['inventory', 'combat', 'card-loot', 'allies'];
    const mjLastEvents = new Map();
    const wideScreen = window.matchMedia ? window.matchMedia('(min-width: 900px)') : {matches: true};
    const toMjScreen = function (message) {
        if (mjReady && mjFrame && mjFrame.contentWindow)
            mjFrame.contentWindow.postMessage(message, '*');
    };
    const mjState = () => toMjScreen({lnob: 'state', game: game, you: you || null, me: playerId});
    // Ce que l'écran porté affiche : une carte (événement, lieu, carte
    // blanche) avec son combat, une planète, ou le score de fin
    const mjScreenFits = function () {
        let card = game && game.card;
        if (!wideScreen.matches || tab !== 'game' || !game)
            return false;
        if (game.phase === 'postGame')
            return !!game.score;
        return game.phase === 'gameLive' && !!card && card.kind !== 'intro';
    };
    // Page du MJ à montrer : l'écran de fin, celle de la planète (sa graine,
    // et la dernière planète a un seul bouton), sinon celle de la carte
    const mjScreenPage = function () {
        let card = game && game.card;
        if (game && game.phase === 'postGame' && game.score)
            return 'mj/end.html';
        if (!card || card.kind !== 'planet')
            return 'mj/screen.html';
        return 'mj/planet.html?card=' + encodeURIComponent(card.id) + (card.lastPlanet ? '&last=1' : '');
    };
    const updateMjScreen = function () {
        let page = mjScreenPage();
        // Changement de page, comme le MJ passe de la carte à la planète
        if (mjFrame && wideScreen.matches && page !== mjPage) {
            mjPage = page;
            mjReady = false;
            mjFrame.setAttribute('src', page);
        }
        let on = !!mjFrame && mjScreenFits();
        document.body.classList.toggle('mj-screen-on', on);
        if (mjFrame)
            mjFrame.setAttribute('aria-hidden', on ? 'false' : 'true');
    };
    if (wideScreen.addEventListener)
        wideScreen.addEventListener('change', updateMjScreen);
    window.addEventListener('message', (e) => {
        if (!mjFrame || e.source !== mjFrame.contentWindow || !e.data || typeof e.data.lnobScreen !== 'string')
            return;
        let m = e.data;
        if (m.lnobScreen === 'ready') {
            mjReady = true;
            mjState();
            if (mjLastText)
                toMjScreen({lnob: 'card-text', data: Object.assign({}, mjLastText, {late: true})});
            if (mjLastTimer)
                toMjScreen({lnob: 'timer', timer: mjLastTimer});
            for (let payload of mjLastEvents.values())
                toMjScreen({lnob: 'mj-event', payload: payload});
        }
        else if (m.lnobScreen === 'vote' && (m.index === null || Number.isInteger(m.index)))
            sendAction('vote', {index: m.index});
    });

    const selectTab = function (name) {
        tab = name;
        store.set('lnob-player-tab', name);
        document.querySelectorAll('.tab').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === name);
            b.setAttribute('aria-selected', b.dataset.tab === name);
        });
        document.querySelectorAll('.tab-panel').forEach(p => { p.hidden = p.dataset.panel !== name; });
        $('back-game').hidden = name === 'game';
        setMenu(false);
        updatePlanetMode();
        updateMjScreen();
    };

    // ---- Menu (burger en haut à gauche) ------------------------------------

    const setMenu = function (open) {
        $('menu-drawer').hidden = !open;
        $('menu-toggle').setAttribute('aria-expanded', open);
        $('menu-toggle').classList.toggle('open', open);
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
        $('chat-open-badge').textContent = chatClosedUnread;
        $('chat-open-badge').hidden = !chatClosedUnread;
    };

    // Chat fermé : un bouton le rouvre, avec les messages arrivés entre-temps
    // (ouvert d'office sur grand écran, fermé sur téléphone, où il cache la carte)
    let chatPref = store.get('lnob-chat-closed');
    let chatOpen = chatPref ? chatPref !== '1' : !!(window.matchMedia && window.matchMedia('(min-width: 900px)').matches);
    let chatClosedUnread = 0;
    const setChatOpen = function (open) {
        chatOpen = open;
        store.set('lnob-chat-closed', open ? '0' : '1');
        $('chat').hidden = !open;
        $('chat-open').hidden = open;
        if (open) {
            chatClosedUnread = 0;
            renderChat();
        }
        renderChatBadges();
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
        // Le chat est toujours affiché : seule l'autre conversation compte des non-lus
        if (m.from.id !== playerId && c !== chatChannel)
            chatUnread[c]++;
        if (m.from.id !== playerId && !chatOpen)
            chatClosedUnread++;
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
            li.append(el('span', 'dim', c ? c.name + (c.race ? ' · ' + c.race : '') + (c.role ? ' · ' + c.role : '') : 'pas de perso'));
            if (p.online === false)
                li.append(el('span', 'dim', 'déconnecté'));
            return li;
        }));
        if (game)
            renderCrewStrip();
    };

    // Fiches des joueurs en bas de l'écran, comme sur l'écran de jeu
    const renderCrewStrip = function () {
        let online = new Map(roster.map(p => [p.id, p]));
        let team = (game && game.team) || [];
        $('crew-strip').hidden = !team.length;
        $('crew-strip').replaceChildren(...team.map(c => {
            let li = el('li', 'crew-tab' + (c.id === playerId ? ' me' : ''));
            let head = el('div', 'crew-head');
            head.append(el('span', 'crew-name', c.name));
            if (c.race)
                head.append(el('span', 'race-pill', c.race));
            li.append(head);
            let foot = el('div', 'crew-foot');
            let p = online.get(c.id);
            let dot = el('span', 'online-dot' + (p && p.online !== false ? ' on' : ''));
            dot.title = p && p.online !== false ? 'En ligne' : 'Hors ligne';
            foot.append(dot, el('span', 'dim small-text', c.role || (c.id === playerId ? 'Toi' : '')));
            let tag = discordTag(c.discord);
            if (tag)
                foot.append(tag);
            li.append(foot);
            return li;
        }));
    };

    // ---- HUD : humains, statuts, stats du perso ---------------------------

    const svgIcon = function (cls, svg) {
        let icon = el('span', cls);
        icon.setAttribute('aria-hidden', 'true');
        if (svg)
            icon.innerHTML = svg; // fichier statique de la page, pas du réseau
        return icon;
    };

    const renderHud = function () {
        let ship = game && game.ship;
        $('humans').textContent = ship ? ship.cryopods : '…';
        let statuses = (game && game.statuses) || [];
        $('statuses-empty').hidden = statuses.length > 0;
        $('statuses').replaceChildren(...statuses.map(st => {
            let li = el('li', 'status-row' + (st.player === playerId ? ' mine' : ''));
            li.title = st.desc || '';
            li.append(el('span', 'status-name', st.name), el('span', 'status-turns', String(st.duration)));
            return li;
        }));
        // Modules principaux et secondaires (panneau de droite de la page planète)
        let values = new Map(ship ? ship.modules.map(m => [m.id, m.value]) : []);
        $('hud-main-modules').replaceChildren(...Object.entries(MAIN_MODULES).map(([id, label]) => {
            let li = dial(id, label, values.get(id));
            li.classList.add('dial-row');
            return li;
        }));
        $('hud-second-modules').replaceChildren(...SECOND_MODULES.map(([id, label]) => {
            let li = el('li', 'hud-second');
            li.append(el('span', 'dim', label + ' :'), el('strong', '', (values.get(id) || 0) + ' %'));
            return li;
        }));
        let character = you && you.character;
        $('hud-no-stats').hidden = !!character;
        $('hud-stats').replaceChildren(...(character ? HUD_STATS.map(([stat, label]) => {
            let li = el('li', 'hud-stat');
            li.append(svgIcon('stat-icon', window.LNOB_STAT_SVG && LNOB_STAT_SVG[stat]), el('span', 'hud-stat-label', label),
                el('strong', 'hud-stat-value', String(character[stat] || 0)));
            return li;
        }) : []));
    };

    // Cadran d'un module : anneau rempli selon la valeur, icône au centre
    const dial = function (id, label, value) {
        let li = el('li', 'dial');
        let pct = Math.max(0, Math.min(100, Number(value) || 0));
        // Couleur selon l'état, comme les jauges du MJ (ui-gauges.js)
        li.classList.add(pct >= 60 ? 'ok' : (pct >= 30 ? 'warn' : 'crit'));
        li.title = label + ' ' + pct + ' %';
        let ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        ring.setAttribute('viewBox', '0 0 100 100');
        ring.setAttribute('class', 'dial-ring');
        ring.setAttribute('aria-hidden', 'true');
        ring.innerHTML = '<circle class="dial-track" cx="50" cy="50" r="44" pathLength="100"/>'
            + '<circle class="dial-fill" cx="50" cy="50" r="44" pathLength="100" transform="rotate(-90 50 50)" stroke-dasharray="' + pct + ' 100"' + (pct ? '' : ' opacity="0"') + '/>';
        let face = el('span', 'dial-face');
        face.append(ring);
        let img = el('img', 'dial-img');
        img.src = 'img/modules/' + id + '.svg';
        img.alt = '';
        face.append(img);
        li.append(face, el('span', 'dial-label', label), el('span', 'dial-value', pct + ' %'));
        return li;
    };

    // Onglets des modules à droite de l'écran de jeu : 71px chacun et 38px
    // de marge en haut comme chez le MJ, réduits si la carte est moins haute
    const fitDials = function () {
        let list = $('module-dials');
        let screen = ['game-card', 'combat', 'planet'].map($).find(n => !n.hidden);
        if (!screen || !window.matchMedia('(min-width: 900px)').matches) {
            list.style.removeProperty('--tab-h');
            list.style.removeProperty('--dials-top');
            return;
        }
        let h = screen.offsetHeight;
        let top = Math.min(38, h * .075);
        let tab = Math.max(36, Math.min(71, Math.floor((h - 2 * top) / 6)));
        list.style.setProperty('--tab-h', tab + 'px');
        list.style.setProperty('--dials-top', Math.max(0, (h - 6 * tab) / 2) + 'px');
    };
    if (window.ResizeObserver) {
        let observer = new ResizeObserver(fitDials);
        ['game-card', 'combat', 'planet'].forEach(id => observer.observe($(id)));
    }
    window.addEventListener('resize', fitDials);

    const renderDials = function (list) {
        let ship = game && game.ship;
        let values = new Map(ship ? ship.modules.map(m => [m.id, m.value]) : []);
        list.replaceChildren(...(ship ? Object.entries(MAIN_MODULES).map(([id, label]) => dial(id, label, values.get(id))) : []));
    };

    // ---- Révélation de la carte : cadre qui s'ouvre, texte qui s'écrit -----

    let revealKey = null;
    let lastTravelKey; // undefined : rien reçu encore (pas de voyage au chargement)
    // Texte de la carte écrit lettre par lettre, comme l'écran de jeu
    // (card.js, writeCardDesc) : 22 ms par lettre ; à chaque pause {....},
    // quatre points (400 ms chacun), puis le texte s'efface et repart à zéro.
    // Un clic sur la carte accélère (pauses divisées par 15, 5 lettres à la fois).
    const STOP_TOKEN = '{....}';
    const lastSegment = (text) => String(text || '').split(STOP_TOKEN).pop();
    let typingRun = 0;
    let typingFast = false;
    const typePause = (ms) => new Promise(r => setTimeout(r, typingFast ? ms / 15 : ms));
    const typeText = async function (node, text) {
        let run = ++typingRun;
        typingFast = false;
        let segments = String(text || '').split(STOP_TOKEN);
        for (let s = 0; s < segments.length; s++) {
            richText(node, segments[s]);
            let parts = [];
            const walk = (n) => n.childNodes.forEach(c => c.nodeType === Node.TEXT_NODE ? parts.push([c, c.textContent]) : walk(c));
            walk(node);
            parts.forEach(([c]) => { c.textContent = ''; });
            let count = 0;
            for (let [c, full] of parts) {
                for (let i = 0; i < full.length; i++) {
                    c.textContent += full[i];
                    if (!typingFast || ++count % 5 === 0)
                        await typePause(21.7);
                    if (run !== typingRun)
                        return;
                }
            }
            if (s === segments.length - 1)
                break;
            let dots = document.createTextNode('');
            node.append(dots);
            for (let d = 0; d < 4; d++) {
                await typePause(400);
                if (run !== typingRun)
                    return;
                dots.textContent += '.';
            }
            await typePause(500);
            if (run !== typingRun)
                return;
        }
    };
    // Texte en entier tout de suite (carte déjà écrite) : la dernière partie
    const showText = function (node, text) {
        typingRun++;
        richText(node, lastSegment(text));
    };

    const reveal = function (frame, key, textNode) {
        if (key === revealKey)
            return;
        revealKey = key;
        if (!key) {
            typingRun++;
            return;
        }
        if (!reduceMotion) {
            frame.classList.remove('revealing');
            void frame.offsetWidth; // relance l'animation
            frame.classList.add('revealing');
        }
        // L'écriture lettre par lettre fait partie du jeu : gardée même
        // quand l'appareil demande moins d'animations, comme chez le MJ
        if (textNode)
            typeText(textNode, textNode.dataset.text);
    };
    $('game-card').addEventListener('click', () => { typingFast = true; });

    // Texte de la carte, écrit en même temps que sur l'écran du MJ : sa page
    // annonce chaque texte qu'elle commence à écrire (et le clic qui accélère)
    let mjText = null;        // {text, seq, at} : dernier texte annoncé
    let textCardId = null;    // carte dont le texte est affiché
    let textFallback = null;
    const MJ_TEXT_RECENT = 3000;
    const onCardText = function (data) {
        if (data.fast) {
            if (mjText && data.seq === mjText.seq)
                typingFast = true;
            return;
        }
        mjText = {text: String(data.text || ''), seq: data.seq, at: Date.now()};
        clearTimeout(textFallback);
        let node = $('card-desc');
        node.dataset.text = mjText.text;
        if (data.late)
            showText(node, mjText.text);
        else
            typeText(node, mjText.text);
    };
    // Nouvelle carte : texte vidé en attendant celui du MJ (sauf s'il vient
    // d'arriver, juste avant l'état de la partie). Sans nouvelles de sa page,
    // le texte de la carte s'affiche quand même.
    const syncCardText = function (card) {
        if (card.id === textCardId)
            return;
        textCardId = card.id;
        clearTimeout(textFallback);
        if (mjText && Date.now() - mjText.at < MJ_TEXT_RECENT)
            return;
        typingRun++;
        $('card-desc').replaceChildren();
        textFallback = setTimeout(() => {
            if (textCardId === card.id && (!mjText || Date.now() - mjText.at > 6000))
                showText($('card-desc'), card.desc);
        }, 6000);
    };

    // ---- Partie : carte en cours, status, alerte ---------------------------

    // ---- Compte à rebours des choix (envoyé par la page de jeu chaque seconde)

    let timer = null;
    let timerSeen = 0;
    // Animation de l'écran de jeu (timer-anim.js) : chaque seconde reçue fait
    // avancer le bras et la boule ; fin du temps : pschitt et lancer ;
    // choix fait avant : la boule se dissipe
    let timerLast = null;
    if (window.LNOB_TIMER_HTML)
        $('timer-host').innerHTML = LNOB_TIMER_HTML;
    const timerAnim = function (next) {
        if (typeof TimerAnim === 'undefined' || !$('bigboite'))
            return;
        let box = $('bigboite');
        try {
            if (next && !next.paused) {
                // Arrivé en cours de compte à rebours : bras déjà sorti
                if (next.left < 30 && !box.classList.contains('float'))
                    box.classList.add('grow', 'float', 'idle');
                TimerAnim.tick(next.left);
            }
            else if (!next && timerLast) {
                if (timerLast.left <= 1) {
                    TimerAnim.tick(0);
                    TimerAnim.finish();
                }
                else
                    TimerAnim.cancel();
            }
        } catch (e) { /* animation seulement */ }
        timerLast = next;
    };
    const renderTimer = function () {
        let card = game && game.card;
        let show = !!(timer && card && !game.combat && card.kind !== 'planet' && timer.cardId === String(card.id)
            && (timer.paused || Date.now() - timerSeen < 3500));
        $('card-timer').hidden = !show;
        if (!show)
            return;
        $('card-timer-text').textContent = String(timer.left).padStart(2, '0');
        $('card-timer-fill').style.width = Math.min(100, timer.left / 30 * 100) + '%';
        $('card-timer').classList.toggle('paused', timer.paused);
        $('card-timer').classList.toggle('critical', timer.left <= 5);
        $('card-timer').classList.toggle('warn', timer.left <= 10);
        $('card-timer').title = timer.paused ? 'Compte à rebours en pause' : 'Temps restant pour choisir';
    };
    // Plus de nouvelles de la page de jeu : le chrono disparaît
    setInterval(() => { if (timer && !timer.paused && !$('card-timer').hidden) renderTimer(); }, 1000);

    const renderGame = function () {
        let phase = game ? game.phase : 'init';
        let score = game && game.score;
        let combat = game && game.combat;
        let card = game && game.card;
        // Lancement de la partie : synopsis puis fiche du vaisseau, comme une
        // carte avec un seul choix « Continuer »
        let intro = !!card && card.kind === 'intro';
        renderHud();
        renderCrewStrip();

        // Bandeau d'attente (lancement, création, fin sans score)
        let text = PHASES[phase] !== undefined ? PHASES[phase] : '';
        if ((phase === 'postGame' && score) || intro)
            text = '';
        if (phase === 'gameLive' && !card && !combat)
            text = 'Le MJ prépare la suite…';
        $('phase-text').textContent = text;
        $('phase').hidden = !text;
        let character = you && you.character;
        $('phase-action').hidden = phase !== 'creation';
        $('phase-action').textContent = character ? 'Voir ma fiche' : 'Créer mon personnage';

        renderEnd(phase === 'postGame' ? score : null);

        let onStage = intro || (phase === 'gameLive' && !!(card || combat));
        $('stage').hidden = !onStage;
        if (!onStage) {
            renderPlanet(null);
            reveal($('game-card'), null);
        }
        renderDials($('module-dials'));
        renderCombat(onStage ? combat : null);
        renderTimer();
        // Nouvelle carte : voyage rapide dans les étoiles, comme initCard()
        let travelKey = card ? String(card.id) : null;
        if (game) {
            if (travelKey && travelKey !== lastTravelKey && lastTravelKey !== undefined)
                starWarp();
            lastTravelKey = travelKey;
        }
        let showCard = onStage && !combat && !!card;
        let isPlanet = showCard && card.kind === 'planet';
        $('game-card').hidden = !showCard || isPlanet;
        renderPlanet(isPlanet ? card.planet : null);
        planetShown = isPlanet;
        updatePlanetMode();
        $('game-card').classList.toggle('intro-card', !!intro);
        if (showCard && !isPlanet && card.kind !== 'intro') {
            // Texte écrit au rythme du MJ (message card-text) : rien n'est
            // écrit avant que sa page commence
            $('card-kind').textContent = card.title || CARD_KINDS[card.kind] || '';
            $('card-desc').hidden = false;
            syncCardText(card);
            reveal($('game-card'), 'card|' + card.id);
        }
        else if (showCard && !isPlanet) {
            $('card-kind').textContent = card.title || CARD_KINDS[card.kind] || '';
            let key = card.id + '|' + (card.screen || '') + '|' + card.desc;
            if (key !== revealKey) {
                $('card-desc').dataset.text = card.desc;
                showText($('card-desc'), card.desc);
            }
            $('card-desc').hidden = !card.desc;
            reveal($('game-card'), key, $('card-desc'));
        }
        else if (isPlanet)
            reveal($('planet'), 'planet|' + card.id);
        // Dernière planète du voyage : texte envoyé par le jeu (lang.json)
        let last = showCard && card.lastPlanet;
        $('card-last').hidden = !last;
        $('card-last').textContent = last ? last.title + ' : ' + last.text : '';

        // Choix sous la carte, comme les onglets de l'écran de jeu : on vote,
        // le MJ tranche. Votes possibles quand la page de jeu a annoncé ses
        // choix (card.screen) et que le MJ n'a pas encore cliqué.
        let choices = showCard ? (card.choices || []) : [];
        let canVote = showCard && !!card.screen && card.chosen === null && !!character;
        let myVote = intro ? (you && you.introReady ? 0 : null) : (you ? you.vote : null);
        // Planète : comme chez le MJ, on vote sur les scans de la liste et
        // sur les boutons Atterrir / Continuer, pas sur des onglets
        let planetVoting = showCard && !intro && card.kind === 'planet';
        renderPlanetVotes(planetVoting ? card : null, canVote, myVote);
        if (planetVoting)
            choices = [];
        $('card-choices').hidden = !choices.length;
        $('card-choices').replaceChildren(...choices.map((c, i) => {
            let li = el('li', 'choice-tab');
            let count = (card.counts || [])[i] || 0;
            li.classList.toggle('voted', myVote === i);
            li.classList.toggle('chosen', card.chosen === i);
            li.classList.toggle('dimmed', card.chosen !== null && card.chosen !== undefined && card.chosen !== i);
            let body = richText(el(canVote ? 'button' : 'span', 'choice-text'), c);
            if (canVote) {
                body.type = 'button';
                body.title = myVote === i ? 'Retirer mon vote' : 'Voter pour ce choix';
                body.addEventListener('click', () => intro
                    ? sendAction('intro-ready', {ready: myVote !== i})
                    : sendAction('vote', {index: myVote === i ? null : i}));
            }
            li.append(body);
            if (intro && card.expected)
                li.append(el('span', 'choice-votes', count + '/' + card.expected + ' prêts'));
            else if (count)
                li.append(el('span', 'choice-votes', count + (count > 1 ? ' votes' : ' vote')));
            return li;
        }));
        let note = '';
        if (intro)
            note = !character ? 'Il faut un perso pour voter.'
                : myVote === 0 ? 'Prêt ! On attend le reste de l\'équipage. Touche à nouveau pour annuler.'
                : 'Lis le texte, puis touche Continuer quand tu es prêt.';
        else if (combat)
            note = 'Combat en cours : lance tes dés depuis l\'onglet Perso quand le MJ te le demande.';
        else if (showCard && card.kind === 'planet' && canVote)
            note = myVote === null || myVote === undefined ? 'Touche un scan ou un bouton pour voter, le MJ scanne sur l\'écran principal.' : 'Vote envoyé. Touche ton choix à nouveau pour le retirer.';
        else if (showCard && card.kind === 'planet')
            note = card.chosen !== null && card.chosen !== undefined ? 'Le MJ a choisi.' : 'Le MJ scanne la planète sur l\'écran principal.';
        else if (showCard && card.chosen !== null && card.chosen !== undefined)
            note = 'Le MJ a choisi.';
        else if (canVote)
            note = myVote === null || myVote === undefined ? 'Vote pour un choix, le MJ tranche.' : 'Vote envoyé. Touche ton choix à nouveau pour le retirer.';
        else if (choices.length)
            note = character ? 'Le MJ choisit pour l\'équipage.' : 'Il faut un perso pour voter.';
        $('card-note').textContent = note;
        $('card-note').hidden = !note;

        let alert = game && game.alerts && game.alerts.alert;
        $('ship-alert').hidden = !alert;
        if (alert)
            $('ship-alert').textContent = '⚠ ' + alert.name + (alert.message ? ' : ' + alert.message : '');
        // Le MJ affiche le plan : on bascule sur l'onglet Vaisseau
        if (game && game.alerts && (game.alerts.showMap || alert) && !renderGame.mapShown)
            selectTab('ship');
        renderGame.mapShown = !!(game && game.alerts && (game.alerts.showMap || alert));
    };

    // ---- Combat ------------------------------------------------------------

    const renderCombat = function (combat) {
        $('combat').hidden = !combat;
        if (!combat)
            return;
        $('combat-turn').textContent = 'Tour ' + combat.turn;
        $('combat-order').replaceChildren(...(combat.order || []).map((f, i) => {
            let li = el('li', 'combat-chip kind-' + f.kind + (i === combat.current ? ' current' : '') + (f.kind === 'player' && f.id === playerId ? ' me' : ''), f.name);
            if (i === combat.current)
                li.setAttribute('aria-current', 'true');
            return li;
        }));
        let current = (combat.order || [])[combat.current];
        $('combat-enemies').dataset.count = combat.enemies.length;
        $('combat-enemies').replaceChildren(...combat.enemies.map(e => {
            let li = el('li', 'combat-enemy' + (e.ko ? ' ko' : '') + (current && current.kind === 'enemy' && current.id === String(e.id) ? ' acting' : ''));
            li.append(el('p', 'combat-enemy-name', e.name));
            let track = el('span', 'combat-bar');
            let fill = el('span', 'combat-bar-fill');
            let pct = e.maxHp ? Math.max(0, e.hp) / e.maxHp * 100 : 0;
            fill.style.width = pct + '%';
            fill.dataset.level = pct <= 25 ? 'crit' : pct <= 50 ? 'warn' : '';
            track.append(fill);
            li.append(track, el('p', 'combat-enemy-hp', e.ko ? 'K.O.' : Math.max(0, e.hp) + ' / ' + e.maxHp + ' PV'));
            return li;
        }));
        let loot = combat.loot;
        $('combat-loot').hidden = !loot;
        if (loot)
            $('combat-loot-items').replaceChildren(...(loot.length ? loot : ['Rien à ramasser']).map(name => el('li', 'combat-loot-item', name)));
    };

    // ---- Fin de partie : écran de score -------------------------------------

    let endShown = null;
    const countUp = function (node, value) {
        let target = Math.round(Number(value) || 0);
        if (reduceMotion) {
            node.textContent = target.toLocaleString('fr-FR');
            return;
        }
        let start = performance.now();
        const step = (now) => {
            let t = Math.min(1, (now - start) / 1600);
            node.textContent = Math.round(target * (1 - Math.pow(1 - t, 3))).toLocaleString('fr-FR');
            if (t < 1)
                requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    };

    const renderEnd = function (score) {
        $('end-screen').hidden = !score;
        if (!score) {
            if (endShown) {
                $('end-planet').replaceChildren();
                endShown = null;
            }
            return;
        }
        let key = JSON.stringify(score);
        if (key === endShown)
            return;
        endShown = key;
        let lines = [['Humains en vie', score.cryopods], ['Score vaisseau', score.scoreShip], ['Score planète', score.scorePlanet], ['Bonus cartes', score.scoreCards], ['Score total', score.scoreTotal]];
        $('end-lines').replaceChildren(...lines.flatMap(([label, value], i) => {
            let dt = el('dt', i === lines.length - 1 ? 'total' : '', label);
            let dd = el('dd', i === lines.length - 1 ? 'total' : '', '0');
            setTimeout(() => countUp(dd, value), reduceMotion ? 0 : i * 450);
            return [dt, dd];
        }));
        $('end-humans').textContent = score.cryopods;
        let ship = score.ship || {};
        $('end-modules').replaceChildren(...Object.entries(MAIN_MODULES).map(([id, label]) => dial(id, label, ship[id])),
            ...SECOND_MODULES.map(([id, label]) => {
                let li = el('li', 'end-secondary');
                li.append(el('span', 'dim', label), el('strong', '', (ship[id] || 0) + ' %'));
                return li;
            }));
        let planet = score.planet || {};
        $('end-planet-name').textContent = planet.name ? 'Planète atteinte : ' + planet.name : 'Planète atteinte';
        if (window.PlanetView && planet.modules) {
            let canvas = el('canvas', 'planet-canvas');
            canvas.setAttribute('aria-hidden', 'true');
            $('end-planet').replaceChildren(canvas);
            let size = canvas.clientWidth || 240;
            PlanetView.create(canvas, {size: size, radius: size * .3, modules: planet.modules, seed: planet.id, revealed: 'all'});
        }
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
                radius: size * .3,
                modules: planet.modules || {},
                seed: planet.id,
                revealed: fresh ? keys : planetDrawn.keys
            });
            if (!fresh)
                view.reveal(added);
            planetDrawn = {id: planet.id, keys: keys};
        }

        let points = planet.points === null || planet.points === undefined ? '…' : planet.points;
        $('planet-points').replaceChildren('Points de détection : ', el('strong', '', String(points)));
        $('planet-drones').textContent = 'Drones : ' + (planet.drones || 0);
        $('planet-scans').replaceChildren(...scans.map(s => {
            let li = el('li', s.revealed ? 'scanned' : '');
            li.dataset.label = s.label;
            let head = el('div', 'scan-head');
            head.append(el('span', 'scan-label', 'Scan ' + s.label));
            if (!s.revealed && s.cost !== null && s.cost !== undefined)
                head.append(el('span', 'scan-cost', s.cost + ' pts'));
            li.append(head);
            if (s.revealed)
                li.append(el('p', 'scan-text', s.text));
            return li;
        }));
        // Relevés autour de la planète : nom et coût, ou « scanné »
        $('planet-labels').replaceChildren(...scans.map(s => {
            let left = PLANET_LEFT.includes(s.key);
            let li = el('li', 'planet-label ' + (left ? 'left' : 'right') + ' row-' + (left ? PLANET_LEFT.indexOf(s.key) : scans.filter(x => !PLANET_LEFT.includes(x.key)).indexOf(s)) + (s.revealed ? ' scanned' : ''));
            li.append(el('span', 'planet-label-name', s.label));
            li.append(el('span', 'planet-label-cost', s.revealed ? 'scanné' : (s.cost !== null && s.cost !== undefined ? 'coût : ' + s.cost : '')));
            return li;
        }));
    };

    // Votes de la page planète : chaque choix annoncé par le MJ est un scan
    // (même nom que dans la liste) ou un bouton de sortie (Atterrir…)
    const renderPlanetVotes = function (card, canVote, myVote) {
        let choices = card ? (card.choices || []) : [];
        let counts = card ? (card.counts || []) : [];
        const votes = (i) => counts[i] ? counts[i] + (counts[i] > 1 ? ' votes' : ' vote') : '';
        const wire = (node, i) => {
            node.classList.toggle('voted', myVote === i);
            node.classList.toggle('chosen', card.chosen === i);
            if (votes(i))
                node.dataset.votes = votes(i);
            else
                delete node.dataset.votes;
            if (!canVote)
                return;
            node.classList.add('votable');
            node.tabIndex = 0;
            node.setAttribute('role', 'button');
            node.title = myVote === i ? 'Retirer mon vote' : 'Voter pour ce scan';
            const go = () => sendAction('vote', {index: myVote === i ? null : i});
            node.addEventListener('click', go);
            node.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
        };
        let scanItems = Array.from($('planet-scans').children);
        let scanLabels = scanItems.map(li => li.dataset.label);
        scanItems.forEach(li => {
            let i = choices.indexOf(li.dataset.label);
            if (i >= 0)
                wire(li, i);
        });
        $('planet-exits').replaceChildren(...choices.map((c, i) => [c, i]).filter(([c]) => !scanLabels.includes(c)).map(([c, i]) => {
            let b = el('button', 'planet-exit' + (/atterrir|terminer/i.test(c) ? ' land' : ''), c);
            b.type = 'button';
            wire(b, i);
            if (!canVote)
                b.disabled = true;
            return b;
        }));
        $('planet-exits').hidden = !$('planet-exits').children.length;
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

    // Plan : contour du vaisseau, salles et noms (ship-labels.js)
    const shipSvg = function () {
        return typeof ShipLabels === 'undefined' ? null : ShipLabels.setup($('ship-plan'));
    };

    const renderShip = function () {
        let ship = game && game.ship;
        $('cryopods').textContent = ship ? 'Humains en cryogénie : ' + ship.cryopods : 'Pas encore de vaisseau.';
        renderDials($('ship-main'));
        $('ship-modules').replaceChildren(...(ship ? ship.modules.filter(m => !MAIN_MODULES[m.id]).map(m => bar(m.label, m.value, 100)) : []));

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
        // Race aléatoire : une autre que celle déjà choisie
        let others = races.filter(r => r.slug !== character.race);
        if (others.length) {
            let random = el('button', 'race');
            random.type = 'button';
            random.append(el('strong', '', '🎲 Race aléatoire'), el('span', 'dim small-text', 'Laisse le hasard choisir'));
            random.addEventListener('click', () => sendAction('set-race', {race: others[Math.floor(Math.random() * others.length)].slug}));
            $('race-list').prepend(random);
        }
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

    // Après le dernier dé, le tirage reste affiché jusqu'au clic sur Continuer
    let rollsHeld = false;
    let lastCreationStep = null;

    const renderRolls = function (creation) {
        $('stat-rolls').hidden = !creation || !creation.stats || (creation.step !== 'stats' && !rollsHeld);
        $('rolls-done').hidden = !rollsHeld;
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
        $('sheet-race').hidden = !character.raceName;
        $('sheet-role').textContent = character.role ? character.role.name : '';
        $('sheet-role').title = character.role ? character.role.name + ' : ' + character.role.effect : '';
        // Stats en tuiles, avec les icônes de l'écran de jeu
        $('sheet-stats').replaceChildren(...HUD_STATS.map(([stat, label]) => {
            let tile = el('div', 'stat-tile');
            tile.append(svgIcon('stat-icon', window.LNOB_STAT_SVG && LNOB_STAT_SVG[stat]), el('span', 'stat-tile-label', label),
                el('strong', 'stat-tile-value', String(character[stat] || 0)));
            let track = el('span', 'bar-track');
            let fill = el('span', 'bar-fill');
            fill.style.width = Math.max(0, Math.min(100, Number(character[stat]) || 0)) + '%';
            track.append(fill);
            tile.append(track);
            return tile;
        }));
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

        let step = creation ? creation.step : null;
        if (lastCreationStep === 'stats' && step === 'done' && creation.stats)
            rollsHeld = true;
        else if (step !== 'done')
            rollsHeld = false;
        lastCreationStep = step;
        let creating = !!(character && creation && (step !== 'done' || rollsHeld));
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
        // Bourse du joueur (« 20 crédits »)
        $('money').hidden = !(you && you.money);
        $('money').textContent = you && you.money ? 'Bourse : ' + you.money : '';
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
            mjState();
            updateMjScreen();
        }
        else if (data.kind === 'card-text') {
            onCardText(data);
            if (!data.fast)
                mjLastText = {text: data.text, seq: data.seq};
            toMjScreen({lnob: 'card-text', data: data});
        }
        else if (data.kind === 'mj-event' && data.payload && typeof data.payload.action === 'string') {
            // Gardés pour un écran rechargé : le dernier inventaire, combat, butin
            if (MJ_REPLAY.includes(data.payload.action))
                mjLastEvents.set(data.payload.action, data.payload);
            toMjScreen({lnob: 'mj-event', payload: data.payload});
        }
        else if (data.kind === 'timer') {
            timer = data.timer && Number.isInteger(data.timer.left) ? data.timer : null;
            mjLastTimer = timer;
            toMjScreen({lnob: 'timer', timer: timer});
            timerSeen = Date.now();
            timerAnim(timer);
            renderTimer();
        }
        else if (data.kind === 'you') {
            you = data;
            mjState();
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
            $('roll-result').textContent = '🎲 ' + (r.dice ? 'meilleur de ' + r.dice.join(' / ') + ' = ' : '') + r.dice_result + ' → ' + r.result + ' : ' + (r.success ? 'réussite !' : 'échec.');
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

    // ---- Fond étoilé ---------------------------------------------------------

    // Fond étoilé de l'écran de jeu (public/js/stars.js) : étoiles en 3D qui
    // dérivent très lentement ; elles ne s'étirent en traînées que pendant
    // le voyage entre deux cartes (fastTravel, 2 s)
    (function () {
        let canvas = $('starfield');
        let ctx = canvas.getContext && canvas.getContext('2d');
        if (!ctx)
            return;
        const STARS = 1000, FOV = 20, BASE_SPEED = .015, STRETCH = 5, BASE_SIZE = .08, TRAVEL = 2000;
        let w = 0, h = 0, dpr = 1, cameraZ = 0, speed = 0, warpSpeed = 0, stars = [];
        const randomize = (star, initial) => {
            star.z = initial ? Math.random() * 2000 : cameraZ + Math.random() * 1000 + 2000;
            let deg = Math.random() * Math.PI * 2, distance = Math.random() * 50 + 1;
            star.x = Math.cos(deg) * distance;
            star.y = Math.sin(deg) * distance;
        };
        for (let i = 0; i < STARS; i++) {
            let star = {};
            randomize(star, true);
            stars.push(star);
        }
        const resize = () => {
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            w = canvas.width = innerWidth * dpr;
            h = canvas.height = innerHeight * dpr;
            canvas.style.width = innerWidth + 'px';
            canvas.style.height = innerHeight + 'px';
        };
        let last = 0;
        const draw = (now) => {
            let delta = last ? Math.min(4, (now - last) / (1000 / 60)) : 1;
            last = now;
            speed += (warpSpeed - speed) / 20;
            if (!reduceMotion)
                cameraZ += delta * 10 * (speed + BASE_SPEED);
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = ctx.strokeStyle = '#fff';
            ctx.lineCap = 'round';
            let sw = w / dpr, cx = w / 2, cy = h / 2;
            for (let star of stars) {
                if (star.z < cameraZ)
                    randomize(star);
                let z = star.z - cameraZ;
                let x = (star.x * (FOV / z) * sw) * dpr + cx;
                let y = (star.y * (FOV / z) * sw) * dpr + cy;
                let dx = x - cx, dy = y - cy;
                let dist = Math.hypot(dx, dy) / dpr;
                let ds = Math.max(0, (2000 - z) / 2000);
                // Taille du sprite (128 px dans le jeu), étirée vers le centre
                let size = 128 * ds * BASE_SIZE * .45 * dpr;
                let len = 128 * (ds * BASE_SIZE + ds * speed * STRETCH * dist / sw) * .7 * dpr;
                if (size < .2)
                    continue;
                ctx.globalAlpha = Math.min(1, .35 + ds);
                if (len <= size * 1.6) {
                    ctx.beginPath();
                    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
                    ctx.fill();
                }
                else {
                    let ux = dx / (dist * dpr || 1), uy = dy / (dist * dpr || 1);
                    ctx.lineWidth = size;
                    ctx.beginPath();
                    ctx.moveTo(x - ux * len * .3, y - uy * len * .3);
                    ctx.lineTo(x + ux * len * .7, y + uy * len * .7);
                    ctx.stroke();
                }
            }
            ctx.globalAlpha = 1;
        };
        const loop = (now) => {
            if (!document.hidden)
                draw(now);
            requestAnimationFrame(loop);
        };
        let travelTimer = null;
        starWarp = () => {
            if (reduceMotion)
                return;
            warpSpeed = 1;
            clearTimeout(travelTimer);
            travelTimer = setTimeout(() => { warpSpeed = 0; }, TRAVEL);
        };
        resize();
        addEventListener('resize', () => { resize(); draw(performance.now()); });
        if (reduceMotion)
            draw(0);
        else
            requestAnimationFrame(loop);
    })();

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

    $('phase-action').addEventListener('click', () => selectTab('me'));
    $('rolls-continue').addEventListener('click', () => {
        rollsHeld = false;
        renderMe();
    });
    $('back-game').addEventListener('click', () => selectTab('game'));
    $('menu-toggle').addEventListener('click', () => setMenu($('menu-drawer').hidden));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
    document.addEventListener('click', (e) => {
        if (!$('menu-drawer').hidden && !e.target.closest('.topbar'))
            setMenu(false);
    });
    $('chat-close').addEventListener('click', () => setChatOpen(false));
    $('chat-open').addEventListener('click', () => { setChatOpen(true); $('chat-text').focus(); });
    setChatOpen(chatOpen);

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
