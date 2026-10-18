// Écran de jeu porté pour les joueurs. screen.html est une copie de l'écran
// de jeu du MJ (template-card.ejs), générée par scripts/player-assets.js ;
// ce script le fait vivre comme card.js le fait chez le MJ, mais à partir de
// ce que la page joueur (player.js) lui transmet :
//   {lnob: 'state', game, you, me}        état de la partie (relais)
//   {lnob: 'card-text', data}             texte que la page du MJ écrit
//   {lnob: 'timer', timer}                compte à rebours des choix
//   {lnob: 'mj-event', payload}           événement de l'écran du MJ (jet,
//                                         inventaires…), rejoué tel quel
// et il renvoie à la page joueur :
//   {lnobScreen: 'ready'}                 prêt à recevoir l'état
//   {lnobScreen: 'vote', index}           vote du joueur sur un choix
(function () {
    'use strict';

    const toPage = (type, data) => window.parent.postMessage(Object.assign({lnobScreen: type}, data || {}), '*');
    const q = (sel) => document.querySelector(sel);
    const esc = (text) => String(text === undefined || text === null ? '' : text)
        .replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);

    let game = null;
    let you = null;
    let me = null;

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
                continue;
            }
            let left = document.getElementById(mod.id + '-value');
            if (left)
                left.innerText = value;
        }
        let humans = document.getElementById('cryopods-value');
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
        q('.status').innerHTML = html;
    };

    // ---- Onglets des joueurs (partials/player-tabs.ejs) -------------------

    const TAB_TEMPLATE = document.getElementById('player-tab-template').innerHTML;
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

    // Pas de glisser-déposer des objets : c'est le MJ qui les range
    window.addEventListener('pointerdown', (e) => {
        if (e.target.closest && e.target.closest('[data-slug], .itemlist-line, .todos li'))
            e.stopPropagation();
    }, true);

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
            btn.textContent = choices[i];
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
                badge.textContent = count + (count > 1 ? ' votes' : ' vote');
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
        document.dispatchEvent(new CustomEvent(payload.action, {detail: payload}));
        // Butin d'une carte vidé : chez le MJ, card.js le ferme puis l'histoire
        // reprend ; ici on le ferme après le même délai
        if (payload.action === 'card-loot' && !(payload.data.state.items || []).length) {
            let area = document.getElementById('card-loot-area');
            setTimeout(() => {
                area.classList.remove('combat-in');
                area.classList.add('combat-out');
                setTimeout(() => area.classList.add('combat-none'), 400);
            }, 1400);
        }
    };

    // ---- État de la partie -------------------------------------------------

    const render = function () {
        if (!game)
            return;
        renderShip(game.ship);
        renderStatuses(game.statuses);
        renderTeam(game.team);
        let card = game.card;
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
    toPage('ready');
})();
