// Écran de combat sur la page des cartes : il s'ouvre quand le MJ lance le
// combat. Les joueurs choisissent un adversaire puis le personnage qui
// attaque ; le jet est fait par le serveur (src/controllers/combat.js).
(function () {
    const area = document.getElementById('combat-area');
    const enemiesBox = document.getElementById('combat-enemies');
    const attackersBox = document.getElementById('combat-attackers');
    const logBox = document.getElementById('combat-log');

    let state = {active: false, enemies: [], log: []};
    let selected = null;

    const el = (tag, cls, text) => {
        let e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    };

    // Les personnages sont ceux des onglets joueurs en bas de l'écran
    function players() {
        return [...document.querySelectorAll('.player-tab')].map(tab => ({
            discord_id: tab.id.replace('player-tab', ''),
            name: tab.querySelector('.player-name').firstChild.textContent.trim()
        }));
    }

    function enemyCard(enemy) {
        let ko = enemy.hp <= 0;
        let card = el('button', 'combat-enemy' + (ko ? ' ko' : '') + (selected === enemy.id ? ' selected' : ''));
        card.type = 'button';
        card.dataset.id = enemy.id;
        card.disabled = ko;
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

        card.addEventListener('click', () => {
            selected = selected === enemy.id ? null : enemy.id;
            render();
        });
        return card;
    }

    function renderAttackers() {
        attackersBox.innerHTML = '';
        let target = state.enemies.find(e => e.id === selected && e.hp > 0);
        attackersBox.classList.toggle('is-open', !!target);
        if (!target)
            return;
        attackersBox.append(el('span', 'combat-attackers-label', 'Qui attaque ' + target.name + ' ?'));
        for (let p of players()) {
            let b = el('button', 'combat-attacker', p.name);
            b.type = 'button';
            b.addEventListener('click', () => {
                wsLNOB.send({action: 'combat-attack', data: {discord_id: p.discord_id, name: p.name, enemy_id: target.id}});
                selected = null;
                render();
            });
            attackersBox.append(b);
        }
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
        renderAttackers();
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
        if (event.type === 'player-attack') {
            if (typeof doPlayerRoll === 'function' && document.getElementById('p' + event.discord_id + '-roll'))
                doPlayerRoll({detail: {data: {discord_id: event.discord_id, module: '', result: event.result, success: event.hit}}});
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
        if (!state.enemies.some(en => en.id === selected && en.hp > 0))
            selected = null;
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
