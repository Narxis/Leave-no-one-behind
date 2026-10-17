async function getAllPlayers () {
    const rawResponse = await fetch('/api/players', {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
    });
    return JSON.parse(await rawResponse.text());
}
// Le combat (adversaires, début/fin, attaques) est géré dans mj-combat.js
// Les compagnons (PNJ) et les onglets Adversaires / Compagnons sont gérés dans mj-allies.js

// Status : ajout depuis le champ de recherche, liste des status actifs avec
// leur durée (en cartes) et retrait. L'état fait foi côté serveur et revient
// par l'événement « status ».
(function () {
    const search = document.getElementById('search-status');
    const duration = document.getElementById('duration-status');
    const list = document.getElementById('mj-statuses');
    const known = (typeof STATUSES !== 'undefined' ? STATUSES : []);

    const el = (tag, cls, text) => {
        let e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    };

    // Accepte le slug (blackout) ou le nom affiché (Blackout, Recherché…)
    function findStatus(text) {
        let t = text.trim().toLowerCase();
        return known.find(s => s.slug.toLowerCase() === t || String(s.name).toLowerCase() === t);
    }

    function render(active) {
        list.innerHTML = '';
        if (!active.length) {
            list.append(el('div', 'mj-enemies-empty', 'Aucun status actif'));
            return;
        }
        for (let status of active) {
            let row = el('div', 'mj-status');
            row.append(el('span', 'mj-status-name', status.name),
                el('span', 'mj-status-duration', status.duration + (status.duration > 1 ? ' cartes' : ' carte')));
            let remove = el('button', 'mj-enemy-remove', '×');
            remove.type = 'button';
            remove.title = 'Retirer ' + status.name;
            remove.addEventListener('click', () => wsLNOB.setStatus(status.slug, 0));
            row.append(remove);
            list.append(row);
        }
    }

    function load() {
        fetch('/api/statuses/active').then(r => r.json()).then(render).catch(() => {});
    }

    function add() {
        let status = findStatus(search.value);
        if (!status) {
            search.classList.remove('shake');
            void search.offsetWidth;
            search.classList.add('shake');
            search.title = 'Status inconnu : ' + known.map(s => s.slug).join(', ');
            search.focus();
            return;
        }
        let value = parseInt(duration.value);
        wsLNOB.setStatus(status.slug, isNaN(value) || value < 1 ? 1 : value);
        search.value = '';
        search.title = '';
        duration.value = '';
    }

    document.getElementById('add-status').addEventListener('click', add);
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    duration.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    document.addEventListener('status', load);
    document.addEventListener('ws-reconnect', load);
    load();
})();

// Jet à la place d'un joueur (pas de moyen de lancer, joueur AFK) : la demande
// part exactement comme le /roll Discord (action « roll »), donc mêmes calculs,
// même affichage sur l'écran de jeu et même effet en combat
(function () {
    const playerSelect = document.getElementById('mj-player-roll-player');
    const statSelect = document.getElementById('mj-player-roll-stat');
    const moduleSelect = document.getElementById('mj-player-roll-module');
    const sendBtn = document.getElementById('mj-player-roll-send');
    const result = document.getElementById('mj-player-roll-result');
    let names = {};
    let waiting = null;

    function load() {
        getAllPlayers().then(list => {
            let current = playerSelect.value;
            names = {};
            playerSelect.innerHTML = '';
            for (let p of list) {
                names[p.discord_id] = p.name;
                let option = document.createElement('option');
                option.value = p.discord_id;
                option.textContent = p.name;
                playerSelect.append(option);
            }
            if (names[current] !== undefined)
                playerSelect.value = current;
            sendBtn.disabled = !list.length;
            if (!list.length)
                playerSelect.append(new Option('Aucun joueur', ''));
        }).catch(() => {});
    }

    sendBtn.addEventListener('click', () => {
        if (!playerSelect.value)
            return;
        sendBtn.disabled = true;
        // Le bouton revient même si le serveur ne répond pas (joueur supprimé…)
        waiting = setTimeout(() => { sendBtn.disabled = false; }, 3000);
        wsLNOB.rollDice(playerSelect.value, statSelect.value, moduleSelect.value);
    });

    // Dernier jet reçu, qu'il vienne du MJ ou d'un joueur
    document.addEventListener('roll', (e) => {
        let data = e.detail.data;
        let stat = statSelect.querySelector('option[value="' + data.stat + '"]');
        let module = data.module ? moduleSelect.querySelector('option[value="' + data.module + '"]') : null;
        result.className = 'mj-player-roll-result ' + (data.success ? 'success' : 'fail');
        result.textContent = (names[data.discord_id] || 'Joueur') + ' · ' + (stat ? stat.textContent : data.stat)
            + (module ? ' (' + module.textContent + ')' : '') + ' : dé ' + data.dice_result + ' → ';
        let value = document.createElement('strong');
        value.textContent = data.result + (data.success ? ' réussite' : ' échec');
        result.append(value);
        clearTimeout(waiting);
        sendBtn.disabled = false;
    });

    document.addEventListener('join', load);
    document.addEventListener('ws-reconnect', load);
    load();
})();

