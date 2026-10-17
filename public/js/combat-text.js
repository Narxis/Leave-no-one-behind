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
            return who + ' : touché (' + entry.dice + forced + ') — ' + entry.damage + ' dégâts'
                + (forMJ ? ' à appliquer' : '');
        }
    }
    return '';
}
