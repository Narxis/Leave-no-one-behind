// Généré par scripts/player-assets.js : ne pas modifier à la main
// Outils communs au plan du vaisseau (page de jeu et panneau MJ).
// Chaque salle du plan (partials/ship-rooms-svg) est un contour : son premier
// sous-chemin est le bord extérieur, les suivants sont le bord intérieur. En
// ne gardant que le premier, on obtient la salle pleine, qu'on peut colorier.
const ShipMap = (function () {
    const SVG_NS = 'http://www.w3.org/2000/svg';

    function outerPath(d) {
        let match = String(d || '').match(/^\s*[mM][^mM]*/);
        return match ? match[0] : d;
    }

    function svgEl(tag, attrs, parent) {
        let el = document.createElementNS(SVG_NS, tag);
        for (let k in attrs || {})
            el.setAttribute(k, attrs[k]);
        if (parent)
            parent.appendChild(el);
        return el;
    }

    // Calque dessiné au-dessus des salles (mais sous leurs noms), vidé à
    // chaque mise à jour
    function layer(svg, id) {
        let g = svg.querySelector('#' + id);
        if (!g) {
            g = svgEl('g', {id: id});
            svg.insertBefore(g, svg.querySelector('.ship-room-labels'));
        }
        g.innerHTML = '';
        return g;
    }

    // Masque le nom de la salle en alerte (le repère l'affiche déjà en grand)
    // et ceux qui tomberaient sous les cercles du repère
    function markAlertLabel(svg, roomId) {
        let room = roomId ? svg.querySelector('#' + CSS.escape(roomId)) : null;
        let box = room ? room.getBBox() : null;
        svg.querySelectorAll('.ship-room-label').forEach(t => {
            let hide = false;
            if (box) {
                let dx = parseFloat(t.getAttribute('x')) - (box.x + box.width / 2);
                let dy = parseFloat(t.getAttribute('y')) - (box.y + box.height / 2);
                hide = t.dataset.room === roomId || Math.hypot(dx, dy) < 50;
            }
            t.classList.toggle('is-alert', hide);
        });
    }

    // Salle pleine (forme extérieure de la salle)
    function roomFill(svg, roomId, cls, parent) {
        let room = svg.querySelector('#' + CSS.escape(roomId));
        if (!room)
            return null;
        return svgEl('path', {d: outerPath(room.getAttribute('d')), class: cls, 'data-room': roomId}, parent);
    }

    // Repère de l'alerte : cercles qui s'élargissent et nom de la salle
    function alertMarker(svg, roomId, label, parent) {
        let room = svg.querySelector('#' + CSS.escape(roomId));
        if (!room)
            return null;
        let box = room.getBBox();
        let cx = box.x + box.width / 2;
        let cy = box.y + box.height / 2;
        let g = svgEl('g', {class: 'ship-alert-marker'}, parent);
        for (let i = 0; i < 3; i++)
            svgEl('circle', {cx: cx, cy: cy, r: 18, class: 'ship-alert-ring ring' + i, style: 'transform-origin:' + cx + 'px ' + cy + 'px'}, g);
        svgEl('circle', {cx: cx, cy: cy, r: 7, class: 'ship-alert-dot'}, g);
        if (label) {
            // Le nom passe sous la salle, ou au-dessus si on est en bas du plan
            let below = cy < 470;
            let ty = below ? Math.min(box.y + box.height + 30, cy + 70) : Math.max(box.y - 14, cy - 60);
            let tx = Math.min(Math.max(cx, 90), 980);
            let text = svgEl('text', {x: tx, y: ty, class: 'ship-alert-label', 'text-anchor': 'middle'}, g);
            text.textContent = label;
        }
        return g;
    }

    return {outerPath, svgEl, layer, roomFill, alertMarker, markAlertLabel};
})();
