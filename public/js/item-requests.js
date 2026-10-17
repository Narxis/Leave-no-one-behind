// Demandes d'objets des joueurs en ligne (src/controllers/itemUse.js) :
// petit panneau en bas à droite des pages du MJ, avec Accepter / Refuser.
// Accepté, l'objet quitte l'inventaire du joueur ; l'effet reste au MJ.
(function () {
    if (typeof wsLNOB === 'undefined')
        return;
    let box = document.createElement('aside');
    box.className = 'item-requests';
    box.hidden = true;
    box.setAttribute('aria-live', 'polite');
    document.addEventListener('DOMContentLoaded', () => document.body.append(box));

    const button = function (label, cls, onClick) {
        let b = document.createElement('button');
        b.type = 'button';
        b.className = cls;
        b.textContent = label;
        b.addEventListener('click', onClick);
        return b;
    };

    const render = function (requests) {
        box.hidden = !requests.length;
        let title = document.createElement('p');
        title.className = 'item-requests-title';
        title.textContent = 'Objets demandés';
        box.replaceChildren(title, ...requests.map(function (r) {
            let row = document.createElement('div');
            row.className = 'item-request';
            let text = document.createElement('p');
            text.textContent = r.playerName + ' veut utiliser ' + r.itemName;
            let actions = document.createElement('div');
            actions.className = 'item-request-actions';
            const reply = (ok) => wsLNOB.send({action: 'item-use-answer', data: {id: r.id, ok: ok}});
            actions.append(button('Accepter', 'accept', () => reply(true)), button('Refuser', 'refuse', () => reply(false)));
            row.append(text, actions);
            return row;
        }));
    };

    document.addEventListener('item-use', (e) => render((e.detail.data && e.detail.data.requests) || []));
    document.addEventListener('ws-reconnect', () => wsLNOB.send({action: 'item-use'}));
    wsLNOB.send({action: 'item-use'});
})();