function setMJCardValue(card) {
    if (!card || !Array.isArray(card.choices))
        return;
    document.querySelectorAll('.button-text, .reveal-text, .mjreveal-text').forEach(function (div) {
        div.innerHTML = '';
    });
    document.querySelector('.desc-text').innerHTML = card.desc || '';
    document.querySelector('.desc-mjreveal').innerHTML = '<span class="mjreveal">' + (card.mjreveal || '') + '</span>';
    // Le panneau a 3 emplacements, comme l'éditeur de lieux
    card.choices.slice(0, 3).forEach(function (choice, i) {
        document.querySelector('#choice' + i + ' .button-text').innerHTML = choice.value;
        document.querySelector('#choice' + i + ' .mjreveal-text').innerHTML = '<span class="mjreveal">' + (choice.mjreveal || '') + '</span>';
        // Butin du choix : distribué sur la page de jeu avant la suite
        let loot = Array.isArray(choice.loot) && choice.loot.length
            ? '<br><br><span class="mj-loot">Butin : ' + choice.loot.map(n => String(n).replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c]))).join(', ') + '</span>' : '';
        // Issues au hasard : celle tirée pour cette carte est déjà la suite du choix
        let drawn = Array.isArray(choice.outcomes)
            ? '<span class="mj-outcome">Issue tirée au hasard : ' + (choice.outcome + 1) + ' sur ' + choice.outcomes.length + '</span><br>' : '';
        document.querySelector('#choice' + i + ' .reveal-text').innerHTML = "Prochain evenement: <br> <br>" + drawn + (choice.roll ? rollIssuesHtml(choice.roll) : (choice.reveal || (choice.next ? 'Carte suivante (' + escMj(choice.next) + ')' : ''))) + loot;
    });
}

const CARD_ROLL_STATS = {combat: 'Combat', pilotage: 'Pilotage', engineering: 'Ingénierie', survival: 'Survie', recon: 'Reconnaissance'};
const escMj = (t) => String(t).replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c]));

// Une suite de jet en une ligne : texte (ou carte suivante) et infos MJ
function rollIssueHtml(issue) {
    issue = issue || {};
    let text = issue.reveal ? issue.reveal.trim() : (issue.next ? 'Carte suivante (' + escMj(issue.next) + ')' : '');
    return text + (issue.mjreveal ? ' <span class="mjreveal">' + issue.mjreveal + '</span>' : '');
}

function rollIssuesHtml(roll) {
    let stat = CARD_ROLL_STATS[roll.stat];
    return '<b>Jet' + (stat ? ' : ' + stat : '') + '</b><br>'
        + '<b>Si réussite :</b> ' + rollIssueHtml(roll.success) + '<br>'
        + '<b>Si échec :</b> ' + rollIssueHtml(roll.failure);
}

// Jet d'un choix demandé par la page de jeu : chrono en pause jusqu'à la réponse
(function () {
    const box = document.getElementById('mj-card-roll');
    const last = document.getElementById('mj-card-roll-last');
    let pending = null;

    document.addEventListener('card-roll-ask', (e) => {
        pending = e.detail.data || {};
        let stat = CARD_ROLL_STATS[pending.stat];
        document.getElementById('mj-card-roll-stat').textContent = 'Jet' + (stat ? ' : ' + stat : '');
        document.getElementById('mj-card-roll-choice').innerHTML = (pending.choice || '')
            + (pending.mjreveal ? ' <span class="mjreveal">' + pending.mjreveal + '</span>' : '');
        document.getElementById('mj-card-roll-success').innerHTML = rollIssueHtml(pending.success);
        document.getElementById('mj-card-roll-failure').innerHTML = rollIssueHtml(pending.failure);
        last.textContent = '';
        box.querySelectorAll('[data-card-roll]').forEach(b => b.classList.remove('suggested'));
        box.hidden = false;
    });
    document.addEventListener('card-roll-result', () => {
        pending = null;
        box.hidden = true;
    });
    // Jet reçu pendant l'attente : mis en avant, le MJ garde la main
    document.addEventListener('roll', (e) => {
        let data = e.detail.data || {};
        if (!pending || (pending.stat && data.stat !== pending.stat))
            return;
        last.textContent = 'Dernier jet : ' + data.result + (data.success ? ' (réussite)' : ' (échec)');
        box.querySelectorAll('[data-card-roll]').forEach(b => b.classList.toggle('suggested', b.dataset.cardRoll === (data.success ? 'success' : 'failure')));
    });
    box.querySelectorAll('[data-card-roll]').forEach(btn => btn.addEventListener('click', () => {
        if (pending)
            wsLNOB.triggerCustomEvent('card-roll-result', {result: btn.dataset.cardRoll});
    }));
    // Menu ouvert pendant un jet : la page de jeu renvoie sa demande
    const query = () => wsLNOB.triggerCustomEvent('card-roll-query', {});
    document.addEventListener('ws-reconnect', query);
    query();
})();

// Carte en cours : chargée à l'ouverture (et après une coupure du serveur),
// puis suivie par l'événement « card-played »
function loadCurrentCard() {
    fetch('/api/currentCard').then(r => r.json()).then(setMJCardValue).catch(() => {});
}

document.getElementById('mjroll-button').addEventListener('mouseup',function(){
    let val = document.querySelector('input[name="mjroll"]:checked').value;
    let test = document.getElementById('mjroll-module').checked;
    let i=40;
    let rollDiv = document.getElementById('mjroll-roll');
    let result;
    let min;
    let range;
    if (test){
        result = 13 + Math.floor(Math.random()*5)
        min = 13
        range = 5
    }
    else{
        result = val*4 + Math.floor(Math.random()*4) + 1
        min = val*4 +1
        range = 4
    }
    let randomDisp = setInterval(function() {
        rollDiv.innerText = (min + Math.floor(Math.random()*range)).toString();
        i--;
        if (i<0) {
            rollDiv.innerText = result;
            clearInterval(randomDisp);
        }
    },25);
});

(function(){
    document.addEventListener('card-played', (e) => setMJCardValue(e.detail.data));
    document.addEventListener('ws-reconnect', loadCurrentCard);
    loadCurrentCard();
})();
