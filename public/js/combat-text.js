// Statut posé par une attaque qui touche (« + Saignement, 3 tours »)
function describeHitStatus(entry) {
    let s = entry.status;
    return s && s.name ? ' + ' + s.name + ' (' + s.turns + ' tour' + (s.turns > 1 ? 's' : '') + ')' : '';
}

// Texte du journal de combat, partagé entre l'écran de jeu et le menu MJ
function describeCombatEntry(entry, forMJ = false) {
    switch (entry.type) {
        case 'start': return 'Le combat commence !';
        case 'initiative': {
            let why = {joueurs: 'ils attaquent', adversaires: 'attaque surprise', moral: 'moral trop bas',
                hasard: 'pile ou face', manuel: 'ordre du MJ'}[entry.reason] || '';
            return (entry.first === 'joueurs' ? 'Les joueurs commencent' : 'Les adversaires commencent')
                + (why ? ' (' + why + ')' : '') + ' : ' + entry.order.join(', ');
        }
        case 'end': return 'Fin du combat';
        case 'hp': return 'PV de ' + entry.enemy + ' : ' + entry.hp;
        case 'target': return entry.player + ' doit lancer /roll Combat pour attaquer ' + entry.enemy;
        case 'loot':
            return entry.items.length ? 'Victoire ! Butin : ' + entry.items.join(', ') : 'Victoire ! Tous les ennemis sont vaincus';
        case 'target-cancel': return 'Attaque de ' + entry.player + ' sur ' + entry.enemy + ' annulée';
        case 'player-attack':
            entry = Object.assign({}, entry, {player: entry.player + (entry.npc ? ' (PNJ)' : '')});
            if (!entry.hit)
                return entry.player + ' rate ' + entry.enemy + ' (' + entry.result + ')';
            return entry.player + ' touche ' + entry.enemy + ' (' + entry.result + ') : -' + entry.damage + ' PV'
                + (entry.ko ? ' — K.O. !' : describeHitStatus(entry));
        case 'enemy-attack': {
            let who = entry.target ? entry.enemy + ' attaque ' + entry.target + (entry.npc_target ? ' (PNJ)' : '')
                : entry.enemy + ' attaque';
            // « imposé » : issue ou dégâts choisis par le MJ, visible par lui seul
            let forced = forMJ && entry.forced ? ', imposé' : '';
            if (!entry.hit)
                return who + ' : raté (' + entry.dice + forced + ')';
            // Avec une cible, les dégâts sont déjà retirés de ses PV
            return who + ' : touché (' + entry.dice + forced + ') — ' + entry.damage + ' dégâts'
                + (entry.target ? (entry.hp !== undefined ? ' (reste ' + entry.hp + ' PV)' : '') : (forMJ ? ' à appliquer' : ''))
                + describeHitStatus(entry);
        }
        case 'player-hp':
            return 'PV de ' + entry.target + ' : ' + entry.hp + (entry.change ? ' (' + (entry.change > 0 ? '+' : '') + entry.change + ')' : '');
        case 'reinforcement':
            return (entry.ally ? 'Renfort allié : ' : 'Renfort ennemi : ') + entry.name + ' rejoint le combat';
        case 'status-change': {
            let who = entry.target + (entry.npc_target ? ' (PNJ)' : '');
            return entry.turns > 0 ? who + ' : ' + entry.name + ' (' + entry.turns + ' tour' + (entry.turns > 1 ? 's' : '') + ')'
                : who + ' : plus de ' + entry.name.toLowerCase();
        }
        case 'turn': {
            let ticks = (entry.ticks || []).map(t => t.target + ' -' + t.damage + ' (' + t.name.toLowerCase() + ')' + (t.ko ? ' K.O. !' : ''));
            return 'Tour ' + entry.turn + (ticks.length ? ' — ' + ticks.join(', ') : '');
        }
    }
    return '';
}
