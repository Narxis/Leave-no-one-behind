// Menu MJ : atelier d'artisanat (src/controllers/craft.js, wiki regles/artisanat.md).
// Le MJ choisit l'artisan (un joueur ou le vaisseau), puis fabrique un objet
// d'une recette de l'éditeur d'objets, ou assemble librement des objets de
// son inventaire en un résultat de son choix. Le dé de réussite dépend du
// niveau de l'armurerie.
(function () {
    const root = document.getElementById('mj-craft');
    if (!root)
        return;
    const $ = (id) => document.getElementById(id);
    const PREFS_KEY = 'lnob-mj-craft';
    const MAX_INGREDIENTS = 8;

    const el = (tag, cls, text) => {
        let e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    };
    const icon = (item) => {
        if (item.image) {
            let img = el('img', 'mj-craft-img');
            img.src = item.image;
            img.alt = '';
            return img;
        }
        return el('span', 'mj-craft-img mj-craft-noimg', (item.name || '?').charAt(0));
    };
    const bounded = (v) => Math.min(Math.max(parseInt(v) || 1, 1), 99);

    let state = {recipes: [], items: {}, holdings: {ship: {}, players: {}}, players: [], armory: 0, armoryMax: 3, chance: 100, failLosesIngredients: true, combat: false, log: []};
    let prefs = {crafter: 'ship', roll: true};
    let free = [];          // assemblage libre : [{slug, qty}]

    try {
        Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'));
    } catch (e) {}
    const savePrefs = () => {
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {}
    };

    // 'ship' ou l'id discord d'un joueur
    const crafter = () => prefs.crafter === 'ship' ? {type: 'ship'} : {type: 'player', id: prefs.crafter};
    const owned = () => (prefs.crafter === 'ship' ? state.holdings.ship : state.holdings.players[prefs.crafter]) || {};
    const itemName = (slug) => (state.items[slug] || {}).name || slug;

    function toast(text, error) {
        let t = $('mj-craft-msg');
        t.textContent = text;
        t.classList.toggle('error', !!error);
        clearTimeout(toast.timer);
        toast.timer = setTimeout(() => t.textContent = '', 5000);
    }

    function renderCrafters() {
        let select = $('mj-craft-crafter');
        select.innerHTML = '';
        let ship = el('option', '', 'Vaisseau (stock commun)');
        ship.value = 'ship';
        select.append(ship);
        for (let p of state.players) {
            let o = el('option', '', p.name);
            o.value = p.id;
            select.append(o);
        }
        if (prefs.crafter !== 'ship' && !state.players.some(p => p.id === prefs.crafter))
            prefs.crafter = 'ship';
        select.value = prefs.crafter;
    }

    function renderArmory() {
        let select = $('mj-craft-armory');
        select.innerHTML = '';
        for (let level = 0; level <= state.armoryMax; level++) {
            let o = el('option', '', level ? 'Niveau ' + level : 'Pas améliorée');
            o.value = level;
            select.append(o);
        }
        select.value = state.armory;
        $('mj-craft-chance').textContent = 'Réussite : ' + state.chance + ' %';
        $('mj-craft-roll').checked = !!prefs.roll;
        $('mj-craft-fail').textContent = state.failLosesIngredients ? 'Un échec détruit les ingrédients.' : 'Un échec rend les ingrédients.';
        root.classList.toggle('is-combat', state.combat);
        $('mj-craft-state').textContent = state.combat ? 'Combat en cours : pas d\'artisanat' : 'Moment calme';
    }

    // Une recette : résultat, ingrédients (en rouge s'il en manque), bouton
    function renderRecipes() {
        let box = $('mj-craft-recipes');
        box.innerHTML = '';
        if (!state.recipes.length) {
            box.append(el('p', 'mj-craft-empty', 'Aucune recette : ajoutez-en une à un objet dans l\'éditeur d\'objets.'));
            return;
        }
        let have = owned();
        for (let recipe of state.recipes) {
            let row = el('div', 'mj-craft-recipe');
            let head = el('div', 'mj-craft-result');
            head.append(icon(recipe), el('span', 'mj-craft-name', recipe.name + (recipe.qty > 1 ? ' ×' + recipe.qty : '')));
            let ings = el('div', 'mj-craft-ings');
            let ready = true;
            for (let ing of recipe.ingredients) {
                let n = have[ing.slug] || 0;
                if (n < ing.qty)
                    ready = false;
                let chip = el('span', 'mj-craft-ing' + (n < ing.qty ? ' missing' : ''));
                chip.append(icon(ing), el('span', '', ing.qty + ' × ' + ing.name), el('small', '', '(' + n + ')'));
                chip.title = n + ' en inventaire, ' + ing.qty + ' nécessaire' + (ing.qty > 1 ? 's' : '');
                ings.append(chip);
            }
            let b = el('button', 'add-life mj-craft-make', 'Fabriquer');
            b.type = 'button';
            b.disabled = !ready || state.combat;
            b.title = ready ? '' : 'Il manque des ingrédients dans cet inventaire';
            b.addEventListener('click', () => wsLNOB.send({action: 'craft-make', data: {crafter: crafter(), slug: recipe.slug, roll: prefs.roll}}));
            row.append(head, ings, b);
            box.append(row);
        }
    }

    // Assemblage libre : ingrédients pris dans l'inventaire de l'artisan
    function renderFree() {
        let have = owned();
        free = free.filter(f => have[f.slug]);
        let select = $('mj-craft-free-item');
        select.innerHTML = '<option value="">Ingrédient…</option>';
        Object.keys(have).filter(slug => have[slug] > 0 && !free.some(f => f.slug === slug))
            .sort((a, b) => itemName(a).localeCompare(itemName(b)))
            .forEach(slug => {
                let o = el('option', '', itemName(slug) + ' (' + have[slug] + ')');
                o.value = slug;
                select.append(o);
            });
        let list = $('mj-craft-free-list');
        list.innerHTML = '';
        for (let f of free) {
            let chip = el('span', 'mj-craft-ing' + ((have[f.slug] || 0) < f.qty ? ' missing' : ''));
            chip.append(icon(Object.assign({slug: f.slug}, state.items[f.slug] || {name: f.slug})), el('span', '', f.qty + ' × ' + itemName(f.slug)));
            let x = el('button', 'mj-craft-remove', '×');
            x.type = 'button';
            x.title = 'Retirer';
            x.addEventListener('click', () => {
                free = free.filter(o => o !== f);
                renderFree();
            });
            chip.append(x);
            list.append(chip);
        }
        if (!free.length)
            list.append(el('span', 'mj-craft-empty', 'Aucun ingrédient choisi'));
        $('mj-craft-free-make').disabled = !free.length || state.combat;

        let names = $('mj-craft-results');
        names.innerHTML = '';
        Object.values(state.items).map(i => i.name).sort((a, b) => a.localeCompare(b)).forEach(name => {
            let o = el('option');
            o.value = name;
            names.append(o);
        });
    }

    function renderLog() {
        let box = $('mj-craft-log');
        box.innerHTML = '';
        if (!state.log.length) {
            box.append(el('span', 'mj-craft-empty', 'Rien de fabriqué pour l\'instant'));
            return;
        }
        for (let e of state.log.slice().reverse())
            box.append(el('div', 'mj-craft-log-line' + (e.type === 'craft-failed' ? ' failed' : ''), logText(e)));
    }

    function logText(e) {
        let dice = e.roll ? ' (dé : ' + e.roll + ' / ' + e.chance + ' %)' : '';
        let what = (e.qty > 1 ? e.qty + ' × ' : '') + e.name;
        if (e.type === 'craft-failed')
            return e.who + ' rate ' + what + dice + (e.lost ? ' : ingrédients perdus' : '');
        return e.who + ' fabrique ' + what + dice;
    }

    function render() {
        renderCrafters();
        renderArmory();
        renderRecipes();
        renderFree();
        renderLog();
    }

    function addFree() {
        let slug = $('mj-craft-free-item').value;
        if (!slug)
            return $('mj-craft-free-item').focus();
        if (free.length >= MAX_INGREDIENTS)
            return toast(MAX_INGREDIENTS + ' ingrédients au plus', true);
        free.push({slug: slug, qty: Math.min(bounded($('mj-craft-free-qty').value), owned()[slug] || 1)});
        $('mj-craft-free-qty').value = 1;
        renderFree();
    }

    function makeFree() {
        let name = $('mj-craft-result').value.trim();
        if (!name)
            return $('mj-craft-result').focus();
        let slug = Object.keys(state.items).find(s => state.items[s].name.toLowerCase() === name.toLowerCase());
        wsLNOB.send({action: 'craft-make', data: {
            crafter: crafter(), slug: slug || '', name: name, ingredients: free,
            qty: bounded($('mj-craft-result-qty').value), roll: prefs.roll
        }});
    }

    document.addEventListener('craft', (e) => {
        let data = e.detail.data;
        Object.assign(state, data);
        let ev = data.event;
        if (ev && (ev.type === 'craft' || ev.type === 'craft-failed')) {
            toast(logText(ev), ev.type === 'craft-failed');
            if (ev.free && ev.type === 'craft') {
                free = [];
                $('mj-craft-result').value = '';
                $('mj-craft-result-qty').value = 1;
            }
        }
        render();
    });
    document.addEventListener('craft-error', (e) => toast(e.detail.data.message, true));

    // Les inventaires changent aussi ailleurs (butin, marchand, glisser-déposer)
    document.addEventListener('inventory', (e) => {
        let data = e.detail.data;
        let holdings = {ship: {}, players: {}};
        for (let it of data.ship || [])
            holdings.ship[it.slug] = it.count;
        for (let id in data.inventories || {}) {
            holdings.players[id] = {};
            for (let it of data.inventories[id])
                holdings.players[id][it.slug] = it.count;
        }
        state.holdings = holdings;
        renderRecipes();
        renderFree();
    });
    // Début ou fin de combat : l'artisanat attend un moment calme
    document.addEventListener('combat', (e) => {
        let active = !!(e.detail.data && e.detail.data.state && e.detail.data.state.active);
        if (active !== state.combat) {
            state.combat = active;
            render();
        }
    });

    $('mj-craft-crafter').addEventListener('change', () => {
        prefs.crafter = $('mj-craft-crafter').value;
        savePrefs();
        free = [];
        renderRecipes();
        renderFree();
    });
    $('mj-craft-armory').addEventListener('change', () => wsLNOB.send({action: 'craft-armory', data: {level: parseInt($('mj-craft-armory').value) || 0}}));
    $('mj-craft-roll').addEventListener('change', () => {
        prefs.roll = $('mj-craft-roll').checked;
        savePrefs();
    });
    $('mj-craft-free-add').addEventListener('click', addFree);
    $('mj-craft-free-qty').addEventListener('keydown', (e) => { if (e.key === 'Enter') addFree(); });
    $('mj-craft-free-make').addEventListener('click', makeFree);
    $('mj-craft-result').addEventListener('keydown', (e) => { if (e.key === 'Enter') makeFree(); });

    wsLNOB.send({action: 'craft-state', data: {}});
    render();
})();
