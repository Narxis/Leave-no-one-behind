// Onglets des alliés (PNJ) sous la carte, à côté de ceux des joueurs.
// Le MJ les crée et les modifie depuis son menu (src/controllers/allies.js) ;
// leurs jets s'affichent comme ceux des joueurs (événement « roll », id « npc<id> »)
(function () {
    const container = document.getElementById('playertabs_container');
    const tpl = document.getElementById('npc-tab-template');
    if (!container || !tpl)
        return;

    const STATS = ['combat', 'pilotage', 'engineering', 'survival', 'recon', 'moral'];
    const tabId = (ally) => 'player-tabnpc' + ally.id;
    let allies = [];

    function setAllyStat(ally, stat, value) {
        value = Math.min(Math.max(value, 0), 100);
        ally[stat] = value;
        wsLNOB.send({action: 'ally-update', data: {id: ally.id, field: stat, value: value}});
    }

    function createTab(ally) {
        let holder = document.createElement('template');
        holder.innerHTML = tpl.innerHTML.replaceAll('NPCID', 'npc' + ally.id).trim();
        let tab = holder.content.firstElementChild;
        tab.classList.add('npc-tab');
        tab.dataset.ally = ally.id;

        // Pas d'inventaire pour un PNJ
        tab.querySelector('.expander-item').remove();
        tab.querySelector('.expander').addEventListener('mouseup', () => tab.classList.toggle('move-up'));

        let badge = document.createElement('span');
        badge.className = 'npc-badge';
        badge.textContent = 'PNJ';
        badge.title = 'Personnage non joueur, contrôlé par le MJ';
        tab.querySelector('.player-name').prepend(badge);

        // Les boutons +/- du modèle visent un joueur Discord : on les remplace
        for (let stat of STATS) {
            tab.querySelectorAll('.' + stat + ' .mod-b').forEach(btn => {
                btn.removeAttribute('onclick');
                btn.addEventListener('click', (e) => {
                    let current = allies.find(a => a.id === ally.id);
                    if (!current)
                        return;
                    let step = (btn.classList.contains('player-stat-down') ? -1 : 1) * (e.shiftKey ? 10 : (e.ctrlKey ? 5 : 1));
                    setAllyStat(current, stat, current[stat] + step);
                    fill(tab, current);
                });
            });
        }

        container.append(tab);
        setTimeout(() => tab.classList.remove('load-in'), 50);
        return tab;
    }

    function fill(tab, ally) {
        let name = tab.querySelector('.player-name');
        name.querySelector('.player-name-text').textContent = ally.name;
        name.title = ally.name;
        let race = name.querySelector('.player-race');
        race.textContent = ally.race;
        race.style.display = ally.race ? '' : 'none';
        for (let stat of STATS)
            tab.querySelector('.' + stat + ' .player-stat-value').textContent = ally[stat];
        if (window.fitPlayerName)
            fitPlayerName(tab);
    }

    function render() {
        let ids = allies.map(tabId);
        container.querySelectorAll('.npc-tab').forEach(tab => {
            if (!ids.includes(tab.id))
                tab.remove();
        });
        for (let ally of allies)
            fill(document.getElementById(tabId(ally)) || createTab(ally), ally);
    }

    document.addEventListener('allies', (e) => {
        allies = e.detail.data.allies;
        render();
    });

    function load() {
        fetch('/api/allies').then(r => r.json()).then(list => {
            allies = list;
            render();
        }).catch(() => {});
    }
    load();
    document.addEventListener('ws-reconnect', load);
})();
