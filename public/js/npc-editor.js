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
            pills = pill('PV ' + entry.hp, 'ne-pill-hp') + pill('Att ' + entry.offense, '', 'Attaque')
                + pill('Déf ' + entry.defense, '', 'Défense') + pill('Dégâts ' + (DAMAGE_LABEL[entry.damage] || entry.damage).toLowerCase(), 'ne-pill-' + entry.damage);
            if (entry.loot && entry.loot.length)
                pills += pill(entry.loot.length + (entry.loot.length > 1 ? ' objets' : ' objet'), 'ne-pill-loot', entry.loot.join(', '));
        }
        else {
            sub = entry.race ? '<span class="ne-card-sub">' + esc(entry.race) + '</span>' : '';
            pills = STATS.map(([key, label]) => pill(label.slice(0, 3) + ' ' + entry[key], '', label)).join('');
        }
        b.innerHTML = '<span class="ne-card-icon ne-icon-' + kind + '" aria-hidden="true">' + esc(entry.name.charAt(0).toUpperCase()) + '</span>'
            + '<span class="re-card-body"><span class="re-card-name">' + esc(entry.name) + sub + '</span>'
            + '<span class="re-card-mods">' + pills + '</span></span>';
        b.addEventListener('click', () => open(entry));
        return b;
    }

    function renderList() {
        let list = data[kind];
        let q = $('ne-search').value.trim().toLowerCase();
        let shown = q ? list.filter(e => (e.name + ' ' + (e.race || '')).toLowerCase().includes(q)) : list;
        let box = $('ne-list');
        box.innerHTML = '';
        if (!list.length)
            box.innerHTML = '<p class="re-empty">Aucun ' + KINDS[kind].one + ' pour l\'instant. Clique sur « ' + KINDS[kind].new + ' » pour en créer un.</p>';
        else if (!shown.length)
            box.innerHTML = '<p class="re-empty">Aucune fiche ne correspond à « ' + esc(q) + ' ».</p>';
        shown.forEach(e => box.append(card(e)));
        $('ne-count').textContent = list.length + ' / ' + KINDS[kind].max + (kind === 'enemies' ? ' ennemis' : ' compagnons');
        $('ne-new').disabled = list.length >= KINDS[kind].max;
        $('ne-intro').textContent = KINDS[kind].intro;
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
