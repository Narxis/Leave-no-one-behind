// Inventaires sur la page de jeu : coffre de chaque joueur, objets du vaisseau
// et glisser-déposer du MJ. On attrape un objet (butin du combat gagné, coffre
// d'un joueur, liste du vaisseau) et on le lâche sur l'onglet d'un joueur ou
// sur la liste du vaisseau (src/controllers/inventory.js). Un objet en
// plusieurs exemplaires part un par un ; Maj enfoncée, toute la pile part
(function () {
    const DRAG_START = 6;   // px avant que l'appui devienne un glisser

    const el = (tag, cls, text) => {
        let e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    };

    function itemIcon(item) {
        if (item.image) {
            let img = el('img', 'item-image');
            img.src = item.image;
            img.alt = '';
            return img;
        }
        return el('span', 'item-image item-noimg', item.name.charAt(0));
    }

    // Monnaie : config/currency.json (envoyée avec les inventaires)
    let currency = {name: 'crédit', plural: 'crédits', image: '/img/monnaie.svg'};
    const moneyLabel = (n) => n + ' ' + (Math.abs(n) >= 2 ? currency.plural : currency.name);

    function moneyLine(cls, amount) {
        let line = el('div', cls);
        let p = el('p');
        p.append(itemIcon({name: currency.plural, image: currency.image}), document.createTextNode(moneyLabel(amount)));
        line.append(p);
        return line;
    }

    // Même rendu que partials/player-tabs.ejs, avec la bourse en tête
    function renderPlayer(discord_id, items, credits) {
        let list = document.getElementById('item' + discord_id);
        if (!list)
            return;
        list.innerHTML = '';
        if (credits !== undefined)
            list.append(moneyLine('itemlist-line itemlist-money', credits));
        for (let item of items) {
            let line = el('div', 'itemlist-line ' + item.slug);
            line.dataset.slug = item.slug;
            line.dataset.owner = discord_id;
            let p = el('p');
            p.append(itemIcon(item), document.createTextNode(item.name));
            if (item.count > 1) {
                p.append(document.createTextNode(' '), el('span', 'item-count', '×' + item.count));
                line.title = STACK_HINT(item.count);
            }
            let trash = el('i', 'far fa-trash-alt item-trash');
            if (typeof removeStarterItem === 'function')
                trash.addEventListener('click', () => removeStarterItem(discord_id, item.slug));
            line.append(p, trash);
            list.append(line);
        }
    }

    const STACK_HINT = (n) => 'Glisser : un exemplaire. Maj + glisser : les ' + n;

    // Même rendu que la liste .todos de template-card.ejs : une ligne par
    // objet, avec sa quantité
    function renderShip(items, credits) {
        let list = document.querySelector('.todos');
        if (!list)
            return;
        list.innerHTML = '';
        // Caisse de bord : pas une case à cocher, ni un objet à glisser
        if (credits !== undefined) {
            let li = el('li', 'ship-money');
            li.append(moneyLine('ship-money-line', credits));
            list.append(li);
        }
        items.forEach((item, n) => {
            let li = el('li', 'item-' + item.slug);
            li.dataset.slug = item.slug;
            let box = el('input');
            box.type = 'checkbox';
            box.id = 'todo_ship_' + n;
            let label = el('label');
            label.htmlFor = box.id;
            label.append(itemIcon(item), el('span', 'check'), el('p', '', item.name));
            if (item.count > 1) {
                label.append(el('span', 'item-count', '×' + item.count));
                li.title = STACK_HINT(item.count);
            }
            let trash = el('i', 'far fa-trash-alt delete');
            trash.dataset.slug = item.slug;
            trash.title = 'Retirer un exemplaire';
            li.append(box, label, trash);
            list.append(li);
        });
    }

    document.addEventListener('inventory', (e) => {
        let data = e.detail.data;
        let wallets = data.wallets || {players: {}};
        if (data.currency)
            currency = data.currency;
        document.querySelectorAll('.player-tab:not(.npc-tab) .itemlist').forEach(list => {
            let id = list.id.replace(/^item/, '');
            renderPlayer(id, data.inventories[id] || [], data.wallets ? wallets.players[id] || 0 : undefined);
        });
        renderShip(data.ship || [], data.wallets ? wallets.ship || 0 : undefined);
        let ev = data.event;
        if (ev && ev.to && ev.to.type === 'player')
            flash(document.getElementById('player-tab' + ev.to.id), '+ ' + (ev.item.count > 1 && !ev.item.money ? ev.item.count + ' ' : '') + ev.item.name);
    });

    document.addEventListener('inventory-error', (e) => {
        toast(e.detail.data.message);
    });

    // Atelier (menu MJ) : l'objet fabriqué, ou l'échec, est annoncé à l'écran
    document.addEventListener('craft', (e) => {
        let ev = e.detail.data.event;
        if (!ev || (ev.type !== 'craft' && ev.type !== 'craft-failed'))
            return;
        let what = (ev.qty > 1 ? ev.qty + ' × ' : '') + ev.name;
        toast(ev.type === 'craft' ? ev.who + ' fabrique ' + what : ev.who + ' rate la fabrication de ' + what, true);
    });

    // Petit texte qui s'envole de l'onglet du joueur qui reçoit l'objet
    function flash(tab, text) {
        if (!tab)
            return;
        let f = el('div', 'inventory-float', text);
        tab.append(f);
        tab.classList.remove('item-received');
        void tab.offsetWidth;
        tab.classList.add('item-received');
        setTimeout(() => { f.remove(); tab.classList.remove('item-received'); }, 1600);
    }

    function toast(text, info) {
        let t = el('div', 'inventory-toast' + (info ? ' is-info' : ''), text);
        document.body.append(t);
        setTimeout(() => t.remove(), 2600);
    }

    /* Glisser-déposer */

    // Ce qu'on attrape : {item: {slug, name}, from, node}
    function sourceOf(target) {
        let cardLoot = target.closest('.card-loot-item[data-index]');
        if (cardLoot)
            return {node: cardLoot, slug: cardLoot.dataset.slug || '', name: cardLoot.dataset.name,
                from: {type: 'card-loot', index: parseInt(cardLoot.dataset.index)}};
        let loot = target.closest('.combat-loot-item[data-index]');
        if (loot)
            return {node: loot, slug: loot.dataset.slug || '', name: loot.dataset.name,
                from: {type: 'loot', index: parseInt(loot.dataset.index)}};
        let line = target.closest('.player-tab:not(.npc-tab) .itemlist-line[data-slug]');
        if (line && !target.closest('.item-trash'))
            return {node: line, slug: line.dataset.slug, name: line.querySelector('p').textContent.replace(/\s×\d+$/, ''),
                from: {type: 'player', id: line.dataset.owner}};
        let li = target.closest('.todos li[data-slug]');
        if (li && !target.closest('.delete'))
            return {node: li, slug: li.dataset.slug, name: li.querySelector('p').textContent,
                from: {type: 'ship'}};
        return null;
    }

    // Où on le lâche : l'onglet d'un joueur (pas d'un PNJ) ou la liste du vaisseau
    function dropOf(x, y) {
        let under = document.elementFromPoint(x, y);
        if (!under)
            return null;
        let tab = under.closest('.player-tab:not(.npc-tab)');
        if (tab && tab.id.startsWith('player-tab'))
            return {node: tab, to: {type: 'player', id: tab.id.slice('player-tab'.length)}};
        let ship = under.closest('.todoList');
        if (ship)
            return {node: ship, to: {type: 'ship'}};
        return null;
    }

    let drag = null;

    function clearHover() {
        document.querySelectorAll('.inventory-drop').forEach(n => n.classList.remove('inventory-drop'));
    }

    document.addEventListener('pointerdown', (e) => {
        if (e.button !== 0)
            return;
        let src = sourceOf(e.target);
        if (!src)
            return;
        drag = Object.assign(src, {x: e.clientX, y: e.clientY, ghost: null, pointer: e.pointerId, all: e.shiftKey});
    });

    document.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.pointer)
            return;
        if (!drag.ghost) {
            if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_START)
                return;
            let ghost = el('div', 'inventory-ghost');
            let icon = drag.node.querySelector('img, .item-image, .combat-loot-img');
            if (icon)
                ghost.append(icon.cloneNode(true));
            ghost.append(el('span', '', drag.name));
            document.body.append(ghost);
            document.body.classList.add('inventory-dragging');
            drag.node.classList.add('inventory-source');
            drag.ghost = ghost;
        }
        e.preventDefault();
        drag.ghost.style.left = e.clientX + 'px';
        drag.ghost.style.top = e.clientY + 'px';
        clearHover();
        let drop = dropOf(e.clientX, e.clientY);
        if (drop && !sameInventory(drag.from, drop.to))
            drop.node.classList.add('inventory-drop');
    }, {passive: false});

    const sameInventory = (from, to) => from.type === to.type && String(from.id || '') === String(to.id || '');

    function endDrag(e, cancel) {
        if (!drag || e.pointerId !== drag.pointer)
            return;
        let d = drag;
        drag = null;
        clearHover();
        if (!d.ghost)
            return;
        d.ghost.remove();
        d.node.classList.remove('inventory-source');
        document.body.classList.remove('inventory-dragging');
        // Le relâchement ne doit pas ouvrir/fermer le coffre ni cocher la case
        let swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
        window.addEventListener('click', swallow, {capture: true, once: true});
        window.addEventListener('mouseup', swallow, {capture: true, once: true});
        setTimeout(() => {
            window.removeEventListener('click', swallow, {capture: true});
            window.removeEventListener('mouseup', swallow, {capture: true});
        }, 0);
        if (cancel)
            return;
        let drop = dropOf(e.clientX, e.clientY);
        if (!drop || sameInventory(d.from, drop.to))
            return;
        wsLNOB.send({action: 'inventory-move', data: {slug: d.slug, name: d.name, from: d.from, to: drop.to, all: d.all || e.shiftKey}});
    }

    // Pas de glisser natif du navigateur (image) : il annulerait le nôtre
    document.addEventListener('dragstart', (e) => {
        if (sourceOf(e.target))
            e.preventDefault();
    });

    document.addEventListener('pointerup', (e) => endDrag(e, false));
    document.addEventListener('pointercancel', (e) => endDrag(e, true));
})();
