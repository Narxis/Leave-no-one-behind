// Tooltip with the stat name when hovering its icons, on all
// pages (player and NPC tabs, character sheet, legend). During combat
// (body.combat-mode, set by combat.js), the stats take their combat name.
(function () {
    const NAMES = {
        combat: ['Combat', 'Force'],
        pilotage: ['Pilotage', 'Dextérité'],
        engineering: ['Ingénierie', 'Intelligence'],
        survival: ['Survie', 'Constitution'],
        recon: ['Reconnaissance', 'Perception'],
        moral: ['Moral', 'Moral']
    };

    let tip = null;

    // The stat of an icon: class or id of the row (.player-stat), data-stat
    // attribute (legend), or "output-<stat>" id of the last roll icon
    function statOf(icon) {
        if (icon.classList.contains('output-roll-boite')) {
            let shown = icon.querySelector('.output-absolute:not(.hide-opacity)');
            let match = shown && /^output-(\w+)$/.exec(shown.id);
            return match && NAMES[match[1]] ? match[1] : null;
        }
        let row = icon.closest('[data-stat], .player-stat');
        if (!row)
            return null;
        let key = row.dataset.stat || row.id || [...row.classList].find(c => NAMES[c]);
        return NAMES[key] ? key : null;
    }

    function label(stat) {
        let [name, combatName] = NAMES[stat];
        if (document.body.classList.contains('combat-mode') && combatName !== name)
            return combatName + ' (' + name + ')';
        return name;
    }

    function show(icon) {
        let stat = statOf(icon);
        if (!stat)
            return hide();
        if (!tip) {
            tip = document.createElement('div');
            tip.className = 'stat-tooltip';
            tip.setAttribute('role', 'tooltip');
            document.body.append(tip);
        }
        tip.textContent = label(stat);
        let r = icon.getBoundingClientRect();
        tip.style.left = '0px';
        tip.classList.add('visible');
        let w = tip.offsetWidth;
        let left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
        let above = r.top - tip.offsetHeight - 8;
        tip.style.left = left + 'px';
        tip.style.top = (above > 4 ? above : r.bottom + 8) + 'px';
    }

    function hide() {
        if (tip)
            tip.classList.remove('visible');
    }

    document.addEventListener('mouseover', (e) => {
        // The last roll icons are stacked: read the visible one
        let icon = e.target.closest && (e.target.closest('.output-roll-boite') || e.target.closest('.player-stat-icon'));
        icon ? show(icon) : hide();
    });
    document.addEventListener('scroll', hide, true);
})();
