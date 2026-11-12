// Combat on the GM side: preparing opponents, start / end of combat,
// enemy HP and attacks, and designating the players' attacks
// (target then attacker; the player confirms with /roll Combat on Discord). The server
// state is authoritative (src/controllers/combat.js) and comes back through the "combat" event.
(function () {
    const list = document.getElementById('mj-enemies');
    const logBox = document.getElementById('mj-combat-log');
    const startBtn = document.getElementById('combat-start');
    const initSelect = document.getElementById('combat-initiative');
    const search = document.getElementById('search-ennemy');
    const teamBox = document.getElementById('mj-team');
    const statusBox = document.getElementById('mj-status-panel');
    const TIERS = {faible: '1-4', moyen: '5-8', fort: '9-12'};
    const STATUSES = {
        saignement: {name: 'Saignement'},
        poison: {name: 'Poison'},
        etourdi: {name: 'Étourdi'}
    };
    const HP_PER_MORAL = 10;
    const MAX_HP = 1000;

    let state = {active: false, enemies: [], log: []};
    let pending = [];      // opponents prepared before combat
    let startMoral = {};   // players' morale at the start, for fainting
    let localLog = [];     // lines visible only to the GM
    let players = [];      // players of the game, to choose the attacker
    let allies = [];       // companions (NPCs): the server rolls their die directly
    let targetId = null;   // chosen enemy, waiting for the attacker choice
    let victimFor = null;  // attacking enemy, waiting for its target choice
    let pick = null;       // attacker or target chosen, sent with "Valider" ('p:<id>' or 'a:<id>')
    let hitStatus = {kind: '', turns: 3}; // status set if the attack being prepared hits
    let lootOpen = null;   // loot being edited: 'p<index>' (preparation) or enemy id
    let lootDraft = '';    // text being typed, kept when the list is redrawn
    let lootFocus = false; // give focus to the field on the next render
    let outcome = 'dice';  // outcome of the next enemy attack: die, hit or miss
    let forcedDamage = ''; // forced damage (empty: drawn according to the tier)

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

    // Enemy loot: clickable summary, with the editor below it (suggestions
    // from items.json via the datalist, or free input). Revealed to the players
    // when all enemies are K.O.
    // Usual quantity of a listed item (item editor)
    function knownQty(name) {
        let option = [...document.querySelectorAll('#loot-list option')].find(o => o.value.toLowerCase() === name.toLowerCase());
        return option ? parseInt(option.dataset.qty) || 1 : 1;
    }

    function lootLine(row, key, loot, onChange) {
        let names = loot.map(i => i.qty > 1 ? i.name + ' ×' + i.qty : i.name);
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
            let chip = el('span', 'mj-loot-item' + (item.custom ? ' custom' : ''), item.qty > 1 ? item.name + ' ×' + item.qty : item.name);
            chip.append(button('mj-loot-remove', '×', () => onChange(loot.filter((_, j) => j !== i))));
            chips.append(chip);
        });
        let input = el('input', 'mj-loot-input');
        input.setAttribute('list', 'loot-list');
        input.placeholder = 'Objet (liste ou texte libre)';
        input.maxLength = 60;
        input.value = lootDraft;
        let qty = el('input', 'mj-loot-input mj-loot-qty');
        qty.type = 'number';
        qty.min = 1;
        qty.max = 999;
        qty.value = lootDraft ? knownQty(lootDraft) : 1;
        qty.title = 'Quantité';
        input.addEventListener('input', () => {
            lootDraft = input.value;
            qty.value = knownQty(input.value.trim());
        });
        const add = () => {
            let name = input.value.trim();
            if (!name)
                return;
            let n = Math.min(Math.max(parseInt(qty.value) || 1, 1), 999);
            lootDraft = '';
            lootFocus = true;
            // Already in the loot: the quantity is added
            let at = loot.findIndex(i => i.name.toLowerCase() === name.toLowerCase());
            if (at >= 0)
                onChange(loot.map((i, j) => j === at ? Object.assign({}, i, {qty: (i.qty || 1) + n}) : i));
            else
                onChange(loot.concat([{name: name, qty: n}]));
        };
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
        qty.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
        let form = el('div', 'mj-loot-form');
        form.append(input, qty, button('mj-loot-add', '+', add));
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

    // Designated attack, waiting for the player's /roll Combat
    function renderWaiting() {
        let p = state.pending;
        if (!p)
            return;
        let box = el('div', 'mj-waiting');
        let status = p.status && (STATUSES[p.status.status] || p.status);
        box.append(el('span', 'mj-waiting-text', 'En attente du /roll Combat de ' + p.player + ' sur ' + p.enemy
            + (status && status.name ? ' (+ ' + status.name + ' si touché)' : '')),
            button('mj-waiting-cancel', 'Annuler', () => wsLNOB.send({action: 'combat-cancel', data: {}})));
        list.append(box);
    }

    // Attack being prepared: the GM chooses the attacker or the target, the outcome,
    // the damage and an optional status, then sends everything at once with
    // "Valider". Nothing is sent until they confirm
    const resetDraft = () => {
        pick = null;
        outcome = 'dice';
        forcedDamage = '';
        hitStatus = {kind: '', turns: 3};
    };

    // Players and companions to choose from (one at a time); stunnedOff: a
    // stunned fighter can't be chosen as attacker
    function fighterChoices(box, stunnedOff) {
        let choices = el('div', 'mj-choices');
        const choice = (key, name, npc, statuses) => {
            let b = button('mj-attacker' + (npc ? ' npc' : '') + (pick === key ? ' selected' : ''), name, () => {
                pick = pick === key ? null : key;
                render();
            });
            if (npc)
                b.prepend(el('span', 'mj-ally-badge', 'PNJ'));
            b.setAttribute('aria-pressed', pick === key);
            if (stunnedOff && isStunned(statuses)) {
                b.disabled = true;
                b.title = name + ' ne peut pas attaquer (statut)';
                if (pick === key)
                    pick = null;
            }
            choices.append(b);
        };
        for (let p of players)
            choice('p:' + p.discord_id, p.name, false, fighterStatuses(String(p.discord_id)));
        for (let a of allies)
            choice('a:' + a.id, a.name, true, fighterStatuses('npc' + a.id));
        box.append(choices);
    }

    // Status set if the attack hits (optional)
    function hitStatusControl(box) {
        let row = el('div', 'mj-outcome mj-hit-status');
        let kind = el('select', 'mj-sp-select');
        let none = el('option', '', 'Aucun statut');
        none.value = '';
        kind.append(none);
        for (let [key, info] of Object.entries(STATUSES)) {
            let o = el('option', '', info.name);
            o.value = key;
            kind.append(o);
        }
        kind.value = hitStatus.kind;
        kind.addEventListener('change', () => { hitStatus.kind = kind.value; render(); });
        let turns = el('input', 'mj-turn-duration');
        turns.type = 'number';
        turns.min = 1;
        turns.max = 9;
        turns.value = hitStatus.turns;
        turns.title = 'Durée en tours';
        turns.disabled = !hitStatus.kind;
        turns.addEventListener('input', () => { hitStatus.turns = Math.min(9, Math.max(1, parseInt(turns.value) || 1)); });
        let group = el('label', 'mj-outcome-group');
        group.append(turns, el('span', 'mj-outcome-label', 'tours'));
        row.append(el('span', 'mj-outcome-label', 'Si touché'), kind, group);
        row.title = 'Statut posé sur la cible si l\'attaque touche (et ne la met pas K.O.)';
        box.append(row);
    }

    const hitStatusData = () => hitStatus.kind ? {status: hitStatus.kind, turns: hitStatus.turns} : undefined;

    // Bottom of the panel: Annuler (closes without sending anything) and Valider
    function draftFooter(box, label, ready, onValidate) {
        let foot = el('div', 'mj-draft-foot');
        foot.append(button('mj-waiting-cancel', 'Annuler', () => {
            targetId = victimFor = null;
            resetDraft();
            render();
        }));
        let ok = button('mj-turn-next mj-validate', label, () => {
            onValidate();
            targetId = victimFor = null;
            resetDraft();
            render();
        });
        ok.disabled = !ready;
        foot.append(ok);
        box.append(foot);
    }

    // Choosing the player who attacks the targeted enemy
    function renderAttackers(enemy) {
        let box = el('div', 'mj-attackers');
        box.append(el('span', 'mj-attackers-label', 'Qui attaque ' + enemy.name + ' ?'));
        if (!players.length && !allies.length)
            box.append(el('span', 'mj-attackers-label', 'aucun joueur dans la partie'));
        fighterChoices(box, true);
        hitStatusControl(box);
        let ally = pick && pick.startsWith('a:') && allies.find(a => 'a:' + a.id === pick);
        // A companion rolls its die right away; a player must roll Combat
        draftFooter(box, ally ? 'Valider (dé de ' + ally.name + ')' : 'Valider', !!pick, () => {
            let [type, id] = pick.split(':');
            let data = {enemy_id: enemy.id, status: hitStatusData()};
            if (type === 'a')
                wsLNOB.send({action: 'combat-ally-attack', data: Object.assign(data, {ally_id: parseInt(id)})});
            else
                wsLNOB.send({action: 'combat-target', data: Object.assign(data, {discord_id: id})});
        });
        list.append(box);
    }

    // Choosing the player or companion the enemy attacks
    function renderVictims(enemy) {
        let box = el('div', 'mj-attackers mj-victims');
        box.append(el('span', 'mj-attackers-label', 'Qui ' + enemy.name + ' attaque ?'));
        fighterChoices(box, false);

        // Outcome of the attack, chosen by the GM if they want (to spare a
        // player, or make a hit harder): the players only see the result
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
        if (outcome !== 'miss')
            hitStatusControl(box);

        let alone = !players.length && !allies.length;
        draftFooter(box, alone ? 'Valider sans cible' : 'Valider', alone || !!pick, () => {
            let damage = parseInt(forcedDamage);
            let data = {
                enemy_id: enemy.id,
                outcome: outcome === 'dice' ? undefined : outcome,
                damage: outcome !== 'miss' && Number.isFinite(damage) ? damage : undefined,
                status: outcome !== 'miss' ? hitStatusData() : undefined
            };
            if (pick)
                Object.assign(data, targetOf(pick));
            wsLNOB.send({action: 'combat-enemy-attack', data: data});
        });
        list.append(box);
    }

    // Current turn and turn order; "Tour suivant" makes the statuses act
    function renderTurn() {
        let bar = el('div', 'mj-turn');
        bar.append(el('span', 'mj-turn-label', 'Tour ' + (state.turn || 1)));
        let order = state.order || [];
        if (order.length) {
            let next = button('mj-turn-next', 'Au suivant', () => wsLNOB.send({action: 'combat-next', data: {}}));
            next.title = 'Passe la main au combattant suivant ; après le dernier, le tour passe';
            bar.append(next);
        }
        let turn = button('mj-turn-next mj-turn-skip', 'Tour suivant', () => wsLNOB.send({action: 'combat-turn', data: {}}));
        turn.title = 'Les statuts qui blessent agissent, puis chaque statut perd un tour ; la main revient au premier';
        bar.append(turn);
        if (order.length)
            bar.append(renderOrder(order));
        list.append(bar);
    }

    // K.O. fighter: skips their turn
    function isDownLocal(f) {
        if (f.kind === 'enemy') {
            let enemy = state.enemies.find(e => e.id === f.id);
            return !enemy || enemy.hp <= 0;
        }
        let who = f.kind === 'ally' ? allies.find(a => 'npc' + a.id === f.id) : players.find(p => String(p.discord_id) === f.id);
        return !!who && hpOf(f.id, who.moral) <= 0;
    }

    // Turn order, set by initiative: the GM changes it with the arrows
    // or by dragging a name, and hands the turn to someone by clicking their name
    let dragFrom = null;
    function renderOrder(order) {
        let box = el('ol', 'mj-order');
        let keys = order.map(f => f.kind + ':' + f.id);
        const send = (data) => wsLNOB.send({action: 'combat-order', data: data});
        const move = (from, to) => {
            let k = keys.slice();
            k.splice(to, 0, k.splice(from, 1)[0]);
            send({order: k});
        };
        order.forEach((f, i) => {
            let row = el('li', 'mj-order-row kind-' + f.kind + (i === state.current ? ' current' : '') + (isDownLocal(f) ? ' ko' : ''));
            let name = button('mj-order-name', f.name, () => send({current: keys[i]}));
            name.title = i === state.current ? 'À ' + f.name + ' de jouer' : 'Donner la main à ' + f.name;
            if (f.kind === 'ally')
                name.prepend(el('span', 'mj-ally-badge', 'PNJ'));
            let up = button('mj-order-move', '▲', () => move(i, i - 1));
            up.disabled = i === 0;
            up.title = 'Jouer plus tôt';
            let down = button('mj-order-move', '▼', () => move(i, i + 1));
            down.disabled = i === order.length - 1;
            down.title = 'Jouer plus tard';
            row.append(el('span', 'mj-order-rank', (i + 1) + '.'), name, up, down);

            row.draggable = true;
            row.addEventListener('dragstart', (e) => {
                dragFrom = i;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', keys[i]);
            });
            row.addEventListener('dragover', (e) => {
                if (dragFrom === null)
                    return;
                e.preventDefault();
                row.classList.add('drop');
            });
            row.addEventListener('dragleave', () => row.classList.remove('drop'));
            row.addEventListener('drop', (e) => {
                e.preventDefault();
                if (dragFrom !== null && dragFrom !== i)
                    move(dragFrom, i);
                dragFrom = null;
            });
            row.addEventListener('dragend', () => { dragFrom = null; });
            box.append(row);
        });
        return box;
    }

    const isStunned = (statuses) => Object.values(statuses || {}).some(s => s.stun);
    const fighterStatuses = (id) => (state.fighters || {})[id] || {};

    // Active status dots of a fighter (× to remove)
    function statusChips(statuses, target) {
        let line = el('div', 'mj-statuses-line');
        for (let [key, status] of Object.entries(statuses || {})) {
            let kind = STATUSES[key] ? key : 'custom';
            let b = button('mj-status-chip active ' + kind, status.name + ' · ' + status.turns + ' ×', () =>
                wsLNOB.send({action: 'combat-status', data: {target: target, status: key, name: status.name, turns: 0}}));
            let effects = [];
            if (status.damage)
                effects.push(status.damage[0] === status.damage[1] ? status.damage[0] + ' PV par tour' : status.damage[0] + ' à ' + status.damage[1] + ' PV par tour');
            if (status.stun)
                effects.push('ne peut pas attaquer');
            b.title = (effects.join(', ') || 'aucun effet automatique') + ' — cliquer pour retirer';
            line.append(b);
        }
        return line;
    }

    // Statuses panel: target (enemy, player or companion), known
    // or custom status (name, damage per turn, prevents attacking), duration
    let sp = {target: '', kind: 'saignement', turns: 3, name: '', damage: '', stun: false};

    function targetOf(value) {
        let [type, id] = value.split(':');
        if (type === 'e') return {enemy_id: parseInt(id)};
        if (type === 'a') return {ally_id: parseInt(id)};
        if (type === 'p') return {discord_id: id};
        return null;
    }

    function renderStatusPanel() {
        if (statusBox.contains(document.activeElement) && document.activeElement.tagName === 'INPUT')
            return;
        statusBox.innerHTML = '';
        statusBox.classList.toggle('hide', !state.active);
        if (!state.active)
            return;
        statusBox.append(el('div', 'mj-team-title', 'Statuts'));

        let target = el('select', 'mj-sp-select');
        const option = (parent, value, text) => {
            let o = el('option', '', text);
            o.value = value;
            parent.append(o);
        };
        const group = (label, items) => {
            if (!items.length)
                return;
            let g = el('optgroup');
            g.label = label;
            items.forEach(([value, text]) => option(g, value, text));
            target.append(g);
        };
        group('Ennemis', state.enemies.filter(e => e.hp > 0).map(e => ['e:' + e.id, e.name]));
        group('Joueurs', players.map(p => ['p:' + p.discord_id, p.name]));
        group('Compagnons', allies.map(a => ['a:' + a.id, a.name + ' (PNJ)']));
        if (![...target.options].some(o => o.value === sp.target))
            sp.target = target.options.length ? target.options[0].value : '';
        target.value = sp.target;
        target.addEventListener('change', () => { sp.target = target.value; });

        let kind = el('select', 'mj-sp-select');
        for (let [key, info] of Object.entries(STATUSES))
            option(kind, key, info.name);
        option(kind, 'custom', 'Personnalisé…');
        kind.value = sp.kind;
        kind.addEventListener('change', () => { sp.kind = kind.value; renderStatusPanel(); });

        let turns = el('input', 'mj-turn-duration');
        turns.type = 'number';
        turns.min = 1;
        turns.max = 9;
        turns.value = sp.turns;
        turns.title = 'Durée en tours';
        turns.addEventListener('input', () => { sp.turns = Math.min(9, Math.max(1, parseInt(turns.value) || 1)); });

        let row1 = el('div', 'mj-sp-row');
        row1.append(el('span', 'mj-outcome-label', 'Cible'), target);
        let row2 = el('div', 'mj-sp-row');
        let turnsGroup = el('label', 'mj-outcome-group');
        turnsGroup.append(turns, el('span', 'mj-outcome-label', 'tours'));
        row2.append(el('span', 'mj-outcome-label', 'Statut'), kind, turnsGroup);
        statusBox.append(row1, row2);

        if (sp.kind === 'custom') {
            let name = el('input', 'mj-sp-name');
            name.maxLength = 30;
            name.placeholder = 'Nom du statut';
            name.value = sp.name;
            name.addEventListener('input', () => { sp.name = name.value; });
            let damage = el('input', 'mj-turn-duration');
            damage.type = 'number';
            damage.min = 0;
            damage.max = 99;
            damage.placeholder = '0';
            damage.value = sp.damage;
            damage.title = 'PV perdus à chaque tour (0 : aucun)';
            damage.addEventListener('input', () => { sp.damage = damage.value; });
            let stun = el('input');
            stun.type = 'checkbox';
            stun.checked = sp.stun;
            stun.addEventListener('change', () => { sp.stun = stun.checked; });
            let stunLabel = el('label', 'mj-sp-check');
            stunLabel.append(stun, el('span', '', "Empêche d'attaquer"));
            let row3 = el('div', 'mj-sp-row');
            row3.append(name);
            let row4 = el('div', 'mj-sp-row');
            let dmgGroup = el('label', 'mj-outcome-group mj-sp-left');
            dmgGroup.append(el('span', 'mj-outcome-label', 'Dégâts'), damage, el('span', 'mj-outcome-label', 'PV / tour'));
            row4.append(dmgGroup, stunLabel);
            statusBox.append(row3, row4);
        }

        let apply = button('mj-turn-next mj-sp-apply', 'Appliquer', () => {
            let t = targetOf(sp.target);
            if (!t)
                return;
            let data = {target: t, status: sp.kind, turns: sp.turns};
            if (sp.kind === 'custom') {
                if (!sp.name.trim())
                    return statusBox.querySelector('.mj-sp-name').focus();
                Object.assign(data, {status: '', name: sp.name.trim(), damage: parseInt(sp.damage) || 0, stun: sp.stun});
            }
            wsLNOB.send({action: 'combat-status', data: data});
        });
        apply.disabled = !sp.target;
        statusBox.append(apply);
    }

    function renderActive() {
        renderTurn();
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
                resetDraft();
                render();
            });
            let stunned = isStunned(enemy.statuses);
            attack.disabled = enemy.hp <= 0 || stunned;
            attack.title = stunned ? enemy.name + ' est étourdi et ne peut pas attaquer'
                : 'Offense ' + enemy.offense + ' % — dégâts ' + TIERS[enemy.damage];
            if (stunned && victimFor === enemy.id)
                victimFor = null;

            let aim = button('mj-enemy-target', 'Cibler', () => {
                targetId = targetId === enemy.id ? null : enemy.id;
                victimFor = null;
                resetDraft();
                render();
            });
            aim.disabled = enemy.hp <= 0;
            aim.title = 'Choisir le joueur qui attaque cet ennemi (défense ' + enemy.defense + ')';

            let actions = el('div', 'mj-enemy-actions');
            actions.append(aim, attack);
            row.append(bar, hp, actions);
            if (enemy.hp > 0 && Object.keys(enemy.statuses || {}).length)
                row.append(statusChips(enemy.statuses, {enemy_id: enemy.id}));
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
        // A combat event must not lose the loot input in progress
        if (document.activeElement && document.activeElement.classList.contains('mj-loot-input'))
            lootFocus = true;
        // …nor that of an attack being prepared (damage, status duration)
        let active = document.activeElement;
        let refocus = active && list.contains(active) && active.closest('.mj-attackers') && active.tagName === 'INPUT'
            ? '.mj-attackers input.' + active.className.trim().split(/\s+/).join('.') : null;
        list.innerHTML = '';
        list.classList.toggle('active', state.active);
        state.active ? renderActive() : renderPending();
        if (refocus && list.querySelector(refocus))
            list.querySelector(refocus).focus();
        startBtn.textContent = state.active ? 'Terminer le combat' : 'Commencer le combat';
        initSelect.classList.toggle('hide', state.active);
        startBtn.classList.toggle('running', state.active);
        // End of combat: rare and irreversible, it requires a long press (ui-hold.js)
        if (state.active)
            startBtn.dataset.hold = 'Maintenir pour terminer le combat';
        else
            delete startBtn.dataset.hold;
        renderLog();
        renderTeam();
    }

    // HP of players and companions (1 morale = 10 HP), editable at any
    // time. The server updates their morale and the tabs under the card
    function hpOf(id, moral) {
        return Math.max(0, moral * HP_PER_MORAL - ((state.wounds || {})[id] || 0));
    }

    function teamRow(name, id, moral, target, npc) {
        let hp = hpOf(id, moral);
        let row = el('div', 'mj-team-row' + (hp <= 0 ? ' ko' : ''));
        let label = el('div', 'mj-team-name', name);
        if (npc)
            label.prepend(el('span', 'mj-ally-badge', 'PNJ'));
        let bar = el('div', 'mj-team-bar');
        let fill = el('div', 'mj-team-bar-fill');
        fill.style.width = (100 * hp / MAX_HP) + '%';
        fill.dataset.level = hp / MAX_HP > 0.5 ? 'ok' : (hp / MAX_HP > 0.25 ? 'warn' : 'crit');
        bar.append(fill);

        const send = (value) => wsLNOB.send({action: 'combat-player-hp', data: Object.assign({hp: value}, target)});
        const step = (e, sign) => sign * (e.shiftKey ? 100 : (e.ctrlKey ? 50 : 10));
        let input = el('input', 'mj-team-input');
        input.type = 'number';
        input.min = 0;
        input.max = MAX_HP;
        input.value = hp;
        input.title = 'PV de ' + name + ' (moral ' + moral + ')';
        input.addEventListener('change', () => send(parseInt(input.value) || 0));
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
        let minus = button('mj-hp-btn', '-', (e) => send(hp + step(e, -1)));
        let plus = button('mj-hp-btn', '+', (e) => send(hp + step(e, 1)));
        minus.title = plus.title = '10 PV (Maj : 100, Ctrl : 50)';
        let ctrl = el('div', 'mj-team-ctrl');
        ctrl.append(minus, input, el('span', 'mj-enemy-unit', 'PV'), plus);
        row.append(label, ctrl, bar);
        let statuses = fighterStatuses(id);
        if (Object.keys(statuses).length)
            row.append(statusChips(statuses, target));
        return row;
    }

    function renderTeam() {
        renderStatusPanel();
        // Don't erase a value being typed
        if (teamBox.contains(document.activeElement) && document.activeElement.tagName === 'INPUT')
            return;
        teamBox.innerHTML = '';
        if (!players.length && !allies.length)
            return;
        teamBox.append(el('div', 'mj-team-title', 'Points de vie (1 moral = 10 PV)'));
        for (let p of players)
            teamBox.append(teamRow(p.name, String(p.discord_id), p.moral, {discord_id: p.discord_id}, false));
        for (let a of allies)
            teamBox.append(teamRow(a.name, 'npc' + a.id, a.moral, {ally_id: a.id}, true));
    }

    function setHp(enemy, hp) {
        wsLNOB.send({action: 'combat-hp', data: {enemy_id: enemy.id, hp: hp}});
    }

    function addPending() {
        let name = search.value.trim();
        if (!name)
            return;
        let mob = BESTIARY.find(b => b.name.toLowerCase() === name.toLowerCase());
        search.value = '';
        // In the middle of combat, the opponent arrives right away as reinforcement
        if (state.active) {
            wsLNOB.send({action: 'combat-add', data: {enemy: mob ? Object.assign({}, mob) : {name: name, hp: 10}}});
            return;
        }
        // Bestiary loot (names, or {name, qty}) in the combat format
        let loot = mob && Array.isArray(mob.loot) ? mob.loot.map(l => typeof l === 'string' ? {name: l} : l) : [];
        pending.push(mob ? Object.assign({}, mob, {loot: loot}) : {name: name, hp: 10});
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

    // Rule taken from the old menu: -10 morale during combat = fainted
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

    startBtn.addEventListener('hold-confirm', () => {
        if (state.active)
            wsLNOB.send({action: 'combat-end', data: {}});
    });
    startBtn.addEventListener('click', () => {
        if (state.active)
            return;
        if (!pending.length) {
            search.focus();
            startBtn.classList.remove('shake');
            void startBtn.offsetWidth;
            startBtn.classList.add('shake');
            return;
        }
        wsLNOB.send({action: 'combat-start', data: {enemies: pending, initiative: initSelect.value}});
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
    document.addEventListener('playerStat', (e) => {
        let data = e.detail.data;
        let p = data && players.find(p => String(p.discord_id) === String(data.discord_id));
        if (p) {
            p.moral = data.moral;
            renderTeam();
        }
        checkFaint();
    });
    document.addEventListener('allies', (e) => {
        allies = e.detail.data.allies;
        if (targetId !== null || victimFor !== null)
            render();
        else
            renderTeam();
    });

    function load() {
        fetch('/api/allies').then(r => r.json()).then(list => { allies = list; renderTeam(); }).catch(() => {});
        // Players loaded right away, for their HP even outside combat
        getAllPlayers().then(list => { players = list; renderTeam(); }).catch(() => {});
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
