// Écran de combat sur la page des cartes : il s'ouvre quand le MJ lance le
// combat. Le MJ désigne la cible et l'attaquant depuis son menu ; le joueur
// valide l'attaque avec /roll Combat sur Discord (src/controllers/combat.js).
(function () {
    const area = document.getElementById('combat-area');
    const enemiesBox = document.getElementById('combat-enemies');
    const pendingBox = document.getElementById('combat-pending');
    const logBox = document.getElementById('combat-log');

    let state = {active: false, enemies: [], log: []};

    const el = (tag, cls, text) => {
        let e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    };

    function enemyCard(enemy) {
        let ko = enemy.hp <= 0;
        let targeted = state.pending && state.pending.enemy_id === enemy.id;
        let card = el('div', 'combat-enemy' + (ko ? ' ko' : '') + (targeted ? ' targeted' : ''));
        card.dataset.id = enemy.id;
        card.append(el('div', 'combat-enemy-name', enemy.name));

        let bar = el('div', 'combat-enemy-bar');
        let fill = el('div', 'combat-enemy-bar-fill');
        fill.style.width = (100 * enemy.hp / enemy.maxHp) + '%';
        fill.dataset.level = enemy.hp / enemy.maxHp > 0.5 ? 'ok' : (enemy.hp / enemy.maxHp > 0.25 ? 'warn' : 'crit');
        bar.append(fill);
        card.append(bar);

        let meta = el('div', 'combat-enemy-meta');
        meta.append(el('span', 'combat-enemy-hp', ko ? 'K.O.' : enemy.hp + ' / ' + enemy.maxHp + ' PV'),
            el('span', 'combat-enemy-def', 'Défense ' + enemy.defense));
        card.append(meta);
        return card;
    }

    // Bandeau « à toi de jouer » pour le joueur désigné par le MJ
    function renderPending() {
        pendingBox.innerHTML = '';
        let p = state.pending;
        pendingBox.classList.toggle('is-open', !!p);
        if (!p)
            return;
        pendingBox.append(el('span', 'combat-pending-player', p.player),
            document.createTextNode(' : lancez '),
            el('code', 'combat-pending-cmd', '/roll Combat'),
            document.createTextNode(' sur Discord pour attaquer '),
            el('span', 'combat-pending-enemy', p.enemy));
    }

    function renderLog() {
        logBox.innerHTML = '';
        for (let entry of state.log.slice(-4).reverse())
            logBox.append(el('div', 'combat-log-line ' + entry.type + (entry.hit ? ' hit' : ''), describeCombatEntry(entry)));
    }

    function render() {
        enemiesBox.innerHTML = '';
        enemiesBox.dataset.count = state.enemies.length;
        state.enemies.forEach(e => enemiesBox.append(enemyCard(e)));
        renderPending();
        renderLog();
    }

    function show(active) {
        if (active) {
            area.classList.remove('combat-none', 'combat-out');
            area.classList.add('combat-in');
        }
        else if (!area.classList.contains('combat-none')) {
            area.classList.remove('combat-in');
            area.classList.add('combat-out');
            setTimeout(() => {
                if (!state.active)
                    area.classList.add('combat-none');
            }, 400);
        }
    }

    // Petit texte qui s'envole au-dessus de l'ennemi (« -6 », « Raté »)
    function floatText(card, text, cls) {
        let f = el('div', 'combat-float ' + cls, text);
        card.append(f);
        setTimeout(() => f.remove(), 1200);
    }

    function animate(event) {
        if (!event)
            return;
        let card = enemiesBox.querySelector('[data-id="' + event.enemy_id + '"]');
        // Le jet lui-même s'affiche déjà sur l'onglet du joueur (événement « roll »)
        if (event.type === 'player-attack') {
            if (card) {
                card.classList.add(event.hit ? 'hit' : 'miss');
                floatText(card, event.hit ? '-' + event.damage : 'Raté', event.hit ? 'dmg' : 'miss');
            }
        }
        if (event.type === 'enemy-attack' && card) {
            card.classList.add('attacking');
            floatText(card, event.hit ? 'Touché ! ' + event.damage : 'Raté', event.hit ? 'enemy-hit' : 'miss');
        }
    }

    document.addEventListener('combat', (e) => {
        state = e.detail.data.state;
        render();
        show(state.active);
        animate(e.detail.data.event);
    });

    function load() {
        fetch('/api/combat').then(r => r.json()).then(s => {
            state = s;
            render();
            show(state.active);
        }).catch(() => {});
    }
    load();
    document.addEventListener('ws-reconnect', load);
})();
