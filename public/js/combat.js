// Combat screen on the cards page: it opens when the GM starts the
// combat. The GM designates the target and the attacker from their menu; the player
// confirms the attack with /roll Combat on Discord (src/controllers/combat.js).
(function () {
    const area = document.getElementById('combat-area');
    const enemiesBox = document.getElementById('combat-enemies');
    const pendingBox = document.getElementById('combat-pending');
    const logBox = document.getElementById('combat-log');
    const lootBox = document.getElementById('combat-loot');
    const orderBox = document.getElementById('combat-order');
    const hint = area.querySelector('.combat-hint');
    const HINT = hint.textContent;

    let state = {active: false, enemies: [], log: []};
    const HP_PER_MORAL = 10;
    const MAX_HP = 1000;

    const el = (tag, cls, text) => {
        let e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    };

    function enemyCard(enemy) {
        let ko = enemy.hp <= 0;
        let targeted = state.pending && state.pending.enemy_id === enemy.id;
        let acting = actingFighter();
        acting = acting && acting.kind === 'enemy' && acting.id === enemy.id;
        let card = el('div', 'combat-enemy' + (ko ? ' ko' : '') + (targeted ? ' targeted' : '') + (acting ? ' acting' : ''));
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

        // Statuses set by the GM, with the remaining turns
        if (!ko && Object.keys(enemy.statuses || {}).length)
            card.append(statusBadges(enemy.statuses));
        return card;
    }

    // Fighter whose turn it is, according to the turn order (initiative)
    const actingFighter = () => state.active && (state.order || [])[state.current];

    // Turn order: the fighter whose turn it is is highlighted, here,
    // on their enemy card or on their tab under the card
    function renderOrder() {
        orderBox.innerHTML = '';
        let order = state.active ? state.order || [] : [];
        let acting = actingFighter();
        orderBox.classList.toggle('is-open', order.length > 0);
        hint.textContent = acting ? 'À ' + acting.name + ' de jouer' : HINT;
        document.querySelectorAll('.player-tab.combat-acting').forEach(t => t.classList.remove('combat-acting'));
        if (!order.length)
            return;
        orderBox.append(el('span', 'combat-order-label', 'Ordre'));
        order.forEach((f, i) => {
            let enemy = f.kind === 'enemy' && state.enemies.find(e => e.id === f.id);
            let ko = f.kind === 'enemy' && (!enemy || enemy.hp <= 0);
            orderBox.append(el('span', 'combat-order-chip kind-' + f.kind + (i === state.current ? ' current' : '') + (ko ? ' ko' : ''), f.name));
        });
        let tab = acting && acting.kind !== 'enemy' && document.getElementById('player-tab' + acting.id);
        if (tab)
            tab.classList.add('combat-acting');
    }

    // "Your turn" banner for the player designated by the GM
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

    // Victory: the loot of all enemies, hidden until then, is revealed.
    // During combat, the killing blow animation plays first
    let revealTimer = null;
    function renderLoot(delay = 0) {
        let revealed = state.active && state.lootRevealed;
        if (!revealed) {
            clearTimeout(revealTimer);
            revealTimer = null;
            area.classList.remove('combat-won');
            lootBox.innerHTML = '';
            return;
        }
        if (lootBox.childElementCount || revealTimer)
            return;
        revealTimer = setTimeout(() => {
            revealTimer = null;
            fillLoot();
            area.classList.add('combat-won');
        }, delay);
    }

    // still: without animation, when the GM has just handed out an item
    function fillLoot(still = false) {
        let items = state.enemies.flatMap(e => e.loot || []);
        lootBox.classList.toggle('loot-still', still);
        lootBox.append(el('div', 'combat-loot-title', 'Victoire !'),
            el('div', 'combat-loot-sub', items.length ? 'Butin récupéré sur les ennemis' : (still ? 'Tout le butin a été distribué' : 'Aucun butin sur ces ennemis')));
        if (items.length)
            lootBox.append(el('div', 'combat-loot-hint', 'Glissez un objet sur un joueur pour le lui donner'));
        let grid = el('div', 'combat-loot-items');
        items.forEach((item, i) => {
            let card = el('div', 'combat-loot-item');
            // Markers for drag and drop (inventory.js)
            card.dataset.index = i;
            card.dataset.name = item.name;
            card.dataset.slug = item.slug || '';
            card.style.animationDelay = (300 + i * 180) + 'ms';
            if (item.image) {
                let img = el('img', 'combat-loot-img');
                img.src = item.image;
                img.alt = '';
                card.append(img);
            }
            else
                card.append(el('span', 'combat-loot-img combat-loot-noimg', item.name.charAt(0)));
            card.append(el('span', 'combat-loot-name', item.name));
            if (item.qty > 1)
                card.append(el('span', 'combat-loot-qty', '×' + item.qty));
            grid.append(card);
        });
        lootBox.append(grid);
    }

    // Status dots (known or invented by the GM) and remaining turns
    function statusBadges(statuses) {
        let row = el('div', 'combat-statuses');
        for (let [key, status] of Object.entries(statuses || {})) {
            let kind = ['saignement', 'poison', 'etourdi'].includes(key) ? key : 'custom';
            row.append(el('span', 'combat-status ' + kind, status.name + ' · ' + status.turns));
        }
        return row;
    }

    // Health bar under the name of each player and companion, visible during
    // combat: 1 morale point = 10 HP, minus the HP lost below the ten
    function renderHealth() {
        let wounds = state.wounds || {};
        document.querySelectorAll('#playertabs_container .player-tab').forEach(tab => {
            let moralEl = tab.querySelector('.moral .player-stat-value');
            let roll = tab.querySelector('.player-roll');
            if (!moralEl || !roll)
                return;
            let id = tab.id.slice('player-tab'.length);
            let moral = parseInt(moralEl.textContent) || 0;
            let hp = Math.max(0, moral * HP_PER_MORAL - (wounds[id] || 0));
            let box = tab.querySelector('.tab-hp');
            if (!box) {
                box = el('div', 'tab-hp');
                box.append(el('div', 'tab-hp-fill'), el('span', 'tab-hp-text'));
                tab.append(box);
            }
            let ratio = hp / MAX_HP;
            let fill = box.querySelector('.tab-hp-fill');
            fill.style.width = (100 * ratio) + '%';
            fill.dataset.level = ratio > 0.5 ? 'ok' : (ratio > 0.25 ? 'warn' : 'crit');
            box.querySelector('.tab-hp-text').textContent = hp > 0 ? hp + ' PV' : 'K.O.';
            box.classList.toggle('ko', hp <= 0);
            box.title = hp + ' / ' + MAX_HP + ' PV (moral ' + moral + ')';

            // Statuses of the player or companion, under their health bar
            let old = tab.querySelector('.tab-statuses');
            if (old)
                old.remove();
            let statuses = state.active && (state.fighters || {})[id];
            if (statuses && Object.keys(statuses).length) {
                let badges = statusBadges(statuses);
                badges.classList.add('tab-statuses');
                tab.append(badges);
            }
        });
    }

    function renderLog() {
        logBox.innerHTML = '';
        for (let entry of state.log.slice(-4).reverse())
            logBox.append(el('div', 'combat-log-line ' + entry.type + (entry.hit ? ' hit' : ''), describeCombatEntry(entry)));
    }

    function render(delay = 0) {
        enemiesBox.innerHTML = '';
        enemiesBox.dataset.count = state.enemies.length;
        state.enemies.forEach(e => enemiesBox.append(enemyCard(e)));
        renderOrder();
        renderPending();
        renderLoot(delay);
        renderLog();
        renderHealth();
    }

    function show(active) {
        // The legend and stat tooltips switch to the combat names
        // The non-combat interface is hidden by the CSS (body.combat-mode)
        document.body.classList.toggle('combat-mode', !!active);
        // The card timer waits for the end of the combat (card.js)
        if (typeof pauseCountDown === 'function')
            pauseCountDown(active);
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

    // Small text flying up above the enemy ("-6", "Raté")
    function floatText(card, text, cls) {
        let f = el('div', 'combat-float ' + cls, text);
        card.append(f);
        setTimeout(() => f.remove(), 1200);
    }

    function animate(event) {
        if (!event)
            return;
        let card = enemiesBox.querySelector('[data-id="' + event.enemy_id + '"]');
        // The roll itself is already shown on the player's tab ("roll" event)
        if (event.type === 'player-attack') {
            if (card) {
                card.classList.add(event.hit ? 'hit' : 'miss');
                floatText(card, event.hit ? '-' + event.damage : 'Raté', event.hit ? 'dmg' : 'miss');
            }
        }
        // Next turn: harmful statuses take effect (enemies, players, companions)
        if (event.type === 'turn')
            for (let tick of event.ticks || []) {
                if (tick.enemy_id !== undefined) {
                    let c = enemiesBox.querySelector('[data-id="' + tick.enemy_id + '"]');
                    if (c) {
                        c.classList.add('hit');
                        floatText(c, '-' + tick.damage, 'dmg status-' + tick.status);
                    }
                    continue;
                }
                let tab = document.getElementById('player-tab' + tick.target_id);
                if (tab) {
                    tab.classList.remove('under-attack');
                    void tab.offsetWidth;
                    tab.classList.add('under-attack');
                    floatText(tab, '-' + tick.damage, 'dmg tab-float status-' + tick.status);
                    setTimeout(() => tab.classList.remove('under-attack'), 900);
                }
            }
        if (event.type === 'reinforcement' && card)
            card.classList.add('arriving');
        if (event.type === 'enemy-attack' && card) {
            card.classList.add('attacking');
            floatText(card, event.hit ? 'Touché ! ' + event.damage : 'Raté', event.hit ? 'enemy-hit' : 'miss');
        }
        // The tab of the targeted player or companion reacts under the card
        let tab = event.type === 'enemy-attack' && event.target_id && document.getElementById('player-tab' + event.target_id);
        if (tab) {
            tab.classList.remove('under-attack', 'dodged');
            void tab.offsetWidth;
            tab.classList.add(event.hit ? 'under-attack' : 'dodged');
            floatText(tab, event.hit ? '-' + event.damage : 'Esquivé', event.hit ? 'dmg tab-float' : 'miss tab-float');
            setTimeout(() => tab.classList.remove('under-attack', 'dodged'), 900);
        }
    }

    document.addEventListener('combat', (e) => {
        state = e.detail.data.state;
        let ev = e.detail.data.event;
        if (ev && ev.type === 'loot-taken' && lootBox.childElementCount) {
            lootBox.innerHTML = '';
            fillLoot(true);
            return;
        }
        render(1300);
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
    // The morale of a player or companion changed: their bar follows
    document.addEventListener('playerStat', renderHealth);
    document.addEventListener('allies', renderHealth);
})();
