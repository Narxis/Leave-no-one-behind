// Combat côté MJ : préparation des adversaires, début / fin du combat,
// PV et attaques des ennemis. L'état fait foi côté serveur
// (src/controllers/combat.js) et revient par l'événement « combat ».
(function () {
    const list = document.getElementById('mj-enemies');
    const logBox = document.getElementById('mj-combat-log');
    const startBtn = document.getElementById('combat-start');
    const search = document.getElementById('search-ennemy');
    const TIERS = {faible: '1-4', moyen: '5-8', fort: '9-12'};

    let state = {active: false, enemies: [], log: []};
    let pending = [];      // adversaires préparés avant le combat
    let startMoral = {};   // moral des joueurs au début, pour les évanouissements
    let localLog = [];     // lignes visibles uniquement par le MJ

    const el = (tag, cls, text) => {
        let e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    };

    const button = (cls, text, onClick) => {
        let b = el('button', cls, text);
        b.type = 'button';
        b.addEventListener('click', onClick);
        return b;
    };

    function renderLog() {
        logBox.innerHTML = '';
        let lines = state.log.map(e => ({at: e.at, text: describeCombatEntry(e, true), cls: e.type}))
            .concat(localLog)
            .sort((a, b) => b.at - a.at)
            .slice(0, 8);
        for (let line of lines)
            logBox.append(el('div', 'mj-log-line ' + line.cls, line.text));
    }

    function renderPending() {
        if (!pending.length) {
            list.append(el('div', 'mj-enemies-empty', 'Ajoutez des adversaires avec « + »'));
            return;
        }
        pending.forEach((mob, i) => {
            let row = el('div', 'mj-enemy');
            row.append(el('div', 'mj-enemy-name', mob.name));
            let hp = el('input', 'mj-enemy-hp-input');
            hp.type = 'number';
            hp.min = 1;
            hp.value = mob.hp;
            hp.title = 'PV';
            hp.addEventListener('change', () => { mob.hp = Math.max(1, parseInt(hp.value) || 1); });
            row.append(hp, el('span', 'mj-enemy-unit', 'PV'));
            row.append(button('mj-enemy-remove', '×', () => { pending.splice(i, 1); render(); }));
            list.append(row);
        });
    }

    function renderActive() {
        for (let enemy of state.enemies) {
            let row = el('div', 'mj-enemy' + (enemy.hp <= 0 ? ' ko' : ''));
            row.append(el('div', 'mj-enemy-name', enemy.name));

            let bar = el('div', 'mj-enemy-bar');
            let fill = el('div', 'mj-enemy-bar-fill');
            fill.style.width = (100 * enemy.hp / enemy.maxHp) + '%';
            bar.append(fill);

            let hp = el('div', 'mj-enemy-hp');
            hp.append(
                button('mj-hp-btn', '-', () => setHp(enemy, enemy.hp - 1)),
                el('span', 'mj-enemy-hp-value', enemy.hp + ' / ' + enemy.maxHp),
                button('mj-hp-btn', '+', () => setHp(enemy, enemy.hp + 1))
            );

            let attack = button('mj-enemy-attack', 'Attaque', () => {
                wsLNOB.send({action: 'combat-enemy-attack', data: {enemy_id: enemy.id}});
            });
            attack.disabled = enemy.hp <= 0;
            attack.title = 'Offense ' + enemy.offense + ' % — dégâts ' + TIERS[enemy.damage];

            row.append(bar, hp, attack);
            list.append(row);
        }
    }

    function render() {
        list.innerHTML = '';
        list.classList.toggle('active', state.active);
        state.active ? renderActive() : renderPending();
        startBtn.textContent = state.active ? 'Terminer le combat' : 'Commencer le combat';
        startBtn.classList.toggle('running', state.active);
        renderLog();
    }

    function setHp(enemy, hp) {
        wsLNOB.send({action: 'combat-hp', data: {enemy_id: enemy.id, hp: hp}});
    }

    function addPending() {
        let name = search.value.trim();
        if (!name)
            return;
        let mob = BESTIARY.find(b => b.name.toLowerCase() === name.toLowerCase());
        pending.push(mob ? Object.assign({}, mob) : {name: name, hp: 10});
        search.value = '';
        render();
    }

    async function recordMoral() {
        startMoral = {};
        try {
            for (let p of await getAllPlayers())
                startMoral[p.discord_id] = p.moral;
        } catch (e) {}
    }

    // Règle reprise de l'ancien menu : -10 de moral pendant le combat = évanoui
    async function checkFaint() {
        if (!state.active)
            return;
        for (let p of await getAllPlayers()) {
            if (startMoral[p.discord_id] !== undefined && p.moral < startMoral[p.discord_id] - 10) {
                localLog.push({at: Date.now(), text: p.name + " s'est évanoui", cls: 'faint'});
                delete startMoral[p.discord_id];
            }
        }
        renderLog();
    }

    document.getElementById('add-monstre').addEventListener('click', addPending);
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') addPending(); });
    document.getElementById('monstre-list').addEventListener('click', () => { pending = []; render(); });

    startBtn.addEventListener('click', () => {
        if (state.active) {
            wsLNOB.send({action: 'combat-end', data: {}});
            return;
        }
        if (!pending.length) {
            search.focus();
            startBtn.classList.remove('shake');
            void startBtn.offsetWidth;
            startBtn.classList.add('shake');
            return;
        }
        wsLNOB.send({action: 'combat-start', data: {enemies: pending}});
    });

    document.addEventListener('combat', (e) => {
        state = e.detail.data.state;
        let event = e.detail.data.event;
        if (event && event.type === 'start') {
            pending = [];
            localLog = [];
            recordMoral();
        }
        render();
    });
    document.addEventListener('playerStat', checkFaint);

    function load() {
        fetch('/api/combat').then(r => r.json()).then(s => {
            state = s;
            if (state.active)
                recordMoral();
            render();
        }).catch(render);
    }
    load();
    document.addEventListener('ws-reconnect', load);
})();
