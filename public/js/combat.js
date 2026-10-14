// Écran de combat sur la page des cartes : il s'ouvre quand le MJ lance le
// combat. Le MJ désigne la cible et l'attaquant depuis son menu ; le joueur
// valide l'attaque avec /roll Combat sur Discord (src/controllers/combat.js).
(function () {
    const area = document.getElementById('combat-area');
    const enemiesBox = document.getElementById('combat-enemies');
    const pendingBox = document.getElementById('combat-pending');
    const logBox = document.getElementById('combat-log');
    const lootBox = document.getElementById('combat-loot');

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

    // Victoire : le butin de tous les ennemis, caché jusque-là, est révélé.
    // Pendant un combat, on laisse d'abord jouer l'animation du coup fatal
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

    // still : sans animation, quand le MJ vient de distribuer un objet
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
            // Repères pour le glisser-déposer (inventory.js)
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
            grid.append(card);
        });
        lootBox.append(grid);
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
        renderPending();
        renderLoot(delay);
        renderLog();
    }

    function show(active) {
        // La légende et les infobulles des stats passent aux noms de combat
        document.body.classList.toggle('combat-mode', !!active);
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
        // L'onglet du joueur ou du compagnon visé réagit sous la carte
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
})();
