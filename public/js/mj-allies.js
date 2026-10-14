// Alliés (PNJ) côté MJ : création depuis l'onglet « Compagnons », modification
// du nom, du rôle et des stats. L'état fait foi côté serveur
// (src/controllers/allies.js) et revient par l'événement « allies ».
(function () {
    const list = document.getElementById('mj-allies');
    const search = document.getElementById('search-ally');
    const STATS = {
        combat: 'Combat',
        pilotage: 'Pilotage',
        engineering: 'Ingénierie',
        survival: 'Survie',
        recon: 'Reconnaissance',
        moral: 'Moral'
    };

    let allies = [];

    const el = (tag, cls, text) => {
        let e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    };

    const send = (action, data) => wsLNOB.send({action: action, data: data});

    // Champ envoyé au serveur à chaque modification validée
    function field(ally, name, type, cls) {
        let input = el('input', cls);
        input.type = type;
        input.dataset.field = name;
        if (type === 'number') {
            input.min = 0;
            input.max = 100;
            input.inputMode = 'numeric';
        }
        else
            input.maxLength = name === 'name' ? 40 : 30;
        input.value = ally[name];
        input.addEventListener('change', () => send('ally-update', {id: ally.id, field: name, value: input.value}));
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
        return input;
    }

    function allyRow(ally) {
        let row = el('div', 'mj-ally');
        row.dataset.id = ally.id;

        let head = el('div', 'mj-ally-head');
        let name = field(ally, 'name', 'text', 'mj-ally-name');
        name.title = 'Nom';
        let race = field(ally, 'race', 'text', 'mj-ally-race');
        race.placeholder = 'Rôle / race';
        let remove = el('button', 'mj-enemy-remove', '×');
        remove.type = 'button';
        remove.title = 'Retirer ' + ally.name;
        remove.addEventListener('click', () => send('ally-remove', {id: ally.id}));
        head.append(el('span', 'mj-ally-badge', 'PNJ'), name, race, remove);

        let stats = el('div', 'mj-ally-stats');
        for (let stat in STATS) {
            let cell = el('label', 'mj-ally-stat');
            cell.append(el('span', 'mj-ally-stat-label', STATS[stat]), field(ally, stat, 'number', 'mj-ally-stat-input'));
            stats.append(cell);
        }
        row.append(head, stats);
        return row;
    }

    function render() {
        let rows = [...list.querySelectorAll('.mj-ally')];
        let sameIds = rows.length === allies.length && rows.every((r, i) => +r.dataset.id === allies[i].id);
        if (!sameIds) {
            list.innerHTML = '';
            if (!allies.length)
                list.append(el('div', 'mj-enemies-empty', 'Ajoutez des compagnons avec « + » : ils apparaissent sous la carte'));
            allies.forEach(a => list.append(allyRow(a)));
            return;
        }
        // Même liste : on met juste les valeurs à jour, sans toucher au champ en cours d'édition
        allies.forEach((ally, i) => rows[i].querySelectorAll('input').forEach(input => {
            if (input !== document.activeElement)
                input.value = ally[input.dataset.field];
        }));
    }

    function addAlly() {
        let name = search.value.trim();
        if (!name)
            return;
        send('ally-add', {name: name});
        search.value = '';
    }

    // Onglets Adversaires / Compagnons : suit la case cochée, quelle que soit
    // la façon de la cocher (clic, toucher, clavier)
    function showTab() {
        let allyTab = document.getElementById('life-2').checked;
        document.querySelector('.ennemy').classList.toggle('hide', allyTab);
        document.querySelector('.ally').classList.toggle('hide', !allyTab);
        document.getElementById('mj-enemies').classList.toggle('hide', allyTab);
        list.classList.toggle('hide', !allyTab);
    }
    document.querySelectorAll('input[name="life"]').forEach(r => r.addEventListener('change', showTab));
    document.querySelectorAll('.life-type1, .life-type2').forEach(t => t.addEventListener('mouseup', () => setTimeout(showTab, 0)));

    document.getElementById('add-friend').addEventListener('click', addAlly);
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') addAlly(); });
    // « x » : retire tous les compagnons, après confirmation
    document.getElementById('friend-list').addEventListener('click', () => {
        if (allies.length && confirm('Retirer tous les compagnons ?'))
            allies.forEach(a => send('ally-remove', {id: a.id}));
    });

    document.addEventListener('allies', (e) => {
        allies = e.detail.data.allies;
        render();
    });

    function load() {
        fetch('/api/allies').then(r => r.json()).then(list => {
            allies = list;
            render();
        }).catch(render);
    }
    load();
    document.addEventListener('ws-reconnect', load);
})();
