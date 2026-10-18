// Fenêtre de dés du menu MJ (dice-window.js) : les mêmes dés que les joueurs.
// Jet de stat pour un joueur ou un compagnon, par le même chemin que « Jet
// pour un joueur ou un compagnon » (action « roll », ou « ally-roll ») ;
// dés neutres cachés aux joueurs, ou montrés au salon du chat. « Derniers
// jets » suit aussi ceux des joueurs.
(function () {
    if (!window.DiceWindow || typeof wsLNOB === 'undefined')
        return;
    const STATS = [['combat', 'Combat'], ['pilotage', 'Pilotage'], ['engineering', 'Ingénierie'], ['survival', 'Survie'], ['recon', 'Reconnaissance']];
    const LABELS = Object.fromEntries(STATS);
    // Modules : ceux du jet pour un joueur, plus haut dans la page
    let moduleSelect = document.getElementById('mj-player-roll-module');
    const MODULES = moduleSelect ? Array.from(moduleSelect.options).map(o => [o.value, o.textContent])
        : [['', 'Sans module'], ['scanner', 'Scanners de surface'], ['proximity', 'Détecteurs de proximité'], ['motors', 'Moteurs'],
            ['oxygen', 'Module d\'oxygène'], ['energy', 'Électricité'], ['gravity', 'Gravité artificielle']];

    let names = {};
    let pending = null;     // jet de stat lancé ici : {target, stat}
    const dice = DiceWindow.create({
        storageKey: 'lnob-mj-dice',
        modules: MODULES,
        secretLabel: 'Caché aux joueurs',
        secretDefault: true,
        timeoutText: 'Pas de réponse du serveur : relance dans un instant.',
        onStat: function (stat, module, target) {
            pending = {target: String(target), stat: stat};
            if (String(target).startsWith('npc'))
                wsLNOB.send({action: 'ally-roll', data: {id: String(target).slice(3), stat: stat}});
            else
                wsLNOB.rollDice(target, stat, module);
        },
        onDice: (sides, count, secret) => wsLNOB.send({action: 'dice', data: {sides: sides, count: count, secret: secret}})
    });
    dice.setStats(STATS.map(([stat, label]) => ({stat: stat, label: label})), '');

    // Pour qui : joueurs puis compagnons
    const loadTargets = function () {
        let players = typeof getAllPlayers === 'function' ? getAllPlayers().catch(() => []) : Promise.resolve([]);
        let allies = fetch('/api/allies').then(r => r.json()).catch(() => []);
        Promise.all([players, allies]).then(([list, npcs]) => {
            let targets = (list || []).map(p => ({id: String(p.discord_id), name: p.name, group: 'Joueurs'}))
                .concat((npcs || []).map(a => ({id: 'npc' + a.id, name: a.name, group: 'Compagnons'})));
            names = Object.fromEntries(targets.map(t => [t.id, t.name]));
            dice.setTargets(targets);
        });
    };
    loadTargets();
    for (let type of ['join', 'set-name', 'allies', 'ws-reconnect'])
        document.addEventListener(type, loadTargets);

    // Jets de stats, d'ici ou des joueurs
    document.addEventListener('roll', function (e) {
        let d = e.detail && e.detail.data;
        if (!d || e.detail.error || d.result === undefined)
            return;
        let who = names[d.discord_id] || d.name || 'Joueur';
        let label = LABELS[d.stat] || d.stat;
        let tone = d.success ? 'ok' : 'fail';
        dice.log({who: who, what: label, total: d.result, tone: tone});
        if (pending && pending.target === String(d.discord_id) && pending.stat === d.stat) {
            pending = null;
            dice.result({title: who + ' · ' + label, total: d.result, tone: tone,
                detail: (d.dice ? 'dés ' + d.dice.join(' / ') + ', gardé ' : 'dé ') + d.dice_result + ' · ' + (d.success ? 'réussite' : 'échec')});
        }
    });

    // Jet lancé ici et refusé par le serveur (joueur plus dans la partie…)
    document.addEventListener('ws-error', function (e) {
        let action = e.detail && e.detail.action;
        if (action === 'roll' && pending) {
            pending = null;
            dice.fail('Jet impossible : ce joueur ou ce compagnon n\'est pas dans la partie.');
        }
        else if (action === 'dice' && dice.rolling())
            dice.fail('Jet impossible.');
    });

    // Dés neutres du MJ
    document.addEventListener('dice', function (e) {
        let r = e.detail.data;
        let what = r.count + 'D' + r.sides;
        dice.result({title: what + (r.secret ? ' · caché aux joueurs' : ' · montré au salon'), total: r.total, detail: r.count > 1 ? r.dice.join(' + ') : ''});
        dice.log({who: 'MJ', what: what + (r.secret ? ' · caché' : ''), total: r.total});
    });

    // Dés neutres des joueurs (messages du chat posés par le serveur)
    document.addEventListener('chat', function (e) {
        let m = e.detail.data && e.detail.data.message;
        if (m && m.dice && !m.from.gm)
            dice.log({who: m.from.name, what: m.dice.count + 'D' + m.dice.sides + (m.to ? ' · secret' : ''), total: m.dice.total});
    });
})();
