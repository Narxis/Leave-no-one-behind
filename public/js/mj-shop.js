// Menu MJ : marchand et bourses (src/controllers/merchant.js).
// Le MJ prépare l'étal (objets, prix, stock), l'ouvre sur l'écran de jeu,
// puis achète et vend pour les joueurs ou le vaisseau. L'étal en préparation
// est gardé dans le navigateur d'une séance à l'autre.
(function () {
    const root = document.getElementById('mj-shop');
    if (!root)
        return;
    const $ = (id) => document.getElementById(id);
    const DRAFT_KEY = 'lnob-mj-shop';
    const MAX_STOCK = 30;

    const el = (tag, cls, text) => {
        let e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    };
    const button = (cls, text, onClick, title) => {
        let b = el('button', cls, text);
        b.type = 'button';
        if (title) b.title = title;
        b.addEventListener('click', onClick);
        return b;
    };
    const icon = (item) => {
        if (item.image) {
            let img = el('img', 'mj-shop-img');
            img.src = item.image;
            img.alt = '';
            return img;
        }
        return el('span', 'mj-shop-img mj-shop-noimg', item.name.charAt(0));
    };

    let catalog = [];       // objets de l'éditeur, avec leur prix
    let currency = {name: 'crédit', plural: 'crédits', short: 'cr', cryopodsPerCredit: 5, sellRatio: .5};
    let state = {open: false, name: '', stock: [], log: []};
    let wallets = {players: {}, ship: 0};
    let cryopods = 0;
    let players = [];
    let inventories = {};
    let shipItems = [];
    let draft = {name: '', stock: []};

    const label = (n) => n + ' ' + (Math.abs(n) >= 2 ? currency.plural : currency.name);
    const cryo = (credits) => Math.ceil(credits * currency.cryopodsPerCredit);
    const known = (entry) => catalog.find(i => (entry.slug && i.slug === entry.slug) || i.name.toLowerCase() === String(entry.name || '').toLowerCase());
    const toInt = (v, def) => Number.isFinite(parseInt(v)) ? parseInt(v) : def;

    try {
        let saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
        if (saved && Array.isArray(saved.stock))
            draft = saved;
    } catch (e) {}
    const saveDraft = () => {
        try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (e) {}
    };

    // Ouverte, la boutique suit l'état du serveur ; fermée, l'étal en préparation
    const stock = () => state.open ? state.stock : draft.stock;

    function toast(text, error) {
        let t = $('mj-shop-msg');
        t.textContent = text;
        t.classList.toggle('error', !!error);
        clearTimeout(toast.timer);
        toast.timer = setTimeout(() => t.textContent = '', 4000);
    }

    // Une modification de l'étal ouvert part tout de suite à l'écran de jeu.
    // Un prix ou un stock modifié ne redessine pas l'étal : le champ où l'on
    // vient de cliquer resterait sinon sans effet
    function pushStock(list, redraw = true) {
        draft.stock = list.map(e => ({slug: e.slug, name: e.name, price: e.price, qty: e.qty}));
        saveDraft();
        if (state.open)
            wsLNOB.send({action: 'merchant-open', data: {name: $('mj-shop-name').value, stock: draft.stock}});
        else if (redraw)
            renderStock();
    }

    function target(value) {
        return value === 'ship' ? {type: 'ship'} : {type: 'player', id: value};
    }

    function fillTargets(select, withShip) {
        let current = select.value;
        select.innerHTML = '';
        for (let p of players) {
            let o = el('option', '', p.name);
            o.value = p.id;
            select.append(o);
        }
        if (withShip) {
            let o = el('option', '', 'Vaisseau (caisse de bord)');
            o.value = 'ship';
            select.append(o);
        }
        if ([...select.options].some(o => o.value === current))
            select.value = current;
    }

    /* ---------- Étal ---------- */

    function renderStock() {
        let box = $('mj-shop-stock');
        if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT')
            return;
        box.innerHTML = '';
        let list = stock();
        if (!list.length)
            box.append(el('p', 'mj-shop-empty', 'Étal vide : ajoutez des objets ci-dessous.'));
        list.forEach((entry, i) => {
            let row = el('div', 'mj-shop-row');
            let item = known(entry) || {};
            let name = el('span', 'mj-shop-name');
            name.append(icon({image: entry.image || item.image, name: entry.name}), el('span', '', entry.name));
            let price = el('input', 'mj-shop-input');
            price.type = 'number';
            price.min = 0;
            price.value = entry.price;
            price.title = 'Prix en ' + currency.plural;
            let cryoText = el('small', 'mj-shop-cryo', '≈ ' + cryo(entry.price) + ' cryo.');
            price.addEventListener('input', () => cryoText.textContent = '≈ ' + cryo(toInt(price.value, 0)) + ' cryo.');
            // stock() et non list : l'étal a pu changer depuis ce dessin
            price.addEventListener('change', () => pushStock(stock().map((e, j) => j === i ? Object.assign({}, e, {price: Math.max(toInt(price.value, 0), 0)}) : e), false));
            let qty = el('input', 'mj-shop-input mj-shop-qty');
            qty.type = 'number';
            qty.min = 0;
            qty.placeholder = '∞';
            qty.value = entry.qty === null || entry.qty === undefined ? '' : entry.qty;
            qty.title = 'Stock (vide : sans limite)';
            qty.addEventListener('change', () => pushStock(stock().map((e, j) => j === i ? Object.assign({}, e, {qty: qty.value === '' ? null : Math.max(toInt(qty.value, 0), 0)}) : e), false));
            let buy = button('add-life mj-shop-buy', 'Acheter', () => {
                wsLNOB.send({action: 'merchant-buy', data: {index: i, slug: entry.slug, buyer: target($('mj-shop-buyer').value), pay: $('mj-shop-pay').value, count: 1}});
            }, 'Achat d\'un exemplaire pour l\'acheteur choisi');
            buy.disabled = !state.open || entry.qty === 0;
            let remove = button('mj-shop-remove', '×', () => pushStock(stock().filter((_, j) => j !== i)), 'Retirer de l\'étal');
            row.append(name, price, cryoText, qty, buy, remove);
            box.append(row);
        });
        $('mj-shop-add-box').hidden = list.length >= MAX_STOCK;
    }

    function addToStock() {
        let input = $('mj-shop-item');
        let name = input.value.trim();
        if (!name)
            return input.focus();
        let item = known({name: name});
        let list = stock().slice();
        if (list.some(e => e.name.toLowerCase() === (item ? item.name : name).toLowerCase()))
            return toast('Déjà dans l\'étal', true);
        list.push({slug: item ? item.slug : '', name: item ? item.name : name, image: item ? item.image : '', price: item ? item.price : 0, qty: null});
        input.value = '';
        pushStock(list);
        input.focus();
    }

    // Tous les objets qui ont un prix dans l'éditeur
    function fillFromCatalog() {
        let list = stock().slice();
        for (let item of catalog)
            if (item.price > 0 && list.length < MAX_STOCK && !list.some(e => e.slug === item.slug))
                list.push({slug: item.slug, name: item.name, image: item.image, price: item.price, qty: null});
        pushStock(list);
    }

    /* ---------- Bourses ---------- */

    function renderWallets() {
        let box = $('mj-shop-wallets');
        if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT')
            return;
        box.innerHTML = '';
        let rows = players.map(p => [p.name, wallets.players[p.id] || 0, {type: 'player', id: p.id}])
            .concat([['Caisse de bord', wallets.ship || 0, {type: 'ship'}]]);
        for (let [name, amount, who] of rows) {
            let row = el('div', 'mj-shop-wallet');
            let input = el('input', 'mj-shop-input');
            input.placeholder = '+10 / -5';
            input.title = 'Ajouter (+) ou retirer (-) des ' + currency.plural;
            const apply = () => {
                let n = toInt(String(input.value).replace(/\s/g, ''), 0);
                if (!n)
                    return;
                input.value = '';
                input.blur();
                wsLNOB.send({action: 'money-add', data: {target: who, amount: n}});
            };
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
            row.append(el('span', 'mj-shop-wallet-name', name), el('b', 'mj-shop-wallet-amount', label(amount)), input, button('add-life', 'OK', apply));
            box.append(row);
        }
        $('mj-shop-cryopods').textContent = cryopods + ' cryopods à bord';
    }

    /* ---------- Vente ---------- */

    function renderSell() {
        let box = $('mj-shop-sell');
        if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT')
            return;
        box.innerHTML = '';
        let who = $('mj-shop-seller').value;
        let items = who === 'ship' ? shipItems : (inventories[who] || []);
        if (!items.length)
            box.append(el('p', 'mj-shop-empty', 'Rien à vendre.'));
        for (let item of items) {
            let row = el('div', 'mj-shop-row');
            let name = el('span', 'mj-shop-name');
            name.append(icon(item), el('span', '', item.name + (item.count > 1 ? ' ×' + item.count : '')));
            let ref = known(item);
            let price = el('input', 'mj-shop-input');
            price.type = 'number';
            price.min = 0;
            price.value = ref ? Math.floor(ref.price * currency.sellRatio) : 0;
            price.title = 'Prix de rachat, à l\'unité';
            let sell = button('add-life mj-shop-buy', 'Vendre', () => {
                wsLNOB.send({action: 'merchant-sell', data: {slug: item.slug, seller: target(who), count: 1, price: Math.max(toInt(price.value, 0), 0)}});
            }, 'Vend un exemplaire au marchand');
            sell.disabled = !state.open;
            row.append(name, price, el('small', 'mj-shop-cryo', currency.short + ' / u.'), sell);
            box.append(row);
        }
    }

    /* ---------- Journal et état ---------- */

    function logText(entry) {
        if (entry.type === 'buy')
            return entry.who + ' achète ' + entry.item + (entry.count > 1 ? ' ×' + entry.count : '') + ' pour '
                + (entry.pay === 'cryopods' ? entry.paid + ' cryopods' : label(entry.paid));
        if (entry.type === 'sell')
            return entry.who + ' vend ' + entry.item + (entry.count > 1 ? ' ×' + entry.count : '') + ' pour ' + label(entry.paid);
        return '';
    }

    function render() {
        root.classList.toggle('is-open', state.open);
        $('mj-shop-state').textContent = state.open ? 'Boutique ouverte sur l\'écran de jeu' : 'Boutique fermée';
        $('mj-shop-open').textContent = state.open ? 'Mettre à jour' : 'Ouvrir la boutique';
        $('mj-shop-close').disabled = !state.open;
        if (state.open && document.activeElement !== $('mj-shop-name'))
            $('mj-shop-name').value = state.name;
        fillTargets($('mj-shop-buyer'), true);
        fillTargets($('mj-shop-seller'), true);
        renderStock();
        renderWallets();
        renderSell();
        let log = $('mj-shop-log');
        log.innerHTML = '';
        for (let entry of state.log.slice().reverse())
            log.append(el('div', 'mj-shop-log-line ' + entry.type, logText(entry)));
    }

    document.addEventListener('merchant', (e) => {
        let data = e.detail.data;
        state = data.state;
        wallets = data.wallets;
        cryopods = data.cryopods;
        players = data.players || [];
        currency = data.currency || currency;
        if (state.open) {
            draft.stock = state.stock.map(s => ({slug: s.slug, name: s.name, price: s.price, qty: s.qty}));
            saveDraft();
        }
        render();
        let ev = data.event;
        if (ev && (ev.type === 'buy' || ev.type === 'sell'))
            toast(logText(ev));
    });

    document.addEventListener('merchant-error', (e) => toast(e.detail.data.message, true));

    document.addEventListener('inventory', (e) => {
        let data = e.detail.data;
        inventories = data.inventories || {};
        shipItems = data.ship || [];
        if (data.wallets)
            wallets = data.wallets;
        if (data.currency)
            currency = data.currency;
        renderWallets();
        renderSell();
    });

    $('mj-shop-add').addEventListener('click', addToStock);
    $('mj-shop-item').addEventListener('keydown', (e) => { if (e.key === 'Enter') addToStock(); });
    $('mj-shop-fill').addEventListener('click', fillFromCatalog);
    $('mj-shop-name').addEventListener('change', () => {
        draft.name = $('mj-shop-name').value;
        saveDraft();
    });
    $('mj-shop-seller').addEventListener('change', renderSell);
    $('mj-shop-open').addEventListener('click', () => {
        draft.name = $('mj-shop-name').value;
        saveDraft();
        wsLNOB.send({action: 'merchant-open', data: {name: draft.name, stock: draft.stock}});
    });
    $('mj-shop-close').addEventListener('click', () => wsLNOB.send({action: 'merchant-close', data: {}}));

    $('mj-shop-name').value = draft.name || '';
    fetch('/api/items/catalog').then(r => r.json()).then(data => {
        catalog = data.items || [];
        currency = data.currency || currency;
        let list = $('mj-shop-items');
        list.innerHTML = '';
        for (let item of catalog) {
            let o = el('option');
            o.value = item.name;
            o.textContent = item.price ? label(item.price) : 'pas de prix';
            list.append(o);
        }
        render();
    });
    wsLNOB.send({action: 'merchant-state', data: {}});
    render();
})();
