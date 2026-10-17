// Butin d'une carte (src/controllers/cardLoot.js) : quand un choix rapporte des
// objets, ils s'affichent sur la carte comme le butin d'un combat gagné. Le MJ
// les glisse sur les joueurs (inventory.js) ou les range tous dans le vaisseau ;
// l'histoire ne continue qu'une fois le butin vide.
var CardLoot = (function () {
    const area = document.getElementById('card-loot-area');
    const box = document.getElementById('card-loot');
    const allBtn = document.getElementById('card-loot-all');
    let items = [];
    let waiting = null;     // résolution de collect() quand le butin est vide

    const el = (tag, cls, text) => {
        let e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    };

    // Même rendu que le butin de combat (combat.js), repéré « card-loot » pour le glisser
    function render(still, doneText) {
        box.innerHTML = '';
        box.classList.toggle('loot-still', still);
        box.append(el('div', 'combat-loot-title', 'Butin trouvé !'),
            el('div', 'combat-loot-sub', items.length ? 'Les joueurs ont mis la main sur ' + (items.length > 1 ? 'ces objets' : 'cet objet') : doneText));
        if (items.length)
            box.append(el('div', 'combat-loot-hint', 'Glissez un objet sur un joueur pour le lui donner, ou rangez tout dans le vaisseau'));
        let grid = el('div', 'combat-loot-items');
        items.forEach((item, i) => {
            let card = el('div', 'combat-loot-item card-loot-item');
            card.dataset.index = i;
            card.dataset.name = item.name;
            card.dataset.slug = item.slug || '';
            card.style.animationDelay = (300 + i * 180) + 'ms';
            if (item.image) {
                let img = el('img', 'combat-loot-img');
                img.src = item.image;
                img.alt = '';
                card.append(img);
            }
            else
                card.append(el('span', 'combat-loot-img combat-loot-noimg', item.name.charAt(0)));
            card.append(el('span', 'combat-loot-name', item.name));
            if (item.qty > 1)
                card.append(el('span', 'combat-loot-qty', '×' + item.qty));
            grid.append(card);
        });
        box.append(grid);
        allBtn.hidden = !items.length;
    }

    function open() {
        area.classList.remove('combat-none', 'combat-out');
        area.classList.add('combat-in');
    }

    function close() {
        area.classList.remove('combat-in');
        area.classList.add('combat-out');
        setTimeout(() => area.classList.add('combat-none'), 400);
    }

    document.addEventListener('card-loot', (e) => {
        let ev = e.detail.data.event || {};
        items = e.detail.data.state.items || [];
        if (ev.type === 'offer') {
            render(false);
            open();
        }
        else if (!area.classList.contains('combat-none'))
            render(true, ev.type === 'all-taken' ? 'Tout le butin a été rangé dans le vaisseau' : 'Tout le butin a été distribué');
        // Butin vide : on laisse lire le message, puis l'histoire reprend
        // (tout de suite si aucun objet n'était valable)
        if (!items.length && waiting) {
            let done = waiting;
            waiting = null;
            setTimeout(() => {
                close();
                done();
            }, ev.type === 'offer' ? 0 : 1400);
        }
    });

    allBtn.addEventListener('click', () => {
        allBtn.disabled = true;
        wsLNOB.send({action: 'card-loot-all', data: {}});
        setTimeout(() => allBtn.disabled = false, 1500);
    });

    // Affiche le butin d'un choix et attend qu'il soit entièrement distribué
    function collect(list) {
        if (!list || !list.length)
            return Promise.resolve();
        return new Promise(resolve => {
            waiting = resolve;
            wsLNOB.send({action: 'card-loot-offer', data: {items: list}});
        });
    }

    return {collect};
})();
