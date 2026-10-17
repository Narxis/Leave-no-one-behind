// Écran de jeu : la boutique ouverte par le MJ (src/controllers/merchant.js),
// par-dessus la carte. Les joueurs voient les objets, leurs prix en monnaie
// ou en cryopods et le stock ; le MJ achète et vend depuis son menu.
(function () {
    const area = document.getElementById('merchant-area');
    if (!area)
        return;
    const title = document.getElementById('merchant-name');
    const grid = document.getElementById('merchant-items');
    const news = document.getElementById('merchant-news');

    const el = (tag, cls, text) => {
        let e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    };

    let currency = {name: 'crédit', plural: 'crédits', short: 'cr', cryopodsPerCredit: 5};
    const label = (n) => n + ' ' + (Math.abs(n) >= 2 ? currency.plural : currency.name);

    function render(state) {
        title.textContent = state.name;
        grid.innerHTML = '';
        if (!state.stock.length)
            grid.append(el('p', 'merchant-empty', 'Le marchand n\'a rien à vendre pour l\'instant.'));
        for (let item of state.stock) {
            let card = el('div', 'merchant-item' + (item.qty === 0 ? ' sold-out' : ''));
            if (item.image) {
                let img = el('img', 'combat-loot-img');
                img.src = item.image;
                img.alt = '';
                card.append(img);
            }
            else
                card.append(el('span', 'combat-loot-img combat-loot-noimg', item.name.charAt(0)));
            card.append(el('span', 'combat-loot-name', item.name),
                el('span', 'merchant-price', item.price ? label(item.price) : 'Gratuit'));
            if (item.price)
                card.append(el('span', 'merchant-cryo', 'ou ' + Math.ceil(item.price * currency.cryopodsPerCredit) + ' cryopods'));
            if (item.qty !== null)
                card.append(el('span', 'merchant-stock', item.qty ? item.qty + ' en stock' : 'Épuisé'));
            grid.append(card);
        }
    }

    function show(open) {
        if (open === !area.classList.contains('combat-none'))
            return;
        if (open) {
            area.classList.remove('combat-none', 'combat-out');
            area.classList.add('combat-in');
        }
        else {
            area.classList.remove('combat-in');
            area.classList.add('combat-out');
            setTimeout(() => area.classList.add('combat-none'), 400);
        }
    }

    function say(text) {
        news.textContent = text;
        news.classList.remove('flash');
        void news.offsetWidth;
        news.classList.add('flash');
    }

    // Les cryopods payés au marchand quittent le compteur des humains
    function setHumans(value) {
        let counter = document.getElementById('cryopods-value');
        if (!counter)
            return;
        let delta = value - (parseInt(counter.innerText) || 0);
        counter.innerText = value;
        if (!delta)
            return;
        let pop = el('div', 'human-delta ' + (delta < 0 ? 'loss' : 'gain'), (delta > 0 ? '+' : '') + delta);
        counter.parentElement.append(pop);
        setTimeout(() => pop.remove(), 1800);
    }

    document.addEventListener('merchant', (e) => {
        let data = e.detail.data;
        currency = data.currency || currency;
        let ev = data.event || {};
        render(data.state);
        show(data.state.open);
        if (ev.type === 'open')
            news.textContent = '';
        if (ev.type === 'buy') {
            say(ev.who + ' achète ' + ev.item + (ev.count > 1 ? ' ×' + ev.count : '') + ' pour '
                + (ev.pay === 'cryopods' ? ev.paid + ' cryopods' : label(ev.paid)));
            if (ev.pay === 'cryopods' && ev.cryopods !== undefined)
                setHumans(ev.cryopods);
        }
        if (ev.type === 'sell')
            say(ev.who + ' vend ' + ev.item + (ev.count > 1 ? ' ×' + ev.count : '') + ' pour ' + label(ev.paid));
    });

    wsLNOB.send({action: 'merchant-state', data: {}});
})();
