// Fenêtre de dés flottante, la même pour les joueurs (page joueur : copie
// faite par scripts/player-assets.js) et pour le MJ (menu MJ) : jets sur les
// stats et dés neutres D2 à D100, sans changer de page. Le bouton 🎲 en bas à
// gauche l'ouvre ; elle se déplace en la tenant par son titre et garde sa
// place d'une visite à l'autre.
//
//   let dice = DiceWindow.create({
//       storageKey,                   place et réglages gardés (localStorage)
//       modules: [[value, label]],    modules d'un jet de stat ('' : aucun)
//       secretLabel, secretDefault,   case « secret » des dés neutres
//       timeoutText,                  message si le jet reste sans réponse
//       onStat(stat, module, target), jet de stat demandé
//       onDice(sides, count, secret)  dés neutres demandés
//   });
//   dice.setStats([{stat, label, value}], hint)  stats lançables (vide : hint)
//   dice.setTargets([{id, name, group}])         MJ : pour qui lancer la stat
//   dice.result({title, total, detail, tone})    résultat reçu (tone : ok | fail)
//   dice.log({who, what, total, tone})           ligne de « Derniers jets »
//   dice.clearLog()                              « Derniers jets » vidé
//   dice.fail(text)                              jet refusé
(function () {
    'use strict';
    const SIDES = [2, 4, 6, 8, 10, 20, 100];
    const MAX_COUNT = 10;
    const LOG_SIZE = 8;
    const WAIT_MS = 5000;   // sans réponse, la roue s'arrête

    // Forme de chaque dé (viewBox 40 × 40)
    const SHAPES = {
        2: '<circle cx="20" cy="20" r="16"/>',
        4: '<polygon points="20,4 36,34 4,34"/>',
        6: '<rect x="6" y="6" width="28" height="28" rx="4"/>',
        8: '<polygon points="20,3 37,20 20,37 3,20"/>',
        10: '<polygon points="20,3 36,16 30,36 10,36 4,16"/>',
        20: '<polygon points="20,3 35,11.5 35,28.5 20,37 5,28.5 5,11.5"/>',
        100: '<circle cx="15" cy="20" r="11"/><circle cx="26" cy="20" r="11"/>'
    };

    const el = (tag, cls, text) => {
        let e = document.createElement(tag);
        if (cls)
            e.className = cls;
        if (text !== undefined)
            e.textContent = text;
        return e;
    };
    const load = (key) => {
        try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
    };
    const save = (key, value) => {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* navigation privée */ }
    };

    const create = function (options) {
        let key = options.storageKey || 'lnob-dice';
        let saved = load(key) || {};

        let fab = el('button', 'dice-fab');
        fab.type = 'button';
        fab.setAttribute('aria-expanded', 'false');
        fab.setAttribute('aria-controls', 'dice-window');
        fab.append(el('span', 'dice-fab-icon', '🎲'), el('span', 'dice-fab-label', 'Dés'));

        let win = el('section', 'dice-window');
        win.id = 'dice-window';
        win.setAttribute('role', 'dialog');
        win.setAttribute('aria-label', 'Dés');
        win.hidden = true;

        let head = el('header', 'dice-head');
        let close = el('button', 'dice-close', '✕');
        close.type = 'button';
        close.setAttribute('aria-label', 'Fermer');
        head.append(el('span', 'dice-title', '🎲 Dés'), close);

        // Résultat : gros chiffre, détail dessous
        let result = el('div', 'dice-result');
        result.setAttribute('aria-live', 'polite');
        let total = el('div', 'dice-total', '–');
        let detail = el('div', 'dice-detail', 'Choisis une stat ou un dé.');
        result.append(total, detail);

        // Stats
        let stats = el('section', 'dice-section dice-stats');
        let target = el('select', 'dice-target');
        target.setAttribute('aria-label', 'Pour qui');
        target.hidden = true;
        let statGrid = el('div', 'dice-stat-grid');
        let module = el('select', 'dice-module');
        module.setAttribute('aria-label', 'Module');
        for (let [value, label] of options.modules || [['', 'Sans module']]) {
            let o = el('option', '', label);
            o.value = value;
            module.append(o);
        }
        let hint = el('p', 'dice-hint');
        stats.append(el('h3', '', 'Stats'), target, statGrid, module, hint);

        // Dés neutres
        let neutral = el('section', 'dice-section dice-neutral');
        let count = Math.min(MAX_COUNT, Math.max(1, parseInt(saved.count) || 1));
        let countBox = el('div', 'dice-count');
        let minus = el('button', 'dice-step', '−');
        let plus = el('button', 'dice-step', '+');
        minus.type = plus.type = 'button';
        minus.setAttribute('aria-label', 'Un dé de moins');
        plus.setAttribute('aria-label', 'Un dé de plus');
        let countOut = el('output', 'dice-count-value');
        countBox.append(el('span', 'dice-count-label', 'Nombre'), minus, countOut, plus);
        let grid = el('div', 'dice-grid');
        for (let sides of SIDES) {
            let b = el('button', 'dice-die');
            b.type = 'button';
            b.dataset.sides = sides;
            b.innerHTML = '<svg viewBox="0 0 40 40" aria-hidden="true">' + SHAPES[sides] + '</svg>';
            b.append(el('span', 'dice-die-label', 'D' + sides));
            grid.append(b);
        }
        let secretBox = el('label', 'dice-secret');
        let secret = el('input');
        secret.type = 'checkbox';
        secret.checked = saved.secret !== undefined ? !!saved.secret : !!options.secretDefault;
        secretBox.append(secret, document.createTextNode(' ' + (options.secretLabel || 'Secret')));
        neutral.append(el('h3', '', 'Dés neutres'), countBox, grid, secretBox);

        // Derniers jets
        let logBox = el('section', 'dice-section dice-log-box');
        let logList = el('ol', 'dice-log');
        logBox.append(el('h3', '', 'Derniers jets'), logList);
        logBox.hidden = true;

        let body = el('div', 'dice-body');
        body.append(result, stats, neutral, logBox);
        win.append(head, body);
        document.body.append(fab, win);

        const showCount = () => {
            countOut.textContent = count;
            minus.disabled = count <= 1;
            plus.disabled = count >= MAX_COUNT;
        };
        showCount();
        const remember = () => save(key, {x: saved.x, y: saved.y, count: count, secret: secret.checked});
        minus.addEventListener('click', () => { count = Math.max(1, count - 1); showCount(); remember(); });
        plus.addEventListener('click', () => { count = Math.min(MAX_COUNT, count + 1); showCount(); remember(); });
        secret.addEventListener('change', remember);

        // ---- Ouvrir, fermer, déplacer ----------------------------------
        const place = function () {
            if (saved.x === undefined || saved.y === undefined) {
                win.style.left = win.style.top = win.style.bottom = '';
                return;
            }
            let w = win.offsetWidth, h = win.offsetHeight;
            let x = Math.min(Math.max(0, saved.x), Math.max(0, window.innerWidth - w));
            let y = Math.min(Math.max(0, saved.y), Math.max(0, window.innerHeight - h));
            win.style.left = x + 'px';
            win.style.top = y + 'px';
            win.style.bottom = 'auto';
        };
        const open = function (on) {
            win.hidden = !on;
            fab.setAttribute('aria-expanded', String(on));
            fab.classList.toggle('active', on);
            if (on) {
                place();
                close.focus({preventScroll: true});
            }
        };
        fab.addEventListener('click', () => open(win.hidden));
        close.addEventListener('click', () => { open(false); fab.focus({preventScroll: true}); });
        win.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                open(false);
                fab.focus({preventScroll: true});
            }
        });
        window.addEventListener('resize', () => { if (!win.hidden) place(); });

        let drag = null;
        head.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || e.target.closest('button'))
                return;
            let box = win.getBoundingClientRect();
            drag = {dx: e.clientX - box.left, dy: e.clientY - box.top, id: e.pointerId};
            head.setPointerCapture(e.pointerId);
            win.classList.add('dragging');
        });
        head.addEventListener('pointermove', (e) => {
            if (!drag || e.pointerId !== drag.id)
                return;
            saved.x = Math.round(e.clientX - drag.dx);
            saved.y = Math.round(e.clientY - drag.dy);
            place();
        });
        const stopDrag = (e) => {
            if (!drag || e.pointerId !== drag.id)
                return;
            drag = null;
            win.classList.remove('dragging');
            remember();
        };
        head.addEventListener('pointerup', stopDrag);
        head.addEventListener('pointercancel', stopDrag);
        // Double clic sur le titre : la fenêtre revient à sa place
        head.addEventListener('dblclick', (e) => {
            if (e.target.closest('button'))
                return;
            delete saved.x;
            delete saved.y;
            place();
            remember();
        });

        // ---- Lancer -----------------------------------------------------
        let spin = null, waiting = null;
        const stopSpin = () => {
            clearInterval(spin);
            clearTimeout(waiting);
            spin = waiting = null;
            win.classList.remove('rolling');
        };
        const startSpin = function (max, label) {
            stopSpin();
            win.classList.add('rolling');
            total.className = 'dice-total';
            detail.textContent = label + '…';
            spin = setInterval(() => { total.textContent = 1 + Math.floor(Math.random() * max); }, 60);
            waiting = setTimeout(() => {
                stopSpin();
                total.textContent = '–';
                detail.textContent = options.timeoutText || 'Pas de réponse : relance dans un instant.';
            }, WAIT_MS);
        };

        let statList = [];
        statGrid.addEventListener('click', (e) => {
            let b = e.target.closest('.dice-stat');
            if (!b || b.disabled)
                return;
            if (!target.hidden && !target.value)
                return;
            let stat = statList.find(s => s.stat === b.dataset.stat);
            startSpin(100, stat ? stat.label : 'Jet');
            options.onStat(b.dataset.stat, module.disabled ? '' : module.value, target.hidden ? null : target.value);
        });
        grid.addEventListener('click', (e) => {
            let b = e.target.closest('.dice-die');
            if (!b)
                return;
            let sides = parseInt(b.dataset.sides);
            startSpin(sides * count, count + 'D' + sides);
            options.onDice(sides, count, secret.checked);
        });

        // ---- Ce que la page lui donne -----------------------------------
        const setStats = function (list, text) {
            statList = list || [];
            let keyNow = JSON.stringify(statList);
            if (statGrid.dataset.key !== keyNow) {
                statGrid.dataset.key = keyNow;
                statGrid.replaceChildren(...statList.map(s => {
                    let b = el('button', 'dice-stat');
                    b.type = 'button';
                    b.dataset.stat = s.stat;
                    b.append(el('span', 'dice-stat-label', s.label));
                    if (s.value !== undefined && s.value !== null && s.value !== '')
                        b.append(el('span', 'dice-stat-value', String(s.value)));
                    return b;
                }));
            }
            statGrid.hidden = module.hidden = !statList.length;
            hint.textContent = text || '';
            hint.hidden = !text;
        };
        // Un compagnon lance sans module
        const syncModule = function () {
            module.disabled = String(target.value).startsWith('npc');
            if (module.disabled)
                module.value = '';
        };
        target.addEventListener('change', syncModule);
        const setTargets = function (list) {
            let current = target.value;
            let groups = new Map();
            for (let t of list || []) {
                if (!groups.has(t.group || ''))
                    groups.set(t.group || '', []);
                groups.get(t.group || '').push(t);
            }
            target.replaceChildren();
            for (let [label, items] of groups) {
                let parent = target;
                if (label) {
                    parent = el('optgroup');
                    parent.label = label;
                    target.append(parent);
                }
                for (let t of items) {
                    let o = el('option', '', t.name);
                    o.value = t.id;
                    parent.append(o);
                }
            }
            if (!(list || []).length) {
                let o = el('option', '', 'Aucun joueur');
                o.value = '';
                target.append(o);
            }
            if ((list || []).some(t => t.id === current))
                target.value = current;
            target.hidden = false;
            syncModule();
        };
        const showResult = function (r) {
            stopSpin();
            total.textContent = r.total;
            total.className = 'dice-total pop' + (r.tone ? ' ' + r.tone : '');
            void total.offsetWidth;
            detail.textContent = (r.title ? r.title + ' · ' : '') + (r.detail || '');
        };
        const addLog = function (entry) {
            let li = el('li', entry.tone || '');
            li.append(el('span', 'dice-log-who', entry.who || ''), el('span', 'dice-log-what', entry.what || ''), el('strong', 'dice-log-total', String(entry.total)));
            logList.prepend(li);
            while (logList.children.length > LOG_SIZE)
                logList.lastElementChild.remove();
            logBox.hidden = false;
        };
        const fail = function (text) {
            stopSpin();
            total.textContent = '–';
            total.className = 'dice-total';
            detail.textContent = text;
        };

        const clearLog = function () {
            logList.replaceChildren();
            logBox.hidden = true;
        };

        return {setStats, setTargets, result: showResult, log: addLog, clearLog, fail, open, rolling: () => !!spin};
    };

    // Texte d'un jet de dés neutres reçu (message du chat ou réponse)
    const describe = (r) => (r.count > 1 ? r.dice.join(' + ') + ' = ' : '') + r.total;

    window.DiceWindow = {create, describe, SIDES, MAX_COUNT};
})();
