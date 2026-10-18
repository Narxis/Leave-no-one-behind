// Écran de jeu porté pour les joueurs. screen.html, planet.html et end.html
// sont des copies des pages de jeu du MJ (template-card.ejs,
// template-planet.ejs, end-screen.ejs), générées par
// scripts/player-assets.js ; ce script les fait vivre comme card.js,
// planet.js et end-screen.js le font chez le MJ, mais à partir de ce que la
// page joueur (player.js) lui transmet :
//   {lnob: 'state', game, you, me}        état de la partie (relais)
//   {lnob: 'card-text', data}             texte que la page du MJ écrit
//   {lnob: 'timer', timer}                compte à rebours des choix
//   {lnob: 'mj-event', payload}           événement de l'écran du MJ (jet,
//                                         inventaires…), rejoué tel quel
// et il renvoie à la page joueur :
//   {lnobScreen: 'ready'}                 prêt à recevoir l'état
//   {lnobScreen: 'vote', index}           vote du joueur sur un choix
//   {lnobScreen: 'move', slug, to, all}   objet de son coffre donné
//   {lnobScreen: 'request', slug, owner}  objet d'un autre demandé
(function () {
    'use strict';

    const toPage = (type, data) => window.parent.postMessage(Object.assign({lnobScreen: type}, data || {}), '*');
    const q = (sel) => document.querySelector(sel);
    const esc = (text) => String(text === undefined || text === null ? '' : text)
        .replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
    // Mise en forme des intitulés de choix, comme chez le MJ (« <s>Non</s> »
    // barré…) : seules ces balises sont gardées, le reste devient du texte.
    // Le HTML est lu dans un document inerte, puis reconstruit balise par balise.
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

    let game = null;
    let you = null;
    let me = null;
    // Page planète (planet.html), écran de fin (end.html) ou carte (screen.html)
    const PLANET = !!q('.planet-summary');
    const END = !!q('.endscreen-container');

    // ---- Mise en place, comme card.js au chargement -----------------------

    // Onglets des modules qui sortent un par un (initialiseModTabs)
    const initialiseModTabs = async function () {
        for (let tab of document.querySelectorAll('#modtab .tab')) {
            await sleep(100);
            tab.classList.remove('move-right');
        }
    };
    // Onglet de gauche (objets du vaisseau, modules secondaires)
    const initialiseLeftTabs = async function () {
        await sleep(1000);
        let tab = q('.consommable-tab');
        if (tab)
            tab.classList.remove('slide-right');
        document.querySelectorAll('.todoList, .mods-left').forEach(n => n.classList.remove('hidden'));
    };

    // ---- Modules, humains, statuts -----------------------------------------

    // Modules secondaires de la page planète (template-planet.ejs)
    const PLANET_SECONDARY = {landing: 'module-9', construction: 'module-10', dbscience: 'module-11', dbhistory: 'module-12'};
    const renderShip = function (ship) {
        if (!ship)
            return;
        for (let mod of ship.modules || []) {
            let value = Math.max(0, Math.min(100, Number(mod.value) || 0));
            let dial = document.getElementById('dial-' + mod.id);
            if (dial) {
                if (dial.getAttribute('data-value') !== String(value))
                    dial.setAttribute('data-value', value);
                let button = dial.querySelector('.mod-button');
                if (button)
                    button.setAttribute('data-tooltip', String(button.getAttribute('data-tooltip') || '').replace(/\d+%$/, value + '%'));
                // Onglet ouvert : la valeur du module à la place des + et -
                // du MJ, sous son nom
                let tab = dial.closest('.tab');
                if (tab) {
                    let shown = tab.querySelector('.player-mod-value');
                    if (!shown) {
                        shown = document.createElement('div');
                        shown.className = 'player-mod-value';
                        tab.append(shown);
                    }
                    shown.textContent = value + ' %';
                }
                continue;
            }
            let left = document.getElementById(mod.id + '-value');
            if (left)
                left.innerText = value;
            let secondary = PLANET_SECONDARY[mod.id] && q('#' + PLANET_SECONDARY[mod.id] + ' .mod-value');
            if (secondary)
                secondary.innerText = value + '%';
        }
        let humans = document.getElementById('cryopods-value') || q('.humain-value');
        if (humans && ship.cryopods !== undefined && humans.innerText !== String(ship.cryopods))
            humans.innerText = ship.cryopods;
    };

    // Même rendu que card.js (initialiseStatusList, addStatus)
    let statusKey = null;
    const renderStatuses = function (list) {
        list = list || [];
        let key = JSON.stringify(list);
        if (key === statusKey)
            return;
        statusKey = key;
        let html = '<div class="status-title-line"><div class="status-title1">Status :</div><div class="status-title2">Durée</div></div>';
        for (let status of list) {
            let svg = statusSvgList[status.slug] || statusSvgList.custom || '';
            // « Blessé (Mira) » : le nom du joueur à part, comme chez le MJ
            let m = String(status.name || '').match(/^(.*) \(([^()]*)\)$/);
            let name = m && status.player ? esc(m[1]) + ' <span class="status-player">(' + esc(m[2]) + ')</span>' : esc(status.name);
            html += ` <div class="status-line" id="line_${esc(status.slug)}" title="${esc(status.desc)}">
                        ${svg}
                        <div class="status-name">${name}</div>
                        <div class="status-duration">${esc(status.duration)}</div>
                    </div>`;
        }
        if (q('.status'))
            q('.status').innerHTML = html;
    };

    // ---- Onglets des joueurs (partials/player-tabs.ejs) -------------------

    const TAB_TEMPLATE = (document.getElementById('player-tab-template') || {}).innerHTML || '';
    const STATS = ['combat', 'pilotage', 'engineering', 'survival', 'recon', 'moral'];
    const raceLabel = (race) => String(race || '').split(/[_ ]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-');
    // Images du jeu (/img/…) : recopiées à côté de cet écran
    const imageUrl = (src) => /^data:image\//.test(src || '') ? src : (/^\/img\//.test(src || '') ? src.slice(1) : '');

    const buildTab = function (player) {
        let html = TAB_TEMPLATE.split('__ID__').join(esc(player.id)).split('__NAME__').join(esc(player.name));
        for (let stat of STATS) {
            let value = player.stats && player.stats[stat] !== undefined && player.stats[stat] !== null ? player.stats[stat] : '';
            html = html.split('__' + stat.toUpperCase() + '__').join(esc(value));
        }
        let box = document.createElement('div');
        box.innerHTML = html.trim();
        let tab = box.firstElementChild;
        // Race sous le nom, comme chez le MJ
        if (player.race) {
            let race = document.createElement('div');
            race.className = 'player-race';
            race.textContent = raceLabel(player.race);
            tab.querySelector('.player-name').append(race);
        }
        tab.classList.toggle('player-me', player.id === me);
        // Ouvrir les stats (« ? ») et le coffre, comme players.js
        tab.querySelector('.expander').addEventListener('mouseup', () => tab.classList.toggle('move-up'));
        tab.querySelector('.expander-item').addEventListener('mouseup', function () {
            this.lastElementChild.classList.toggle('itemshow');
        });
        return tab;
    };

    let teamKey = null;
    const renderTeam = function (team) {
        team = team || [];
        let container = document.getElementById('playertabs_container');
        let ids = team.map(p => p.id).join('|');
        if (ids !== teamKey) {
            // Nouveaux arrivants : onglet créé ; partants : retirés
            teamKey = ids;
            let keep = new Set(team.map(p => 'player-tab' + p.id));
            container.querySelectorAll('.player-tab').forEach(tab => { if (!keep.has(tab.id)) tab.remove(); });
            team.forEach((player, i) => {
                let tab = document.getElementById('player-tab' + player.id);
                if (!tab) {
                    tab = buildTab(player);
                    // Entrée comme sur l'écran de jeu (initialisePlayerTab)
                    setTimeout(() => tab.classList.remove('load-in'), 100 * (i + 1));
                }
                container.append(tab);
            });
        }
        // Stats et rôles qui changent : mêmes fonctions que chez le MJ (players.js)
        for (let player of team) {
            if (player.stats)
                syncPlayerStats({detail: {data: Object.assign({discord_id: player.id}, player.stats)}});
            let box = document.querySelector('#player-tab' + player.id + ' .player-role');
            let role = player.roleInfo ? Object.assign({}, player.roleInfo, {icon: imageUrl(player.roleInfo.icon)}) : null;
            if (box && box.dataset.role !== (role ? role.slug : ''))
                syncPlayerRole({detail: {data: {discord_id: player.id, role: role}}});
        }
    };

    // Jet d'un joueur : chiffres qui défilent (players.js), puis l'icône de
    // la stat, comme card.js
    document.addEventListener('roll', async function (e) {
        let player = document.getElementById('player-tab' + e.detail.data.discord_id);
        if (!player)
            return;
        player.querySelectorAll('.output-absolute').forEach(icon => icon.classList.add('hide-opacity'));
        await sleep(1000);
        let icon = player.querySelector('#output-' + e.detail.data.stat);
        if (icon)
            icon.classList.remove('hide-opacity');
    });

    // ---- Objets : chacun range son propre coffre --------------------------
    // Le joueur glisse un objet de son coffre sur l'onglet d'un autre joueur
    // ou sur la liste du vaisseau pour le donner (le glisser-déposer
    // d'inventory.js, comme chez le MJ). Il ne prend rien chez les autres :
    // un clic sur leur objet le demande (son logo s'affiche à côté, un message
    // part dans le chat), un second clic retire la demande. Le butin reste
    // distribué par le MJ.
    let itemAsks = [];
    const canHandleItems = () => !!(me && you && you.character);
    const isOwnLine = (line) => !!line && canHandleItems() && line.matches('.itemlist-line[data-slug]')
        && !line.closest('.npc-tab') && line.dataset.owner === String(me);
    // Objet d'un autre joueur ou du vaisseau : {slug, owner}
    const askable = function (target) {
        if (!canHandleItems())
            return null;
        let line = target.closest('.player-tab:not(.npc-tab) .itemlist-line[data-slug]');
        if (line && line.dataset.owner !== String(me))
            return {slug: line.dataset.slug, owner: {type: 'player', id: line.dataset.owner}};
        let li = target.closest('.todos li[data-slug]');
        if (li)
            return {slug: li.dataset.slug, owner: {type: 'ship'}};
        return null;
    };
    const askedByMe = (slug, owner) => itemAsks.some(r => r.slug === slug && r.owner.type === owner.type
        && String(r.owner.id || '') === String(owner.id || '') && (r.from || []).some(f => f.id === String(me)));

    // Seuls ses propres objets s'attrapent
    window.addEventListener('pointerdown', (e) => {
        let line = e.target.closest && e.target.closest('[data-slug], .itemlist-line, .todos li');
        if (line && !(isOwnLine(line) && !e.target.closest('.item-trash')))
            e.stopPropagation();
    }, true);
    // Clic sur un objet : le coffre reste ouvert, la case du vaisseau n'est
    // pas cochée ; sur l'objet d'un autre, c'est une demande
    for (let type of ['mouseup', 'click'])
        window.addEventListener(type, (e) => {
            if (!e.target.closest || !e.target.closest('.itemlist-line, .todos li[data-slug]'))
                return;
            e.stopPropagation();
            if (type !== 'click')
                return;
            e.preventDefault();
            let ask = askable(e.target);
            if (ask && e.button === 0)
                toPage('request', ask);
        }, true);

    // Lâché sur un joueur ou le vaisseau (inventory.js) : la page joueur
    // l'envoie au relais, qui le donne depuis son coffre
    wsLNOB.send = function (msg) {
        let d = msg && msg.action === 'inventory-move' && msg.data;
        if (!d || !d.from || d.from.type !== 'player' || String(d.from.id) !== String(me) || !d.to)
            return;
        toPage('move', {slug: String(d.slug || ''), to: d.to.type === 'ship' ? {type: 'ship'} : {type: 'player', id: String(d.to.id || '')}, all: !!d.all});
    };

    // Ce que chaque objet permet, au survol
    const markItems = function () {
        document.querySelectorAll('.player-tab:not(.npc-tab) .itemlist-line[data-slug], .todos li[data-slug]').forEach(line => {
            let own = isOwnLine(line);
            let ask = !own && askable(line);
            line.classList.toggle('player-own', own);
            line.classList.toggle('player-ask', !!ask);
            line.classList.toggle('player-asked', !!ask && askedByMe(ask.slug, ask.owner));
            let count = line.querySelector('.item-count');
            line.title = own ? 'Glisser sur un joueur ou sur le vaisseau pour le donner' + (count ? ' (Maj : toute la pile)' : '')
                : ask ? (askedByMe(ask.slug, ask.owner) ? 'Annuler ma demande' : 'Demander cet objet') : '';
        });
    };

    // ---- Texte de la carte, au rythme de la page du MJ ---------------------
    // Même écriture que card.js (writeCardDesc) : 21,7 ms par lettre, quatre
    // points à chaque pause {....}, puis le texte repart à zéro ; un clic
    // accélère (pauses divisées par 15, cinq lettres à la fois).

    let writeRun = 0;
    let writeFast = false;
    let mjText = null;      // {text, seq, at} : dernier texte annoncé par le MJ
    let textCardId = null;
    let textFallback = null;
    const pause = (ms) => sleep(writeFast ? ms / 15 : ms);

    const writeCardDesc = async function (text) {
        let run = ++writeRun;
        writeFast = false;
        let stopToken = '‡';
        let textDiv = q('.card-text');
        let currentText = '';
        text = String(text || '').replaceAll('{....}', stopToken);
        for (let i = 0; i <= text.length; i++) {
            if (run !== writeRun)
                return;
            textDiv.innerText = currentText;
            if (text.substring(i, i + 1) === stopToken) {
                for (let j = 0; j < 4; j++) {
                    await pause(400);
                    if (run !== writeRun)
                        return;
                    currentText += '.';
                    textDiv.innerText = currentText;
                }
                currentText = '';
                await pause(500);
            }
            else
                currentText += text.substring(i, i + 1);
            if (!writeFast || i % 5 === 0)
                await pause(21.7);
        }
        if (run === writeRun)
            textDiv.innerText = currentText;
    };
    // Texte déjà écrit (arrivée en cours de carte) : sa dernière partie
    const showCardDesc = function (text) {
        writeRun++;
        q('.card-text').innerText = String(text || '').split('{....}').pop();
    };

    const onCardText = function (data) {
        if (!data)
            return;
        if (data.fast) {
            if (mjText && data.seq === mjText.seq)
                writeFast = true;
            return;
        }
        mjText = {text: String(data.text || ''), seq: data.seq, at: Date.now()};
        clearTimeout(textFallback);
        if (data.late)
            showCardDesc(mjText.text);
        else
            writeCardDesc(mjText.text);
    };

    // Nouvelle carte : texte vidé en attendant celui du MJ ; sans nouvelles
    // de sa page, le texte de la carte s'affiche quand même
    const syncCardText = function (card) {
        if (!card || card.id === textCardId)
            return;
        textCardId = card.id;
        clearTimeout(textFallback);
        if (mjText && Date.now() - mjText.at < 3000)
            return;
        writeRun++;
        q('.card-text').innerText = '';
        textFallback = setTimeout(() => {
            if (textCardId === card.id && (!mjText || Date.now() - mjText.at > 6000))
                showCardDesc(card.desc);
        }, 6000);
    };

    // Clic sur la carte pendant l'écriture : le texte s'accélère
    document.addEventListener('mouseup', function (e) {
        if (e.button === 0 && e.target.closest('.container-card'))
            writeFast = true;
    });

    // ---- Choix, comme les boutons de l'écran de jeu ------------------------
    // Ils arrivent un par un sous la carte quand la page du MJ les montre
    // (card.screen), et repartent quand le MJ a choisi. Le joueur vote :
    // son choix est entouré, les voix s'affichent sous chaque bouton.

    let choicesKey = null;
    let choicesRun = 0;

    const hideChoices = async function () {
        let run = ++choicesRun;
        let buttons = document.querySelectorAll('#choicetab .choice');
        for (let btn of buttons) {
            btn.classList.add('move-down');
            await sleep(50);
        }
        await sleep(1000);
        if (run === choicesRun)
            q('#choicetab').innerHTML = '';
    };

    const showChoices = async function (choices) {
        let run = ++choicesRun;
        let tab = q('#choicetab');
        tab.innerHTML = '';
        for (let i = 0; i < choices.length; i++) {
            if (run !== choicesRun)
                return;
            let btn = document.createElement('button');
            btn.classList.add('choice', 'move-down');
            btn.id = 'choice' + i;
            btn.type = 'button';
            richText(btn, choices[i]);
            btn.addEventListener('mouseup', () => vote(i));
            tab.append(btn);
            updateVotes();
            await sleep(150);
            btn.classList.remove('move-down');
        }
    };

    const canVote = function () {
        let card = game && game.card;
        return !!(card && card.screen && card.chosen === null && you && you.character);
    };
    const vote = function (i) {
        if (!canVote())
            return;
        toPage('vote', {index: you.vote === i ? null : i});
    };

    // Voix sous chaque bouton (comme showVotes chez le MJ) et vote du joueur
    const updateVotes = function () {
        let card = game && game.card;
        let mine = you ? you.vote : null;
        document.querySelectorAll('#choicetab .choice').forEach((btn, i) => {
            let count = card && card.counts ? card.counts[i] || 0 : 0;
            let badge = btn.querySelector('.vote-count');
            if (!count && badge)
                badge.remove();
            else if (count) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'vote-count';
                    btn.append(badge);
                }
                // Logo du rôle de ceux qui ont voté, puis le nombre de voix
                let voters = ((card && card.voters) || []).filter(v => v.index === i);
                let key = count + '|' + voters.map(v => v.id).join(',');
                if (badge.dataset.key !== key) {
                    badge.dataset.key = key;
                    badge.replaceChildren(voteRoleIcons(voters), count + (count > 1 ? ' votes' : ' vote'));
                }
            }
            btn.classList.toggle('player-voted', mine === i);
            btn.classList.toggle('player-chosen', !!card && card.chosen === i);
            btn.title = canVote() ? (mine === i ? 'Retirer mon vote' : 'Voter pour ce choix') : '';
        });
        q('#choicetab').classList.toggle('player-can-vote', canVote());
    };

    const renderChoices = function (card) {
        let shown = !!(card && card.screen && card.chosen === null && (card.choices || []).length);
        let key = shown ? card.id + '|' + card.screen + '|' + card.choices.join('|') : null;
        if (key !== choicesKey) {
            let had = choicesKey !== null;
            choicesKey = key;
            if (key)
                (had ? hideChoices().then(() => { if (choicesKey === key) showChoices(card.choices); }) : showChoices(card.choices));
            else if (had)
                hideChoices();
        }
        updateVotes();
    };

    // ---- Compte à rebours (bras robot), comme sur la page joueur -----------

    let timerLast = null;
    const onTimer = function (next) {
        if (typeof TimerAnim === 'undefined')
            return;
        let box = document.getElementById('bigboite');
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

    // ---- Événements de l'écran du MJ, rejoués tels quels -------------------

    const mjEvent = function (payload) {
        if (!payload || typeof payload.action !== 'string')
            return;
        // Logo du rôle donné par le MJ : celui recopié à côté de cet écran
        if (payload.action === 'player-role' && payload.data && payload.data.role) {
            let role = Object.assign({}, payload.data.role, {icon: imageUrl(payload.data.role.icon)});
            payload = Object.assign({}, payload, {data: Object.assign({}, payload.data, {role: role})});
        }
        // Images des objets : celles recopiées à côté de cet écran
        if (payload.action === 'inventory' && payload.data) {
            const fix = (item) => Object.assign({}, item, {image: imageUrl(item.image)});
            let data = Object.assign({}, payload.data);
            data.ship = (data.ship || []).map(fix);
            data.inventories = Object.fromEntries(Object.entries(data.inventories || {}).map(([id, items]) => [id, (items || []).map(fix)]));
            if (data.currency)
                data.currency = Object.assign({}, data.currency, {image: imageUrl(data.currency.image) || 'img/monnaie.svg'});
            payload = Object.assign({}, payload, {data: data});
        }
        if (payload.action === 'combat' && payload.data && payload.data.state) {
            let state = Object.assign({}, payload.data.state);
            state.enemies = (state.enemies || []).map(e => Object.assign({}, e, {loot: (e.loot || []).map(item => Object.assign({}, item, {image: imageUrl(item.image)}))}));
            payload = Object.assign({}, payload, {data: Object.assign({}, payload.data, {state: state})});
        }
        if (payload.action === 'card-loot' && payload.data && payload.data.state) {
            let state = Object.assign({}, payload.data.state);
            state.items = (state.items || []).map(item => Object.assign({}, item, {image: imageUrl(item.image)}));
            payload = Object.assign({}, payload, {data: Object.assign({}, payload.data, {state: state})});
        }
        if (payload.action === 'item-requests')
            itemAsks = (payload.data && payload.data.requests) || [];
        document.dispatchEvent(new CustomEvent(payload.action, {detail: payload}));
        if (payload.action === 'inventory' || payload.action === 'item-requests')
            markItems();
        // Butin d'une carte vidé : chez le MJ, card.js le ferme puis l'histoire
        // reprend ; ici on le ferme après le même délai
        if (payload.action === 'card-loot' && !(payload.data.state.items || []).length) {
            let area = document.getElementById('card-loot-area');
            setTimeout(() => {
                if (!area)
                    return;
                area.classList.remove('combat-in');
                area.classList.add('combat-out');
                setTimeout(() => area.classList.add('combat-none'), 400);
            }, 1400);
        }
    };

    // ---- Planète, comme planet.js chez le MJ --------------------------------
    // Chaque scan fait par le MJ est rejoué par planet.js lui-même (même trait
    // vers la planète, même texte écrit lettre à lettre, même couche qui
    // apparaît) : on lui donne le texte du scan reçu du relais, puis on
    // « clique » le bouton du scan à sa place. Les valeurs de la planète
    // n'arrivent qu'une fois scannées (planetScan.js) ; le joueur vote pour le
    // scan suivant ou pour atterrir en cliquant les mêmes boutons.

    // Clé du scan → préfixe des éléments et variables de planet.js (o2-txt,
    // pointso2, texto2, costo2…)
    const SCANS = {oxy: 'o2', cli: 'cl', ff: 'ff', res: 're', wtr: 'eau', grv: 'gr'};
    const PLANET_BUTTONS = '.p-txt, .use-drone, .land-button, .leave-button';
    const planetDone = new Set();
    let planetDriving = false;

    const replayScan = function (scan) {
        let p = SCANS[scan.key];
        let button = p && q('.' + p + '-txt');
        if (!button)
            return;
        window['text' + p] = String(scan.text || '');
        planetDriving = true;
        window.detectionPoints = Infinity;
        try {
            button.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
        } finally {
            planetDriving = false;
        }
    };

    const planetChoice = (label) => PLANET_SCANS.concat(PLANET_EXITS).find(c => c.label === label) || {button: null};
    const canPlanetVote = function () {
        let card = game && game.card;
        return !!(card && card.screen && card.chosen === null && you && you.character);
    };
    // Voix sur les boutons (le code de planet.js) et vote du joueur entouré
    const renderPlanetVotes = function (card) {
        window.planetVoteChoices = card.screen ? (card.choices || []).map(planetChoice) : [];
        document.dispatchEvent(new CustomEvent('votes', {detail: {data: {counts: card.screen ? card.counts || [] : [], voters: card.screen ? card.voters || [] : []}}}));
        document.querySelectorAll(PLANET_BUTTONS).forEach(b => b.classList.remove('player-voted', 'player-can-vote'));
        window.planetVoteChoices.forEach((choice, i) => {
            let button = choice.button && q(choice.button);
            if (!button)
                return;
            button.classList.toggle('player-can-vote', canPlanetVote());
            button.classList.toggle('player-voted', !!you && you.vote === i);
        });
    };

    const renderPlanet = function (card) {
        let planet = card.planet;
        if (!planet || String(planet.id) !== String(PLANET_DATA.id))
            return;
        let scans = planet.scans || [];
        // Coût de chaque scan sur son bouton, comme chez le MJ
        for (let scan of scans) {
            let p = SCANS[scan.key];
            let cost = scan.cost === null || scan.cost === undefined ? '' : String(scan.cost);
            let box = p && document.getElementById('points' + p);
            if (!box)
                continue;
            window['cost' + p] = cost;
            if (!planetDone.has(scan.key) && box.innerText !== cost)
                box.innerText = cost;
        }
        window.costList = scans.filter(s => !s.revealed && SCANS[s.key]).map(s => window['cost' + SCANS[s.key]]);
        // Valeurs scannées : pour dessiner les couches qui apparaissent
        if (window.planetView && planetView.update)
            planetView.update(planet.modules || {});
        for (let scan of scans)
            if (scan.revealed && !planetDone.has(scan.key)) {
                planetDone.add(scan.key);
                replayScan(scan);
            }
        let points = Number.isFinite(planet.points) ? planet.points : null;
        window.detectionPoints = points === null ? 0 : points;
        writePoints('.detection-point', points === null ? '' : points);
        window.dronenbr = Math.max(0, parseInt(planet.drones) || 0);
        writePoints('.drone', dronenbr);
        // Plus de scan possible : atterrir ou repartir, comme chez le MJ
        if (planet.done && !showbuttons) {
            window.showbuttons = true;
            showbuttons_fun();
        }
        renderPlanetVotes(card);
    };

    // Les boutons de la planète sont ceux du MJ : un clic du joueur est un vote
    if (PLANET)
        for (let type of ['mousedown', 'mouseup', 'click'])
            window.addEventListener(type, function (e) {
                let button = !planetDriving && e.target.closest && e.target.closest(PLANET_BUTTONS);
                if (!button)
                    return;
                e.stopPropagation();
                e.preventDefault();
                if (type !== 'mouseup' || e.button !== 0 || !canPlanetVote())
                    return;
                let i = (window.planetVoteChoices || []).findIndex(c => c.button && q(c.button) === button);
                if (i >= 0)
                    toPage('vote', {index: you.vote === i ? null : i});
            }, true);

    // ---- Écran de fin, comme chez le MJ ----------------------------------------
    // end-screen.js lit le score, le vaisseau et la planète au chargement :
    // il n'est chargé qu'une fois le score reçu, et joue toute l'animation
    // (comptes, console, récap de la planète) comme chez le MJ.
    let endStarted = false;
    const startEnd = function (result) {
        if (endStarted || !result)
            return;
        endStarted = true;
        window.score = {scoreShip: result.scoreShip, scorePlanet: result.scorePlanet, scoreCards: result.scoreCards, scoreTotal: result.scoreTotal};
        window.ship = Object.assign({cryopods: result.cryopods}, result.ship || {});
        let planet = result.planet || {};
        let modules = planet.modules || {};
        // Valeurs de la planète posées sur les repères (__oxy__…) de la page
        document.querySelectorAll('.planet-reading').forEach(function (reading) {
            for (let attr of Array.from(reading.attributes)) {
                let m = attr.value.match(/^__(\w+)__$/);
                if (m)
                    reading.setAttribute(attr.name, modules[m[1]] ? Number(modules[m[1]].val) || 0 : 0);
            }
        });
        let recap = q('.end-settings');
        if (recap && result.settings)
            recap.innerHTML = settingsRecap({settings: result.settings});
        // Planète entière et ses lunes, comme planet-view.js sur la page du MJ
        let canvas = q('canvas[data-planet-view]');
        if (canvas && window.PlanetView) {
            let radius = Number(canvas.dataset.planetRadius) || canvas.clientWidth * .3;
            PlanetView.create(canvas, {radius: radius, modules: modules, seed: planet.id, revealed: 'all'});
            let moons = q('canvas[data-planet-moons]');
            if (moons && Number(planet.id))
                PlanetView.createMoons(moons, Number(planet.id), moons.dataset.planetMoons === 'compact' ? {compact: true, planetRadius: radius} : {});
        }
        let script = document.createElement('script');
        script.src = 'js/end-screen.js';
        document.body.append(script);
    };

    // ---- État de la partie -------------------------------------------------

    const render = function () {
        if (!game)
            return;
        if (END) {
            if (game.phase === 'postGame')
                startEnd(game.score);
            return;
        }
        renderShip(game.ship);
        renderStatuses(game.statuses);
        renderTeam(game.team);
        markItems();
        let card = game.card;
        if (PLANET) {
            if (card && card.kind === 'planet')
                renderPlanet(card);
            return;
        }
        syncCardText(card);
        renderChoices(card);
    };

    window.addEventListener('message', (e) => {
        if (e.source !== window.parent || !e.data || typeof e.data.lnob !== 'string')
            return;
        let m = e.data;
        if (m.lnob === 'state') {
            game = m.game || null;
            you = m.you || null;
            me = m.me || null;
            render();
        }
        else if (m.lnob === 'card-text')
            onCardText(m.data);
        else if (m.lnob === 'timer')
            onTimer(m.timer || null);
        else if (m.lnob === 'mj-event')
            mjEvent(m.payload);
    });

    initialiseModTabs();
    initialiseLeftTabs();
    // Planète : planet.js prépare la page au chargement complet (points,
    // drones) ; l'état de la partie n'arrive qu'après
    if (!PLANET || document.readyState === 'complete')
        toPage('ready');
    else
        window.addEventListener('load', () => toPage('ready'));
})();
