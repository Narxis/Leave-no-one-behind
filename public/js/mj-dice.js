// Dice window of the GM menu (dice-window.js): the same dice as the players.
// Stat roll for a player or companion, through the same path as "Jet
// pour un joueur ou un compagnon" ("roll" or "ally-roll" action);
// neutral dice hidden from the players, or shown in the chat room. "Derniers
// jets" also follows the players' rolls.
(function () {
    if (!window.DiceWindow || typeof wsLNOB === 'undefined')
        return;
    const STATS = [['combat', 'Combat'], ['pilotage', 'Pilotage'], ['engineering', 'Ingénierie'], ['survival', 'Survie'], ['recon', 'Reconnaissance']];
    const LABELS = Object.fromEntries(STATS);
    // Modules: those of the roll for a player, higher up in the page
    let moduleSelect = document.getElementById('mj-player-roll-module');
    const MODULES = moduleSelect ? Array.from(moduleSelect.options).map(o => [o.value, o.textContent])
        : [['', 'Sans module'], ['scanner', 'Scanners de surface'], ['proximity', 'Détecteurs de proximité'], ['motors', 'Moteurs'],
            ['oxygen', 'Module d\'oxygène'], ['energy', 'Électricité'], ['gravity', 'Gravité artificielle']];

    let names = {};
    let pending = null;     // stat roll made here: {target, stat}
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

    // For whom: players then companions
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

    // Stat rolls, from here or from the players
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

    // Roll made here and refused by the server (player no longer in the game…)
    document.addEventListener('ws-error', function (e) {
        let action = e.detail && e.detail.action;
        if (action === 'roll' && pending) {
            pending = null;
            dice.fail('Jet impossible : ce joueur ou ce compagnon n\'est pas dans la partie.');
        }
        else if (action === 'dice' && dice.rolling())
            dice.fail('Jet impossible.');
    });

    // GM's neutral dice
    document.addEventListener('dice', function (e) {
        let r = e.detail.data;
        let what = r.count + 'D' + r.sides;
        dice.result({title: what + (r.secret ? ' · caché aux joueurs' : ' · montré au salon'), total: r.total, detail: r.count > 1 ? r.dice.join(' + ') : ''});
        dice.log({who: 'MJ', what: what + (r.secret ? ' · caché' : ''), total: r.total});
    });

    // Players' neutral dice (chat messages set by the server)
    document.addEventListener('chat', function (e) {
        let m = e.detail.data && e.detail.data.message;
        if (m && m.dice && !m.from.gm)
            dice.log({who: m.from.name, what: m.dice.count + 'D' + m.dice.sides + (m.to ? ' · secret' : ''), total: m.dice.total});
    });
})();
