// Combat côté MJ : préparation des adversaires, début / fin du combat,
// PV et attaques des ennemis, et désignation des attaques des joueurs
// (cible puis attaquant ; le joueur valide avec /roll Combat sur Discord). L'état fait foi côté serveur
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
    let players = [];      // joueurs de la partie, pour choisir l'attaquant
    let allies = [];       // compagnons (PNJ) : le serveur lance leur dé directement
    let targetId = null;   // ennemi choisi, en attente du choix de l'attaquant
    let victimFor = null;  // ennemi qui attaque, en attente du choix de sa cible
    let lootOpen = null;   // butin en cours d'édition : 'p<index>' (préparation) ou id de l'ennemi
    let lootDraft = '';    // texte en cours de saisie, gardé quand la liste se redessine
    let lootFocus = false; // donner le focus au champ au prochain rendu
    let outcome = 'dice';  // issue de la prochaine attaque ennemie : dé, touché ou raté
    let forcedDamage = ''; // dégâts imposés (vide : tirés selon le palier)

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
        let lines = state.log.slice().reverse().map(e => ({at: e.at, text: describeCombatEntry(e, true), cls: e.type}))
            .concat(localLog)
            .sort((a, b) => b.at - a.at)
            .slice(0, 8);
        for (let line of lines)
            logBox.append(el('div', 'mj-log-line ' + line.cls, line.text));
    }

    // Butin d'un ennemi : résumé cliquable, et sous lui l'éditeur (suggestions
    // de items.json via la datalist, ou saisie libre). Révélé aux joueurs
    // quand tous les ennemis sont K.O.
    function lootLine(row, key, loot, onChange) {
        let names = loot.map(i => i.name);
        let open = lootOpen === key;
        let toggle = button('mj-loot-toggle' + (open ? ' open' : ''),
            names.length ? 'Butin : ' + names.join(', ') : '+ Ajouter un butin', () => {
                lootOpen = open ? null : key;
                lootDraft = '';
                lootFocus = !open;
                render();
            });
        toggle.title = 'Révélé aux joueurs quand tous les ennemis sont vaincus';
        row.append(toggle);
        if (!open)
            return;

        let box = el('div', 'mj-loot');
        let chips = el('div', 'mj-loot-items');
        loot.forEach((item, i) => {
            let chip = el('span', 'mj-loot-item' + (item.custom ? ' custom' : ''), item.name);
            chip.append(button('mj-loot-remove', '×', () => onChange(loot.filter((_, j) => j !== i))));
            chips.append(chip);
        });
        let input = el('input', 'mj-loot-input');
        input.setAttribute('list', 'loot-list');
        input.placeholder = 'Objet (liste ou texte libre)';
        input.maxLength = 60;
        input.value = lootDraft;
        input.addEventListener('input', () => { lootDraft = input.value; });
        const add = () => {
            let name = input.value.trim();
            if (!name)
                return;
            lootDraft = '';
            lootFocus = true;
            onChange(loot.concat([{name: name}]));
        };
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
        let form = el('div', 'mj-loot-form');
        form.append(input, button('mj-loot-add', '+', add));
        box.append(chips, form);
        row.append(box);
        if (lootFocus) {
            lootFocus = false;
            setTimeout(() => input.focus(), 0);
        }
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
            row.append(button('mj-enemy-remove', '×', () => { pending.splice(i, 1); lootOpen = null; render(); }));
            lootLine(row, 'p' + i, mob.loot || [], (loot) => { mob.loot = loot; render(); });
            list.append(row);
        });
    }

    // Attaque désignée, en attente du /roll Combat du joueur
    function renderWaiting() {
        let p = state.pending;
        if (!p)
            return;
        let box = el('div', 'mj-waiting');
        box.append(el('span', 'mj-waiting-text', 'En attente du /roll Combat de ' + p.player + ' sur ' + p.enemy),
            button('mj-waiting-cancel', 'Annuler', () => wsLNOB.send({action: 'combat-cancel', data: {}})));
        list.append(box);
    }

    // Choix du joueur qui attaque l'ennemi ciblé
    function renderAttackers(enemy) {
        let box = el('div', 'mj-attackers');
        box.append(el('span', 'mj-attackers-label', 'Qui attaque ' + enemy.name + ' ?'));
        if (!players.length && !allies.length)
            box.append(el('span', 'mj-attackers-label', 'aucun joueur dans la partie'));
        for (let p of players)
            box.append(button('mj-attacker', p.name, () => {
                targetId = null;
                wsLNOB.send({action: 'combat-target', data: {enemy_id: enemy.id, discord_id: p.discord_id}});
            }));
        for (let a of allies) {
            let b = button('mj-attacker npc', a.name, () => {
                targetId = null;
                wsLNOB.send({action: 'combat-ally-attack', data: {enemy_id: enemy.id, ally_id: a.id}});
            });
            b.prepend(el('span', 'mj-ally-badge', 'PNJ'));
            b.title = 'Le dé de ' + a.name + ' est lancé tout de suite (Combat ' + a.combat + ')';
            box.append(b);
        }
        list.append(box);
    }

    // Choix du joueur ou du compagnon que l'ennemi attaque
    function renderVictims(enemy) {
        let box = el('div', 'mj-attackers mj-victims');
        box.append(el('span', 'mj-attackers-label', 'Qui ' + enemy.name + ' attaque ?'));
        const attack = (data) => {
            victimFor = null;
            let damage = parseInt(forcedDamage);
            wsLNOB.send({action: 'combat-enemy-attack', data: Object.assign({
                enemy_id: enemy.id,
                outcome: outcome === 'dice' ? undefined : outcome,
                damage: outcome !== 'miss' && Number.isFinite(damage) ? damage : undefined
            }, data)});
            outcome = 'dice';
            forcedDamage = '';
        };

        // Issue de l'attaque, choisie par le MJ s'il le veut (pour épargner un
        // joueur, ou rendre un coup plus dur) : les joueurs ne voient que le résultat
        let control = el('div', 'mj-outcome');
        for (let [key, label] of [['dice', 'Dé'], ['hit', 'Touché'], ['miss', 'Raté']]) {
            let b = button('mj-outcome-btn' + (outcome === key ? ' active' : ''), label, () => {
                outcome = key;
                render();
            });
            b.title = key === 'dice' ? 'Offense ' + enemy.offense + ' % : le dé décide'
                : (key === 'hit' ? "L'attaque touche à coup sûr" : "L'attaque rate à coup sûr");
            control.append(b);
        }
        let dmg = el('input', 'mj-outcome-damage');
        dmg.type = 'number';
        dmg.min = 0;
        dmg.max = 99;
        dmg.placeholder = TIERS[enemy.damage] || 'dégâts';
        dmg.title = 'Dégâts imposés si l\'attaque touche (vide : tirés entre ' + TIERS[enemy.damage] + ')';
        dmg.value = forcedDamage;
        dmg.disabled = outcome === 'miss';
        dmg.addEventListener('input', () => { forcedDamage = dmg.value; });
        let group = el('label', 'mj-outcome-group');
        group.append(el('span', 'mj-outcome-label', 'Dégâts'), dmg);
        control.append(group);
        box.append(control);
        for (let p of players)
            box.append(button('mj-attacker', p.name, () => attack({discord_id: p.discord_id})));
        for (let a of allies) {
            let b = button('mj-attacker npc', a.name, () => attack({ally_id: a.id}));
            b.prepend(el('span', 'mj-ally-badge', 'PNJ'));
            box.append(b);
        }
        if (!players.length && !allies.length)
            box.append(button('mj-attacker', 'Attaquer sans cible', () => attack({})));
        list.append(box);
    }

    function renderActive() {
        renderWaiting();
        for (let enemy of state.enemies) {
            let targeted = state.pending && state.pending.enemy_id === enemy.id;
            let row = el('div', 'mj-enemy' + (enemy.hp <= 0 ? ' ko' : '') + (targeted ? ' targeted' : '')
                + (targetId === enemy.id ? ' selecting' : ''));
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

            let attack = button('mj-enemy-attack' + (victimFor === enemy.id ? ' selecting' : ''), 'Attaque', () => {
                victimFor = victimFor === enemy.id ? null : enemy.id;
                targetId = null;
                render();
            });
            attack.disabled = enemy.hp <= 0;
            attack.title = 'Offense ' + enemy.offense + ' % — dégâts ' + TIERS[enemy.damage];

            let aim = button('mj-enemy-target', 'Cibler', () => {
                targetId = targetId === enemy.id ? null : enemy.id;
                victimFor = null;
                render();
            });
            aim.disabled = enemy.hp <= 0;
            aim.title = 'Choisir le joueur qui attaque cet ennemi (défense ' + enemy.defense + ')';

            let actions = el('div', 'mj-enemy-actions');
            actions.append(aim, attack);
            row.append(bar, hp, actions);
            lootLine(row, enemy.id, enemy.loot || [], (loot) => {
                wsLNOB.send({action: 'combat-loot', data: {enemy_id: enemy.id, loot: loot}});
            });
            list.append(row);
            if (targetId === enemy.id && enemy.hp > 0)
                renderAttackers(enemy);
            if (victimFor === enemy.id && enemy.hp > 0)
                renderVictims(enemy);
        }
    }

    function render() {
        // Un événement de combat ne doit pas faire perdre la saisie du butin en cours
        if (document.activeElement && document.activeElement.classList.contains('mj-loot-input'))
            lootFocus = true;
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
            players = await getAllPlayers();
            for (let p of players)
                startMoral[p.discord_id] = p.moral;
        } catch (e) {}
        render();
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
            lootOpen = null;
            localLog = [];
            recordMoral();
        }
        render();
    });
    document.addEventListener('playerStat', checkFaint);
    document.addEventListener('allies', (e) => {
        allies = e.detail.data.allies;
        if (targetId !== null || victimFor !== null)
            render();
    });

    function load() {
        fetch('/api/allies').then(r => r.json()).then(list => { allies = list; }).catch(() => {});
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
