// Texte du journal de combat, partagé entre l'écran de jeu et le menu MJ
function describeCombatEntry(entry, forMJ = false) {
    switch (entry.type) {
        case 'start': return 'Le combat commence !';
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
                + (entry.ko ? ' — K.O. !' : '');
        case 'enemy-attack': {
            let who = entry.target ? entry.enemy + ' attaque ' + entry.target + (entry.npc_target ? ' (PNJ)' : '')
                : entry.enemy + ' attaque';
            // « imposé » : issue ou dégâts choisis par le MJ, visible par lui seul
            let forced = forMJ && entry.forced ? ', imposé' : '';
            if (!entry.hit)
                return who + ' : raté (' + entry.dice + forced + ')';
            // Avec une cible, les dégâts sont déjà retirés de ses PV
            return who + ' : touché (' + entry.dice + forced + ') — ' + entry.damage + ' dégâts'
                + (entry.target ? (entry.hp !== undefined ? ' (reste ' + entry.hp + ' PV)' : '') : (forMJ ? ' à appliquer' : ''));
        }
        case 'player-hp':
            return 'PV de ' + entry.target + ' : ' + entry.hp + (entry.change ? ' (' + (entry.change > 0 ? '+' : '') + entry.change + ')' : '');
        case 'reinforcement':
            return (entry.ally ? 'Renfort allié : ' : 'Renfort ennemi : ') + entry.name + ' rejoint le combat';
        case 'status':
            return entry.turns > 0 ? entry.enemy + ' : ' + entry.name + ' (' + entry.turns + ' tour' + (entry.turns > 1 ? 's' : '') + ')'
                : entry.enemy + ' : plus de ' + entry.name.toLowerCase();
        case 'turn': {
            let ticks = (entry.ticks || []).map(t => t.enemy + ' -' + t.damage + ' (' + t.name.toLowerCase() + ')' + (t.ko ? ' K.O. !' : ''));
            return 'Tour ' + entry.turn + (ticks.length ? ' — ' + ticks.join(', ') : '');
        }
    }
    return '';
}
