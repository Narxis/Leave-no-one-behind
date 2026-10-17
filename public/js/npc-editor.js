// Éditeur d'ennemis et compagnons (/bestiaire) : fiches enregistrées par
// src/controllers/npcs.js et proposées dans le menu MJ (onglets
// Adversaires et Compagnons).
(function () {
    const $ = (id) => document.getElementById(id);
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
    const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
    const toInt = (v, def) => Number.isFinite(parseInt(v)) ? parseInt(v) : def;

    const DAMAGE = {faible: [1, 4], moyen: [5, 8], fort: [9, 12]};
    const DAMAGE_LABEL = {faible: 'Faibles', moyen: 'Moyens', fort: 'Forts'};
    const STATS = [['combat', 'Combat'], ['pilotage', 'Pilotage'], ['engineering', 'Ingénierie'],
        ['survival', 'Survie'], ['recon', 'Reconnaissance'], ['moral', 'Moral']];
    const KINDS = {
        enemies: {one: 'ennemi', new: 'Nouvel ennemi', create: 'Créer l\'ennemi', max: NPC_LIMITS.enemies,
            intro: 'Ils apparaissent dans la recherche « Adversaire » du menu MJ, avec leurs PV, leur attaque, leur défense et leur butin.'},
        companions: {one: 'compagnon', new: 'Nouveau compagnon', create: 'Créer le compagnon', max: NPC_LIMITS.companions,
            intro: 'Dans l\'onglet « Compagnons » du menu MJ, tape leur nom : ils arrivent avec leur rôle et leurs stats.'}
    };

    let data = NPCS;
    let kind = 'enemies';
    let editing = null;     // fiche affichée (null : nouvelle)
    const enemy = {};       // valeurs du formulaire ennemi
    const companion = {};   // valeurs du formulaire compagnon

    // Fourchettes du bestiaire de départ, par palier de dégâts : un « Roll »
    // d'ennemi reste dans celle du palier choisi
    const TIERS = {
        faible: {hp: [10, 16], offense: [40, 50], defense: [40, 55]},
        moyen: {hp: [14, 24], offense: [55, 65], defense: [45, 55]},
        fort: {hp: [28, 40], offense: [68, 78], defense: [58, 68]}
    };
    const rand = ([min, max]) => min + Math.floor(Math.random() * (max - min + 1));
    // Catégories d'ennemis : le Roll part des fourchettes du palier de dégâts,
    // puis multiplie les PV et décale l'attaque et la défense
    const CATEGORIES = {
        invocation: {label: 'Invocation', plural: 'Invocations', hp: 0.5, shift: -10, help: 'appelée en renfort, fragile'},
        sbire: {label: 'Sbire', plural: 'Sbires', hp: 0.75, shift: -5, help: 'chair à canon, souvent en groupe'},
        standard: {label: 'Standard', plural: 'Standards', hp: 1, shift: 0, help: 'adversaire ordinaire'},
        elite: {label: 'Élite', plural: 'Élites', hp: 1.5, shift: 5, help: 'plus coriace que la moyenne'},
        boss: {label: 'Boss', plural: 'Boss', hp: 3, shift: 10, help: 'combat de fin de lieu'}
    };
    const categoryOf = (e) => CATEGORIES[e.category] ? e.category : 'standard';
    let filter = 'all';

    let toastTimer;
    function toast(text, error) {
        let t = $('ne-toast');
        t.textContent = text;
        t.className = 're-toast show' + (error ? ' error' : '');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
    }

    // Chance (en %) qu'un jet de stat atteigne une valeur, avec la formule de
    // Player.roll : dé × stat / 100 + (moral - 50) / 4, arrondi au-dessus
    function chance(stat, moral, target) {
        let ok = 0;
        for (let d = 1; d <= 100; d++)
            if (Math.ceil(d * stat / 100 + (moral - 50) / 4) >= target)
                ok++;
        return ok;
    }

    /* ---------- Liste ---------- */

    function pill(text, cls, title) {
        return '<span class="re-mod ' + (cls || 'mod-0') + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + esc(text) + '</span>';
    }

    function card(entry) {
        let b = document.createElement('button');
        b.type = 'button';
        b.className = 're-card ne-card' + (editing && editing.slug === entry.slug ? ' selected' : '');
        let pills, sub = '';
        if (kind === 'enemies') {
            let cat = categoryOf(entry);
            pills = (cat !== 'standard' ? pill(CATEGORIES[cat].label, 'ne-cat-' + cat) : '')
                + pill('PV ' + entry.hp, 'ne-pill-hp') + pill('Att ' + entry.offense, '', 'Attaque')
                + pill('Déf ' + entry.defense, '', 'Défense') + pill('Dégâts ' + (DAMAGE_LABEL[entry.damage] || entry.damage).toLowerCase(), 'ne-pill-' + entry.damage);
            if (entry.loot && entry.loot.length)
                pills += pill(entry.loot.length + (entry.loot.length > 1 ? ' objets' : ' objet'), 'ne-pill-loot', entry.loot.join(', '));
        }
        else {
            sub = entry.race ? '<span class="ne-card-sub">' + esc(entry.race) + '</span>' : '';
            pills = STATS.map(([key, label]) => pill(label.slice(0, 3) + ' ' + entry[key], '', label)).join('');
        }
        b.innerHTML = '<span class="ne-card-icon ne-icon-' + kind + (kind === 'enemies' ? ' ne-icon-' + categoryOf(entry) : '') + '" aria-hidden="true">' + esc(entry.name.charAt(0).toUpperCase()) + '</span>'
            + '<span class="re-card-body"><span class="re-card-name">' + esc(entry.name) + sub + '</span>'
            + '<span class="re-card-mods">' + pills + '</span></span>';
        b.addEventListener('click', () => open(entry));
        return b;
    }

    function renderList() {
        let list = data[kind];
        let q = $('ne-search').value.trim().toLowerCase();
        let shown = q ? list.filter(e => (e.name + ' ' + (e.race || '')).toLowerCase().includes(q)) : list;
        if (kind === 'enemies' && filter !== 'all')
            shown = shown.filter(e => categoryOf(e) === filter);
        renderFilters();
        let box = $('ne-list');
        box.innerHTML = '';
        if (!list.length)
            box.innerHTML = '<p class="re-empty">Aucun ' + KINDS[kind].one + ' pour l\'instant. Clique sur « ' + KINDS[kind].new + ' » pour en créer un.</p>';
        else if (!shown.length)
            box.innerHTML = '<p class="re-empty">Aucune fiche ne correspond' + (q ? ' à « ' + esc(q) + ' »' : '')
                + (kind === 'enemies' && filter !== 'all' ? ' dans « ' + CATEGORIES[filter].plural + ' »' : '') + '.</p>';
        shown.forEach(e => box.append(card(e)));
        $('ne-count').textContent = list.length + ' / ' + KINDS[kind].max + (kind === 'enemies' ? ' ennemis' : ' compagnons');
        $('ne-new').disabled = list.length >= KINDS[kind].max;
        $('ne-intro').textContent = KINDS[kind].intro;
    }

    // Filtres par catégorie (ennemis seulement), avec le nombre de fiches
    function renderFilters() {
        let box = $('ne-filters');
        box.hidden = kind !== 'enemies';
        if (box.hidden)
            return;
        let list = data.enemies;
        box.innerHTML = '';
        [['all', 'Tous', list.length]].concat(Object.keys(CATEGORIES).map(c => [c, CATEGORIES[c].plural, list.filter(e => categoryOf(e) === c).length]))
            .forEach(([key, label, n]) => {
                let b = document.createElement('button');
                b.type = 'button';
                b.setAttribute('role', 'radio');
                b.setAttribute('aria-checked', filter === key);
                b.className = 'ne-filter' + (key !== 'all' ? ' ne-filter-' + key : '');
                b.innerHTML = esc(label) + ' <small>' + n + '</small>';
                b.addEventListener('click', () => {
                    filter = key;
                    renderList();
                });
                box.append(b);
            });
    }

    /* ---------- Ennemi ---------- */

    // Champ nombre + curseur liés ; le curseur s'arrête à son max, le nombre va plus loin
    function bindNumber(key, min, max, values, render) {
        let num = $('ne-' + key), range = $('ne-' + key + '-range');
        num.addEventListener('input', () => {
            values[key] = clamp(toInt(num.value, values[key]), min, max);
            range.value = values[key];
            render();
        });
        num.addEventListener('change', () => num.value = values[key]);
        range.addEventListener('input', () => {
            values[key] = toInt(range.value, values[key]);
            num.value = values[key];
            render();
        });
    }

    function renderEnemy() {
        let avg = (DAMAGE[enemy.damage][0] + DAMAGE[enemy.damage][1]) / 2;
        $('ne-hp-help').textContent = 'Tombe en ≈ ' + Math.ceil(enemy.hp / 6.5) + ' attaque' + (enemy.hp > 6.5 ? 's' : '')
            + ' réussie' + (enemy.hp > 6.5 ? 's' : '') + ' (de 1 à 12 dégâts selon la marge du jet).';
        $('ne-offense-help').textContent = 'Touche ' + enemy.offense + ' % du temps, soit ≈ '
            + (enemy.offense * avg / 100).toFixed(1).replace('.', ',') + ' PV retirés par attaque en moyenne (1 moral = 10 PV).';
        $('ne-defense-help').textContent = 'Le /roll Combat doit atteindre ' + enemy.defense + '. Avec 100 de moral, un joueur à 50 en Combat touche '
            + chance(50, 100, enemy.defense) + ' % du temps, à 75 : ' + chance(75, 100, enemy.defense) + ' %.';
        $('ne-damage').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', b.dataset.value === enemy.damage));
        $('ne-category').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', b.dataset.value === enemy.category));
        renderLoot();
    }

    function renderLoot() {
        let box = $('ne-loot');
        box.innerHTML = '';
        if (!enemy.loot.length)
            box.innerHTML = '<span class="ne-loot-empty">Pas de butin</span>';
        enemy.loot.forEach((name, i) => {
            let known = LOOT_ITEMS.find(it => it.name.toLowerCase() === name.toLowerCase());
            let chip = document.createElement('span');
            chip.className = 'ne-chip' + (known ? '' : ' is-custom');
            chip.title = known ? name : name + ' (objet libre, absent de la liste des objets)';
            chip.innerHTML = (known && known.image ? '<img src="' + esc(known.image) + '" alt="">' : '<span class="ne-chip-initial">' + esc(name.charAt(0)) + '</span>')
                + '<span>' + esc(name) + '</span><button type="button" title="Retirer ' + esc(name) + '" aria-label="Retirer ' + esc(name) + '">×</button>';
            chip.querySelector('button').addEventListener('click', () => {
                enemy.loot.splice(i, 1);
                renderLoot();
            });
            box.append(chip);
        });
        let full = enemy.loot.length >= NPC_LIMITS.loot;
        $('ne-loot-input').disabled = full;
        $('ne-loot-btn').disabled = full;
        $('ne-loot-input').placeholder = full ? NPC_LIMITS.loot + ' objets au plus' : 'Ajouter un objet…';
    }

    function addLoot() {
        let input = $('ne-loot-input');
        let name = input.value.replace(/\s+/g, ' ').trim().slice(0, 60);
        if (!name || enemy.loot.length >= NPC_LIMITS.loot)
            return;
        let known = LOOT_ITEMS.find(it => it.name.toLowerCase() === name.toLowerCase());
        enemy.loot.push(known ? known.name : name);
        input.value = '';
        renderLoot();
        input.focus();
    }

    function fillEnemy(src) {
        // Même objet (les champs liés le gardent), valeurs remplacées
        Object.assign(enemy, {
            hp: src ? src.hp : 15,
            offense: src ? src.offense : 50,
            defense: src ? src.defense : 50,
            damage: src && DAMAGE[src.damage] ? src.damage : 'moyen',
            // Nouvelle fiche : catégorie du filtre affiché, s'il y en a un
            category: src ? categoryOf(src) : (filter !== 'all' ? filter : 'standard'),
            loot: src && Array.isArray(src.loot) ? src.loot.map(l => typeof l === 'string' ? l : l.name).filter(Boolean) : []
        });
        $('ne-enemy-name').value = src ? src.name : '';
        for (let key of ['hp', 'offense', 'defense']) {
            $('ne-' + key).value = enemy[key];
            $('ne-' + key + '-range').value = enemy[key];
        }
        renderEnemy();
    }

    /* ---------- Compagnon ---------- */

    function buildStats() {
        let box = $('ne-stats');
        for (let [key, label] of STATS) {
            let row = document.createElement('div');
            row.className = 'ne-num ne-stat';
            row.innerHTML = '<label class="ne-num-label" for="ne-' + key + '">' + label + '</label>'
                + '<input type="range" id="ne-' + key + '-range" min="0" max="100" aria-label="' + label + '">'
                + '<input type="number" id="ne-' + key + '" min="0" max="100" inputmode="numeric">';
            box.append(row);
            bindNumber(key, 0, 100, companion, renderCompanion);
        }
    }

    function renderCompanion() {
        $('ne-companion-help').textContent = 'PV : ' + companion.moral * 10 + ' (moral × 10). Un jet est réussi à 50 : à '
            + companion.combat + ' en Combat avec ' + companion.moral + ' de moral, il réussit ' + chance(companion.combat, companion.moral, 50) + ' % de ses attaques.';
    }

    function fillCompanion(src) {
        $('ne-companion-name').value = src ? src.name : '';
        $('ne-companion-race').value = src ? (src.race || '') : '';
        for (let [key] of STATS) {
            companion[key] = src ? src[key] : 50;
            $('ne-' + key).value = companion[key];
            $('ne-' + key + '-range').value = companion[key];
        }
        renderCompanion();
    }

    /* ---------- Roll ---------- */

    function showRollInfo(f, text) {
        let info = $('ne-' + f + '-roll-info');
        info.textContent = text;
        info.hidden = false;
    }

    function setField(key, value) {
        $('ne-' + key).value = value;
        $('ne-' + key + '-range').value = value;
    }

    // Ennemi : PV, attaque et défense tirés dans la fourchette de son palier de dégâts
    // puis ajusté par sa catégorie (PV multipliés, attaque et défense décalées)
    function rollEnemy() {
        let tier = TIERS[enemy.damage], cat = CATEGORIES[enemy.category];
        let ranges = {
            hp: tier.hp.map(v => Math.max(1, Math.round(v * cat.hp))),
            offense: tier.offense.map(v => clamp(v + cat.shift, 5, 95)),
            defense: tier.defense.map(v => clamp(v + cat.shift, 5, 95))
        };
        for (let key of ['hp', 'offense', 'defense']) {
            enemy[key] = rand(ranges[key]);
            setField(key, enemy[key]);
        }
        renderEnemy();
        showRollInfo('enemy', cat.label + ' aux dégâts ' + DAMAGE_LABEL[enemy.damage].toLowerCase()
            + ' : PV ' + ranges.hp.join('-') + ', attaque ' + ranges.offense.join('-') + ', défense ' + ranges.defense.join('-')
            + '. Change la catégorie ou le palier pour un ennemi plus fort ou plus faible.');
    }

    // Compagnon : tiré comme un personnage joueur (/create sur Discord). Chaque
    // stat vaut 50 + le meilleur (bonus) ou le pire (malus) de |bonus|+1 dés de 50 ;
    // les bonus sont ceux de la race écrite dans « Rôle ou race », s'il y en a une
    function rollCompanion() {
        let typed = $('ne-companion-race').value.trim().toLowerCase();
        let race = RACES.find(r => r.name.toLowerCase() === typed);
        for (let [key] of STATS) {
            let value = 100;
            if (key !== 'moral') {
                let mod = race ? (race.stats[key] || 0) : 0;
                let dice = Array.from({length: Math.abs(mod) + 1}, () => rand([1, 50]));
                value = 50 + (mod >= 0 ? Math.max(...dice) : Math.min(...dice));
            }
            companion[key] = value;
            setField(key, value);
        }
        renderCompanion();
        showRollInfo('companion', race
            ? 'Tiré comme un personnage ' + race.name + ' : bonus et malus de la race, moral 100.'
            : 'Tiré comme un personnage sans bonus de race (50 + 1 dé de 50), moral 100. Écris une race dans « Rôle ou race » pour appliquer ses bonus.');
    }

    /* ---------- Nom aléatoire ---------- */

    // Noms extraterrestres faits de syllabes ; un ennemi reçoit en plus un
    // titre qui va avec sa catégorie (Larve, Pillard, Seigneur…)
    const SYLLABLES = {
        start: ['Zor', 'Kra', 'Vel', 'Nek', 'Yr', 'Thal', 'Mor', 'Xa', 'Gor', 'Sil', 'Dra', 'Ka', 'Qu', 'Vor', 'Lu', 'Brak', 'Ze', 'Oph', 'Rhu', 'Tsa'],
        middle: ['a', 'e', 'i', 'o', 'u', 'ra', 'li', 'zo', 'ne', 'ka', 'th', 'ri'],
        end: ['vak', 'nor', 'rax', 'th', 'lis', 'gul', 'mok', 'zar', 'dra', 'nix', 'ok', 'el', 'ash', 'ur', 'ion', 'ek']
    };
    const TITLES = {
        invocation: ['Larve', 'Spectre', 'Drone', 'Écho', 'Familier', 'Rejeton'],
        sbire: ['Pillard', 'Recrue', 'Garde', 'Larbin', 'Ferrailleur', 'Éclaireur'],
        standard: ['Mercenaire', 'Chasseur', 'Pirate', 'Contrebandier', 'Soldat', 'Braconnier'],
        elite: ['Vétéran', 'Capitaine', 'Lame', 'Traqueur', 'Sergent', 'Gardien'],
        boss: ['Seigneur', 'Reine', 'Tyran', 'Matriarche', 'Amiral', 'Dévoreur']
    };
    const pick = (list) => list[Math.floor(Math.random() * list.length)];

    function alienName() {
        let name = pick(SYLLABLES.start) + (Math.random() < 0.5 ? pick(SYLLABLES.middle) : '') + pick(SYLLABLES.end);
        return name.charAt(0) + name.slice(1).toLowerCase();
    }

    // Nom libre parmi les fiches du même type, quelques essais au plus
    function randomName(f) {
        let names = data[kind].map(e => e.name.toLowerCase());
        let name;
        for (let i = 0; i < 20; i++) {
            name = f === 'enemy' ? pick(TITLES[enemy.category]) + ' ' + alienName()
                : (Math.random() < 0.6 ? alienName() + ' ' + alienName() : alienName());
            if (name.length <= (f === 'enemy' ? 60 : 20) && !names.includes(name.toLowerCase()))
                break;
        }
        return name.slice(0, f === 'enemy' ? 60 : 20);
    }

    /* ---------- Fiche ouverte ---------- */

    const formOf = (k) => k === 'enemies' ? 'enemy' : 'companion';

    // Ouvre une fiche (null : nouvelle ; copy : nouvelle fiche pré-remplie)
    function open(entry, copy) {
        editing = entry;
        let f = formOf(kind);
        let src = entry || copy || null;
        if (kind === 'enemies')
            fillEnemy(src);
        else
            fillCompanion(src);
        if (copy)
            $('ne-' + f + '-name').value = copy.name + ' (copie)';
        $('ne-' + f + '-title').textContent = entry ? 'Modifier ' + entry.name : KINDS[kind].new;
        $('ne-' + f + '-save').textContent = entry ? 'Enregistrer' : KINDS[kind].create;
        $('ne-' + f + '-delete').hidden = !entry;
        $('ne-' + f + '-copy').hidden = !entry;
        $('ne-' + f + '-error').textContent = '';
        $('ne-' + f + '-roll-info').hidden = true;
        renderList();
    }

    function switchKind(k) {
        kind = k;
        document.querySelectorAll('.ne-tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.kind === k));
        $('ne-enemy-form').hidden = k !== 'enemies';
        $('ne-companion-form').hidden = k !== 'companions';
        $('ne-new-label').textContent = KINDS[k].new;
        $('ne-search').value = '';
        try { localStorage.setItem('npc-editor-tab', k); } catch (e) {}
        open(null);
    }

    async function reload() {
        data = await (await fetch('/api/npcs')).json();
    }

    async function save(e) {
        e.preventDefault();
        let f = formOf(kind);
        let name = $('ne-' + f + '-name').value.trim();
        if (!name) {
            $('ne-' + f + '-error').textContent = 'Donne un nom ' + (kind === 'enemies' ? 'à l\'ennemi.' : 'au compagnon.');
            return $('ne-' + f + '-name').focus();
        }
        let body = {slug: editing ? editing.slug : undefined, name: name};
        if (kind === 'enemies')
            Object.assign(body, enemy);
        else
            Object.assign(body, companion, {race: $('ne-companion-race').value});
        let btn = $('ne-' + f + '-save');
        btn.disabled = true;
        try {
            let res = await fetch('/api/npcs/' + kind, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            let out = await res.json();
            if (out.error) {
                $('ne-' + f + '-error').textContent = out.error;
                return;
            }
            let created = !editing;
            await reload();
            toast(KINDS[kind].one.charAt(0).toUpperCase() + KINDS[kind].one.slice(1) + ' « ' + out.entry.name + ' » ' + (created ? 'créé' : 'enregistré'));
            open(data[kind].find(x => x.slug === out.entry.slug));
        }
        catch (err) {
            $('ne-' + f + '-error').textContent = 'Enregistrement impossible, réessaie.';
        }
        finally {
            btn.disabled = false;
        }
    }

    async function remove() {
        let entry = editing;
        let dialog = $('ne-confirm');
        $('ne-confirm-title').textContent = 'Supprimer « ' + entry.name + ' » ?';
        $('ne-confirm-text').textContent = kind === 'enemies'
            ? 'Il disparaîtra de la recherche « Adversaire » du menu MJ. Un combat en cours n\'est pas touché.'
            : 'Il disparaîtra des suggestions de l\'onglet « Compagnons » du menu MJ. Les compagnons déjà dans la partie restent.';
        dialog.returnValue = '';
        dialog.showModal();
        let ok = await new Promise(r => dialog.addEventListener('close', () => r(dialog.returnValue === 'ok'), {once: true}));
        if (!ok)
            return;
        let out = await (await fetch('/api/npcs/' + kind + '/' + encodeURIComponent(entry.slug), {method: 'DELETE'})).json();
        if (out.error)
            return toast(out.error, true);
        await reload();
        toast('« ' + entry.name + ' » supprimé');
        open(null);
    }

    /* ---------- Événements ---------- */

    document.querySelectorAll('.ne-tabs button').forEach(b => b.addEventListener('click', () => switchKind(b.dataset.kind)));
    $('ne-new').addEventListener('click', () => {
        open(null);
        $('ne-' + formOf(kind) + '-name').focus();
    });
    $('ne-search').addEventListener('input', renderList);

    bindNumber('hp', 1, 999, enemy, renderEnemy);
    bindNumber('offense', 0, 100, enemy, renderEnemy);
    bindNumber('defense', 0, 100, enemy, renderEnemy);
    for (let key in CATEGORIES) {
        let b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.dataset.value = key;
        b.title = CATEGORIES[key].help;
        b.textContent = CATEGORIES[key].label;
        b.addEventListener('click', () => {
            enemy.category = key;
            renderEnemy();
        });
        $('ne-category').append(b);
    }
    $('ne-damage').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        enemy.damage = b.dataset.value;
        renderEnemy();
    }));
    $('ne-loot-btn').addEventListener('click', addLoot);
    $('ne-loot-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addLoot();
        }
    });
    buildStats();
    $('ne-enemy-roll').addEventListener('click', rollEnemy);
    for (let f of ['enemy', 'companion'])
        $('ne-' + f + '-name-roll').addEventListener('click', () => {
            $('ne-' + f + '-name').value = randomName(f);
            $('ne-' + f + '-error').textContent = '';
        });
    $('ne-companion-roll').addEventListener('click', rollCompanion);

    for (let f of ['enemy', 'companion']) {
        $('ne-' + f + '-form').addEventListener('submit', save);
        $('ne-' + f + '-delete').addEventListener('click', remove);
        $('ne-' + f + '-copy').addEventListener('click', () => {
            let src = editing;
            open(null, src);
            $('ne-' + f + '-name').select();
        });
    }

    // Échap : menu du jeu (sauf pendant la saisie ou dans une boîte de dialogue)
    document.addEventListener('keyup', (e) => {
        let typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
        if (e.key === 'Escape' && !typing && !document.querySelector('dialog[open]') && $('navBtn'))
            $('navBtn').click();
    });

    let tab = 'enemies';
    try { tab = localStorage.getItem('npc-editor-tab') === 'companions' ? 'companions' : 'enemies'; } catch (e) {}
    switchKind(tab);
})();
