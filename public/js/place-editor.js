// Éditeur de lieux (/buildCard) : un lieu est un module Drawflow fait de
// cartes, de choix et de résultats reliés entre eux. Les données gardent le
// format d'origine (storage/cache/<lieu>_placesDat.json) ; seule l'interface change.
(function () {
    const MAX_CHOICES = 3;
    const PLACE_NAME = /^[a-z0-9_-]{1,40}$/i;
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

    // Contenu des blocs. Les champs df-* sont synchronisés par Drawflow avec node.data
    const TEMPLATES = {
        card: `
<div class="pe-node">
    <div class="pe-node-head"><i class="fas fa-money-check"></i><span>Carte <span class="pe-card-num"></span></span>
        <span class="pe-start-badge">Départ</span>
        <button type="button" class="pe-node-del" data-action="delete" title="Supprimer ce bloc">×</button></div>
    <label>Texte lu aux joueurs<textarea df-desc rows="4" placeholder="Ce que découvrent les joueurs…"></textarea></label>
    <label>Infos MJ <small>(visibles seulement par le MJ)</small><input type="text" df-mjreveal placeholder="facultatif"></label>
    <div class="pe-toggles">
        <button type="button" class="pe-toggle" data-toggle="timer" title="La carte affiche un compte à rebours"><i class="fas fa-stopwatch"></i> Chrono</button>
        <button type="button" class="pe-toggle" data-toggle="shuffle" title="L'ordre des choix est mélangé"><i class="fas fa-random"></i> Choix mélangés</button>
        <input type="hidden" df-timer><input type="hidden" df-shuffle>
    </div>
    <button type="button" class="pe-node-add" data-action="add-choice"><i class="fas fa-plus"></i> Ajouter un choix</button>
</div>`,
        choice: `
<div class="pe-node">
    <div class="pe-node-head"><i class="fas fa-sign-out-alt"></i><span>Choix</span>
        <button type="button" class="pe-node-del" data-action="delete" title="Supprimer ce bloc">×</button></div>
    <label>Texte du choix<textarea df-choice rows="2" placeholder="ex. Fouiller les caisses"></textarea></label>
    <label>Infos MJ <small>(facultatif)</small><input type="text" df-mjreveal></label>
    <div class="pe-node-adds">
        <button type="button" class="pe-node-add" data-action="add-next"><i class="fas fa-plus"></i> Carte suivante</button>
        <button type="button" class="pe-node-add" data-action="add-reveal"><i class="fas fa-plus"></i> Résultat</button>
    </div>
</div>`,
        reveal: `
<div class="pe-node">
    <div class="pe-node-head"><i class="fas fa-flag-checkered"></i><span>Résultat</span>
        <button type="button" class="pe-node-del" data-action="delete" title="Supprimer ce bloc">×</button></div>
    <label>Ce qui arrive<textarea df-reveal rows="3" placeholder="Fin de cette branche de l'histoire"></textarea></label>
</div>`
    };
    const PORTS = {card: [1, MAX_CHOICES], choice: [1, 1], reveal: [1, 0]};
    const LABELS = {card: 'Carte', choice: 'Choix', reveal: 'Résultat'};

    const $ = (id) => document.getElementById(id);
    const board = $('drawflow');
    const editor = new Drawflow(board);
    editor.reroute = true;
    editor.zoom_min = .15;
    editor.start();

    // Anciens blocs : même données, nouvelle présentation
    let data = PLACES_DATA && PLACES_DATA.drawflow ? PLACES_DATA : {drawflow: {}};
    for (let place in data.drawflow)
        for (let id in data.drawflow[place].data) {
            let node = data.drawflow[place].data[id];
            if (TEMPLATES[node.name])
                node.html = TEMPLATES[node.name];
        }
    // Module vide « Home » : Drawflow s'y replie quand il n'y a plus de lieu
    if (!data.drawflow.Home)
        data.drawflow.Home = {data: {}};
    let loading = true;
    editor.import(data);
    loading = false;

    const dirty = new Set();
    const places = () => Object.keys(editor.drawflow.drawflow).filter(n => n !== 'Home').sort((a, b) => a.localeCompare(b));
    const nodesOf = (place) => Object.values(editor.drawflow.drawflow[place] ? editor.drawflow.drawflow[place].data : {});
    const nodeEl = (id) => document.getElementById('node-' + id);
    const current = () => editor.module === 'Home' ? null : editor.module;

    /* ---------- Messages ---------- */

    let toastTimer = null;
    function toast(text, kind) {
        let t = $('pe-toast');
        t.textContent = text;
        t.className = 'pe-toast show' + (kind ? ' ' + kind : '');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
    }

    function confirmBox(title, text, okLabel) {
        let dialog = $('pe-confirm');
        $('pe-confirm-title').textContent = title;
        $('pe-confirm-text').textContent = text;
        $('pe-confirm-ok').textContent = okLabel;
        dialog.returnValue = '';
        dialog.showModal();
        return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), {once: true}));
    }

    /* ---------- État enregistré / modifié ---------- */

    function markDirty() {
        if (loading || !current())
            return;
        dirty.add(current());
        refresh();
    }

    function refreshStatus() {
        let status = $('pe-status');
        let n = dirty.size;
        status.textContent = n ? (n === 1 ? '1 lieu modifié, non enregistré' : n + ' lieux modifiés, non enregistrés') : 'Tout est enregistré';
        status.classList.toggle('is-dirty', n > 0);
        $('pe-save').classList.toggle('pulse', n > 0);
    }

    function renderPlaces() {
        let list = $('pe-places');
        list.innerHTML = '';
        for (let name of places()) {
            let cards = nodesOf(name).filter(n => n.name === 'card').length;
            let li = document.createElement('li');
            li.className = 'pe-place' + (name === current() ? ' selected' : '');
            li.innerHTML = '<button type="button" class="pe-place-open">'
                + '<span class="pe-place-name">' + esc(name) + '</span>'
                + '<span class="pe-place-count">' + cards + (cards > 1 ? ' cartes' : ' carte') + '</span>'
                + (dirty.has(name) ? '<span class="pe-dot" title="Modifications non enregistrées"></span>' : '')
                + '</button>'
                + '<button type="button" class="pe-place-del" title="Supprimer le lieu ' + esc(name) + '"><i class="fas fa-trash-alt"></i></button>';
            li.querySelector('.pe-place-open').addEventListener('click', () => selectPlace(name));
            li.querySelector('.pe-place-del').addEventListener('click', () => deletePlace(name));
            list.append(li);
        }
        if (!places().length)
            list.innerHTML = '<li class="pe-place-none">Aucun lieu pour l\'instant</li>';
        $('pe-current').textContent = current() ? '— ' + current() : '';
        $('pe-empty').hidden = !!current();
    }

    // Numéro de chaque carte d'un lieu, dans l'ordre de l'histoire : la carte de
    // départ est la n° 1, puis on suit les choix de haut en bas, étape par étape.
    // Il sert aussi de nom à l'export (« lieu-12 ») : plus de nom à inventer
    function cardNumbers(place) {
        let nodes = nodesOf(place);
        let byId = new Map(nodes.map(n => [String(n.id), n]));
        let cards = nodes.filter(n => n.name === 'card');
        let order = new Map();
        let queue = cards.filter(n => !n.inputs.input_1.connections.length);
        while (queue.length) {
            let card = queue.shift();
            if (order.has(card.id))
                continue;
            order.set(card.id, order.size + 1);
            for (let k = 1; k <= MAX_CHOICES; k++) {
                let link = card.outputs['output_' + k] && card.outputs['output_' + k].connections[0];
                let choice = link && byId.get(String(link.node));
                let next = choice && choice.outputs.output_1.connections[0];
                let target = next && byId.get(String(next.node));
                if (target && target.name === 'card' && !order.has(target.id))
                    queue.push(target);
            }
        }
        // Cartes isolées : à la suite, de haut en bas
        cards.filter(n => !order.has(n.id)).sort((a, b) => a.pos_y - b.pos_y || a.pos_x - b.pos_x)
            .forEach(n => order.set(n.id, order.size + 1));
        return order;
    }
    const cardLabel = (numbers, node) => 'carte n° ' + numbers.get(node.id);

    // Badge « Départ », numéros, boutons d'ajout grisés quand il n'y a plus de place, bascules
    function refreshNodes() {
        if (!current())
            return;
        let numbers = cardNumbers(current());
        for (let node of nodesOf(current())) {
            let el = nodeEl(node.id);
            if (!el)
                continue;
            if (node.name === 'card') {
                el.classList.toggle('is-start', !node.inputs.input_1.connections.length);
                let num = el.querySelector('.pe-card-num');
                if (num)
                    num.textContent = 'n° ' + numbers.get(node.id);
                let used = Object.values(node.outputs).filter(o => o.connections.length).length;
                let add = el.querySelector('[data-action="add-choice"]');
                if (add)
                    add.disabled = used >= MAX_CHOICES;
                el.querySelectorAll('.pe-toggle').forEach(btn => btn.setAttribute('aria-pressed', node.data[btn.dataset.toggle] === 'on'));
            }
            if (node.name === 'choice') {
                let taken = node.outputs.output_1.connections.length > 0;
                el.querySelectorAll('.pe-node-adds button').forEach(btn => btn.disabled = taken);
            }
        }
    }

    function refresh() {
        renderPlaces();
        refreshNodes();
        refreshStatus();
    }

    /* ---------- Plan : zoom et cadrage ---------- */

    function setView(cx, cy, z) {
        // Le plan est mis à l'échelle autour de son centre : on place (cx, cy) au milieu de l'écran
        let W = editor.precanvas.clientWidth, H = editor.precanvas.clientHeight;
        editor.zoom = editor.zoom_last_value = z;
        editor.canvas_x = -(cx - W / 2) * z;
        editor.canvas_y = -(cy - H / 2) * z;
        editor.precanvas.style.transform = 'translate(' + editor.canvas_x + 'px, ' + editor.canvas_y + 'px) scale(' + z + ')';
    }

    function fitView() {
        let nodes = current() ? nodesOf(current()) : [];
        if (!nodes.length)
            return setView(editor.precanvas.clientWidth / 2, editor.precanvas.clientHeight / 2, 1);
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let n of nodes) {
            let el = nodeEl(n.id);
            let w = el ? el.offsetWidth : 260, h = el ? el.offsetHeight : 200;
            x0 = Math.min(x0, n.pos_x); y0 = Math.min(y0, n.pos_y);
            x1 = Math.max(x1, n.pos_x + w); y1 = Math.max(y1, n.pos_y + h);
        }
        let W = editor.precanvas.clientWidth, H = editor.precanvas.clientHeight;
        let z = Math.max(editor.zoom_min, Math.min(1, (W - 80) / (x1 - x0), (H - 80) / (y1 - y0)));
        setView((x0 + x1) / 2, (y0 + y1) / 2, z);
    }

    function focusNode(id) {
        let node = editor.getNodeFromId(id), el = nodeEl(id);
        if (!node || !el)
            return;
        setView(node.pos_x + el.offsetWidth / 2, node.pos_y + el.offsetHeight / 2, Math.max(editor.zoom, .85));
        el.classList.remove('flash');
        void el.offsetWidth;
        el.classList.add('flash');
    }

    // Position sur le plan d'un point de l'écran
    function boardPoint(clientX, clientY) {
        let r = editor.precanvas.getBoundingClientRect();
        return {x: (clientX - r.x) / editor.zoom, y: (clientY - r.y) / editor.zoom};
    }

    // Rangement automatique : un arbre de gauche à droite depuis la carte de départ,
    // une colonne par étape, les branches les unes sous les autres
    function arrange() {
        let nodes = nodesOf(current());
        let byId = new Map(nodes.map(n => [String(n.id), n]));
        let children = (n) => Object.keys(n.outputs).sort().flatMap(k => n.outputs[k].connections.map(c => byId.get(String(c.node)))).filter(Boolean);
        let placed = new Set(), cursor = 0, depthX = [];
        const GAP_X = 90, GAP_Y = 30;
        let colX = (d) => depthX[d];
        // Largeur de chaque colonne = son bloc le plus large
        let widths = [];
        (function measure(list, d, seen) {
            for (let n of list) {
                if (seen.has(n.id))
                    continue;
                seen.add(n.id);
                widths[d] = Math.max(widths[d] || 0, boxOf(n).w);
                measure(children(n), d + 1, seen);
            }
        })(nodes.filter(n => !n.inputs.input_1.connections.length && n.name === 'card'), 0, new Set());
        let x = 0;
        widths.forEach((w, d) => { depthX[d] = x; x += w + GAP_X; });
        function place(n, d) {
            placed.add(n.id);
            let kids = children(n).filter(k => !placed.has(k.id));
            let h = boxOf(n).h, ys = [], start = cursor;
            for (let k of kids)
                if (!placed.has(k.id))
                    ys.push(place(k, d + 1));
            // Centré sur ses enfants, sans remonter au-dessus de sa branche ; la
            // branche suivante commence sous le bloc et sous tous ses enfants
            let y = ys.length ? Math.max(start, (ys[0] + ys[ys.length - 1]) / 2) : start;
            cursor = Math.max(cursor, y + h + GAP_Y);
            move(n, colX(d) || 0, y);
            return y;
        }
        for (let start of nodes.filter(n => !n.inputs.input_1.connections.length && n.name === 'card'))
            place(start, 0);
        // Blocs qui ne partent d'aucune carte de départ : rangés en dessous
        cursor += 120;
        let x0 = 0;
        for (let n of nodes.filter(n => !placed.has(n.id))) {
            move(n, x0, cursor);
            x0 += boxOf(n).w + GAP_X;
        }
        nodes.forEach(n => editor.updateConnectionNodes('node-' + n.id));
        markDirty();
        fitView();
    }

    function move(node, x, y) {
        node.pos_x = x;
        node.pos_y = y;
        let el = nodeEl(node.id);
        if (el) {
            el.style.left = x + 'px';
            el.style.top = y + 'px';
        }
    }

    $('pe-arrange').addEventListener('click', async () => {
        if (!current())
            return;
        let ok = await confirmBox('Ranger le lieu ?', 'Les blocs de « ' + current() + ' » seront replacés en arbre, de la carte de départ vers la droite. Recharge la page sans enregistrer pour annuler.', 'Ranger');
        if (ok)
            arrange();
    });

    $('pe-zoom-in').addEventListener('click', () => editor.zoom_in());
    $('pe-zoom-out').addEventListener('click', () => editor.zoom_out());
    $('pe-fit').addEventListener('click', fitView);

    /* ---------- Lieux ---------- */

    function selectPlace(name) {
        loading = true;
        editor.changeModule(name);
        loading = false;
        refresh();
        fitView();
    }

    $('pe-new-place').addEventListener('submit', (e) => {
        e.preventDefault();
        let input = $('pe-new-name'), error = $('pe-new-error');
        let name = input.value.trim().toLowerCase().replace(/\s+/g, '-');
        error.textContent = '';
        if (!PLACE_NAME.test(name) || name === 'home')
            return error.textContent = 'Lettres sans accent, chiffres, - et _ uniquement.';
        if (places().includes(name))
            return error.textContent = 'Ce lieu existe déjà.';
        editor.addModule(name);
        selectPlace(name);
        // Un lieu commence toujours par une carte de départ
        let id = addBlock('card', 120, 120);
        input.value = '';
        dirty.add(name);
        refresh();
        fitView();
        focusField(id);
        toast('Lieu « ' + name + ' » créé, avec sa carte de départ');
    });

    async function deletePlace(name) {
        let cards = nodesOf(name).filter(n => n.name === 'card').length;
        let ok = await confirmBox('Supprimer « ' + name + ' » ?',
            'Le lieu et ses ' + cards + ' carte(s) seront supprimés définitivement, y compris le fichier enregistré.', 'Supprimer le lieu');
        if (!ok)
            return;
        if (current() === name) {
            let other = places().find(p => p !== name);
            loading = true;
            editor.changeModule(other || 'Home');
            loading = false;
        }
        editor.removeModule(name);
        dirty.delete(name);
        try {
            let res = await fetch('/api/deletePlace', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: name})});
            let out = await res.json();
            if (out.success === false)
                throw new Error(out.error);
            toast('Lieu « ' + name + ' » supprimé');
        }
        catch (err) {
            toast('Le fichier du lieu n\'a pas pu être supprimé', 'error');
        }
        refresh();
        fitView();
    }

    /* ---------- Blocs ---------- */

    function addBlock(type, x, y, values) {
        if (!current()) {
            toast('Choisis ou crée d\'abord un lieu', 'error');
            return null;
        }
        let defaults = type === 'card' ? {desc: '', mjreveal: '', timer: 'off', shuffle: 'off'}
            : type === 'choice' ? {choice: '', mjreveal: ''} : {reveal: ''};
        let id = editor.addNode(type, PORTS[type][0], PORTS[type][1], x, y, type, Object.assign(defaults, values || {}), TEMPLATES[type]);
        refreshNodes();
        return id;
    }

    function focusField(id) {
        let el = id && nodeEl(id);
        let field = el && el.querySelector('textarea');
        if (field)
            setTimeout(() => field.focus(), 50);
    }

    // Taille d'un bloc à l'écran (estimée tant qu'il n'est pas encore dessiné)
    const SIZE = {card: [260, 340], choice: [230, 240], reveal: [230, 170]};
    function boxOf(node) {
        let el = nodeEl(node.id);
        return {x: node.pos_x, y: node.pos_y, w: el ? el.offsetWidth : SIZE[node.name][0], h: el ? el.offsetHeight : SIZE[node.name][1]};
    }

    // Première place libre en descendant depuis (x, y) : pas de bloc posé sur un autre
    function freeSpot(type, x, y) {
        let [w, h] = SIZE[type], boxes = nodesOf(current()).map(boxOf);
        for (let tries = 0; tries < 60; tries++) {
            let hit = boxes.find(b => x < b.x + b.w + 30 && x + w + 30 > b.x && y < b.y + b.h + 30 && y + h + 30 > b.y);
            if (!hit)
                break;
            y = hit.y + hit.h + 30;
        }
        return {x, y};
    }

    // Bloc relié à droite d'un autre (sortie output → entrée du nouveau)
    function addLinked(fromId, output, type, slot) {
        let from = editor.getNodeFromId(fromId), el = nodeEl(fromId);
        let spot = freeSpot(type, from.pos_x + (el ? el.offsetWidth : 260) + 90, from.pos_y + slot * 60);
        let id = addBlock(type, spot.x, spot.y);
        if (id == null)
            return;
        editor.addConnection(fromId, id, output, 'input_1');
        refreshNodes();
        focusField(id);
    }

    board.addEventListener('click', async (e) => {
        let btn = e.target.closest('[data-action], .pe-toggle');
        if (!btn || btn.disabled)
            return;
        let id = btn.closest('.drawflow-node').id.slice(5);
        let node = editor.getNodeFromId(id);
        if (btn.classList.contains('pe-toggle')) {
            // Bascule : la valeur passe par le champ caché, que Drawflow recopie dans node.data
            let field = btn.parentElement.querySelector('[df-' + btn.dataset.toggle + ']');
            field.value = node.data[btn.dataset.toggle] === 'on' ? 'off' : 'on';
            field.dispatchEvent(new Event('input', {bubbles: true}));
            refreshNodes();
            return;
        }
        switch (btn.dataset.action) {
            case 'delete': {
                let label = LABELS[node.name] || 'bloc';
                let ok = await confirmBox('Supprimer ce bloc ?', 'Le bloc « ' + label + ' » et ses liens seront supprimés.', 'Supprimer');
                if (ok)
                    editor.removeNodeId('node-' + id);
                break;
            }
            case 'add-choice': {
                let k = Object.keys(node.outputs).findIndex(key => !node.outputs[key].connections.length);
                if (k < 0)
                    return toast('Une carte a 3 choix au plus', 'error');
                addLinked(id, 'output_' + (k + 1), 'choice', k);
                break;
            }
            case 'add-next':
                addLinked(id, 'output_1', 'card', 0);
                break;
            case 'add-reveal':
                addLinked(id, 'output_1', 'reveal', 0);
                break;
        }
    });

    // Palette : clic = au centre de l'écran, glisser = où on lâche
    document.querySelectorAll('.pe-tool').forEach(tool => {
        tool.addEventListener('click', () => {
            let r = board.getBoundingClientRect();
            let p = boardPoint(r.x + r.width / 2, r.y + r.height / 2);
            let id = addBlock(tool.dataset.node, p.x - 130, p.y - 90);
            focusField(id);
        });
        tool.addEventListener('dragstart', (e) => e.dataTransfer.setData('node', tool.dataset.node));
    });
    board.addEventListener('dragover', (e) => e.preventDefault());
    board.addEventListener('drop', (e) => {
        e.preventDefault();
        let type = e.dataTransfer.getData('node');
        if (!TEMPLATES[type])
            return;
        let p = boardPoint(e.clientX, e.clientY);
        focusField(addBlock(type, p.x - 40, p.y - 20));
    });

    ['nodeCreated', 'nodeRemoved', 'connectionCreated', 'connectionRemoved', 'nodeMoved', 'nodeDataChanged']
        .forEach(ev => editor.on(ev, markDirty));
    ['connectionCreated', 'connectionRemoved', 'nodeRemoved'].forEach(ev => editor.on(ev, () => refreshNodes()));

    /* ---------- Vérification et export ---------- */

    // Problèmes d'un lieu : [{level: 'error'|'warn', place, id, text}]
    function check(place) {
        let problems = [];
        let add = (level, node, text) => problems.push({level, place, id: node ? node.id : null, text});
        let nodes = nodesOf(place);
        let cards = nodes.filter(n => n.name === 'card');
        if (!cards.length)
            add('error', null, 'Le lieu n\'a aucune carte.');
        let starts = cards.filter(n => !n.inputs.input_1.connections.length);
        if (cards.length && !starts.length)
            add('error', cards[0], 'Aucune carte de départ : une carte ne doit avoir aucun lien entrant.');
        let numbers = cardNumbers(place);
        if (starts.length > 1)
            starts.slice(1).forEach(n => add('error', n, 'Plusieurs cartes de départ : la ' + cardLabel(numbers, n) + ' n\'est reliée à rien.'));

        for (let n of cards) {
            if (!(n.data.desc || '').trim())
                add('warn', n, 'La ' + cardLabel(numbers, n) + ' n\'a pas de texte.');
            if (!Object.values(n.outputs).some(o => o.connections.length))
                add('warn', n, 'La ' + cardLabel(numbers, n) + ' ne propose aucun choix.');
        }
        for (let n of nodes.filter(n => n.name === 'choice')) {
            let label = (n.data.choice || '').trim();
            let short = label ? '« ' + (label.length > 40 ? label.slice(0, 40) + '…' : label) + ' »' : 'sans texte';
            if (!n.inputs.input_1.connections.length)
                add('error', n, 'Le choix ' + short + ' n\'est relié à aucune carte.');
            if (!n.outputs.output_1.connections.length)
                add('error', n, 'Le choix ' + short + ' n\'a pas de suite (carte suivante ou résultat).');
            if (!label)
                add('warn', n, 'Un choix n\'a pas de texte.');
        }
        for (let n of nodes.filter(n => n.name === 'reveal'))
            if (!n.inputs.input_1.connections.length)
                add('warn', n, 'Un résultat n\'est relié à aucun choix : il sera ignoré.');
        return problems;
    }

    function showProblems(problems, title) {
        let panel = $('pe-problems'), list = $('pe-problems-list');
        $('pe-problems-title').textContent = title;
        list.innerHTML = '';
        if (!problems.length)
            list.innerHTML = '<li class="pe-ok"><i class="fas fa-check-circle"></i> Aucun problème, le lieu est prêt à être exporté.</li>';
        for (let p of problems) {
            let li = document.createElement('li');
            li.className = 'pe-problem ' + p.level;
            li.innerHTML = '<i class="fas ' + (p.level === 'error' ? 'fa-times-circle' : 'fa-exclamation-triangle') + '"></i><span>' + esc(p.text) + '</span>';
            if (p.id != null) {
                li.tabIndex = 0;
                li.addEventListener('click', () => {
                    if (current() !== p.place)
                        selectPlace(p.place);
                    focusNode(p.id);
                });
            }
            list.append(li);
        }
        panel.hidden = false;
    }

    $('pe-problems-close').addEventListener('click', () => $('pe-problems').hidden = true);
    $('pe-check').addEventListener('click', () => {
        if (!current())
            return toast('Choisis d\'abord un lieu', 'error');
        let problems = check(current());
        let errors = problems.filter(p => p.level === 'error').length;
        showProblems(problems, errors ? errors + ' erreur(s) à corriger' : (problems.length ? 'Quelques points à revoir' : 'Tout est bon'));
    });

    // Même format que l'ancien export (section « place » de baseCards.json)
    function buildExport(place) {
        let nodes = nodesOf(place);
        let byId = (id) => nodes.find(n => String(n.id) === String(id));
        let numbers = cardNumbers(place);
        let nameOf = (card) => place + '-' + numbers.get(card.id);
        let cards = nodes.filter(n => n.name === 'card').sort((a, b) => numbers.get(a.id) - numbers.get(b.id));
        let out = [];
        for (let card of cards) {
            let entry = {};
            if (!card.inputs.input_1.connections.length)
                entry.start = true;
            entry.name = nameOf(card);
            entry.desc = card.data.desc || '';
            if ((card.data.mjreveal || '').trim())
                entry.mjreveal = card.data.mjreveal;
            entry.timer = card.data.timer === 'on';
            entry.shuffle = card.data.shuffle === 'on';
            let choices = [];
            for (let k = 1; k <= MAX_CHOICES; k++) {
                let link = card.outputs['output_' + k].connections[0];
                let choice = link && byId(link.node);
                if (!choice)
                    continue;
                let c = {value: choice.data.choice || ''};
                if ((choice.data.mjreveal || '').trim())
                    c.mjreveal = choice.data.mjreveal;
                let next = byId(choice.outputs.output_1.connections[0].node);
                if (next.name === 'reveal')
                    c.reveal = next.data.reveal || '';
                else
                    c.next = nameOf(next);
                choices.push(c);
            }
            entry.choices = choices;
            out.push(entry);
        }
        return out;
    }

    let exportName = '';
    $('pe-export').addEventListener('click', () => {
        if (!current())
            return toast('Choisis d\'abord un lieu', 'error');
        let problems = check(current());
        if (problems.some(p => p.level === 'error'))
            return showProblems(problems, 'Corrige ces erreurs avant d\'exporter');
        exportName = current() + '_placeCards.json';
        $('pe-export-title').textContent = 'Export du lieu « ' + current() + ' »';
        $('pe-export-text').value = JSON.stringify(buildExport(current()), null, 2);
        $('pe-export-dialog').showModal();
    });
    $('pe-export-copy').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText($('pe-export-text').value);
            toast('Cartes copiées dans le presse-papiers');
        }
        catch (err) {
            $('pe-export-text').select();
            toast('Copie impossible : le texte est sélectionné, fais Ctrl+C', 'error');
        }
    });
    $('pe-export-download').addEventListener('click', () => {
        let a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([$('pe-export-text').value], {type: 'application/json'}));
        a.download = exportName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    /* ---------- Enregistrement ---------- */

    async function save() {
        let targets = dirty.size ? [...dirty] : (current() ? [current()] : []);
        if (!targets.length)
            return;
        let all = editor.export().drawflow, failed = [];
        for (let name of targets) {
            if (!all[name])
                continue;
            try {
                let res = await fetch('/api/savePlaces', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({[name]: all[name]})});
                let out = await res.json();
                if (out.success === false)
                    throw new Error(out.error);
                dirty.delete(name);
            }
            catch (err) {
                failed.push(name);
            }
        }
        refresh();
        if (failed.length)
            toast('Échec de l\'enregistrement : ' + failed.join(', '), 'error');
        else
            toast(targets.length > 1 ? targets.length + ' lieux enregistrés' : 'Lieu « ' + targets[0] + ' » enregistré');
    }

    $('pe-save').addEventListener('click', save);
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            save();
        }
    });
    window.addEventListener('beforeunload', (e) => {
        if (dirty.size) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    /* ---------- Aide, boîtes de dialogue, menu Échap ---------- */

    $('pe-help-btn').addEventListener('click', () => $('pe-help').showModal());
    document.querySelectorAll('.pe-dialog').forEach(d => {
        d.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => d.close()));
        d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    });
    document.addEventListener('keyup', (e) => {
        let typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
        if (e.key === 'Escape' && !typing && !document.querySelector('dialog[open]')) {
            let nav = $('navBtn');
            if (nav)
                nav.click();
        }
    });

    /* ---------- Démarrage ---------- */

    let first = places()[0];
    if (first)
        selectPlace(first);
    else {
        editor.changeModule('Home');
        refresh();
    }
    if (!localStorageGet('pe-help-seen')) {
        $('pe-help').showModal();
        localStorageSet('pe-help-seen', '1');
    }

    function localStorageGet(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function localStorageSet(key, value) {
        try { localStorage.setItem(key, value); } catch (e) {}
    }
})();
