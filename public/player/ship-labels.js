// Plan du vaisseau de la page joueur : contour du vaisseau et noms des salles.
// Sur un petit écran, le plan est réduit et les noms deviennent minuscules :
// on les grossit jusqu'à une taille lisible quand la salle a la place. Les
// noms qui restent trop petits ou qui débordent de leur salle sont repliés et
// s'affichent au survol de la salle (ou en la touchant sur téléphone).
const ShipLabels = (function () {
    // Taille d'un nom à l'écran, en pixels : on vise MIN_PX, et on descend
    // jusqu'à FLOOR_PX si la salle est trop petite ; en dessous, on replie
    const MIN_PX = 8;
    const FLOOR_PX = 6.5;

    let box = null;
    let svg = null;
    let tip = null;
    let shown = null; // salle dont le nom est affiché en bulle

    // Zone de chaque salle : sa forme extérieure, qui sert aussi au survol
    const rooms = {};
    const roomHit = function (id) {
        if (rooms[id])
            return rooms[id];
        let room = svg.querySelector('#' + CSS.escape(id));
        if (!room)
            return null;
        let hit = ShipMap.svgEl('path', {d: ShipMap.outerPath(room.getAttribute('d')), class: 'ship-room-hit', 'data-room': id},
            svg.querySelector('#ship-label-hits'));
        hit.addEventListener('pointerenter', () => show(id));
        hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
        hit.addEventListener('click', (e) => { e.stopPropagation(); shown === id ? hide() : show(id); });
        return (rooms[id] = hit);
    };

    // Boîte du texte, sans la place des accents et jambages (hauteur des
    // majuscules), dans le repère du texte (avant sa rotation)
    const textBox = function (label) {
        let b = label.getBBox();
        let pad = parseFloat(label.getAttribute('font-size')) * 0.15;
        return {x0: b.x, x1: b.x + b.width, y0: b.y + pad, y1: b.y + b.height - pad};
    };

    // Le nom, grossi, tient-il dans sa salle ? Chaque point du bord du texte
    // doit être dans la salle, ou là où était le nom à sa taille d'origine
    // (placé à la main dans shipRooms.json, il peut frôler un mur)
    const fits = function (label, origin) {
        let hit = roomHit(label.dataset.room);
        if (!hit)
            return true;
        let b = textBox(label);
        let xm = (b.x0 + b.x1) / 2, ym = (b.y0 + b.y1) / 2;
        let tr = label.transform.baseVal.consolidate();
        let m = tr ? tr.matrix : svg.createSVGMatrix();
        return [[b.x0, b.y0], [xm, b.y0], [b.x1, b.y0], [b.x1, ym], [b.x1, b.y1], [xm, b.y1], [b.x0, b.y1], [b.x0, ym]].every(([x, y]) => {
            if (x >= origin.x0 && x <= origin.x1 && y >= origin.y0 && y <= origin.y1)
                return true;
            let p = svg.createSVGPoint();
            p.x = x;
            p.y = y;
            return hit.isPointInFill(p.matrixTransform(m));
        });
    };

    // Taille de chaque nom selon la largeur du plan à l'écran
    const fit = function () {
        if (!svg)
            return;
        let width = svg.getBoundingClientRect().width;
        if (!width) // onglet caché
            return;
        let scale = width / svg.viewBox.baseVal.width;
        svg.querySelectorAll('.ship-room-label').forEach(label => {
            if (!label.dataset.size)
                label.dataset.size = label.getAttribute('font-size');
            let base = parseFloat(label.dataset.size);
            label.setAttribute('font-size', base);
            let origin = textBox(label);
            let ok = false;
            for (let px = MIN_PX; px >= FLOOR_PX && !ok; px -= 0.5) {
                label.setAttribute('font-size', Math.max(base, px / scale));
                ok = fits(label, origin);
            }
            if (!ok)
                label.setAttribute('font-size', base);
            label.classList.toggle('is-folded', !ok);
            let hit = roomHit(label.dataset.room);
            if (hit)
                hit.classList.toggle('is-folded', !ok);
        });
        if (shown)
            show(shown);
    };

    // Bulle avec le nom de la salle
    const show = function (id) {
        let label = svg.querySelector('.ship-room-label[data-room="' + CSS.escape(id) + '"]');
        let hit = rooms[id];
        if (!label || !hit || !label.classList.contains('is-folded'))
            return hide();
        shown = id;
        tip.textContent = label.dataset.name || label.textContent;
        tip.hidden = false;
        let outer = box.getBoundingClientRect();
        let r = hit.getBoundingClientRect();
        let half = tip.offsetWidth / 2;
        let x = Math.min(Math.max(r.left + r.width / 2 - outer.left, half), outer.width - half);
        // Au-dessus de la salle pour la laisser voir, ou dessous en haut du plan
        let above = r.top - outer.top >= tip.offsetHeight + 4;
        tip.style.left = x + 'px';
        tip.style.top = (above ? r.top - outer.top - 4 : r.bottom - outer.top + 4) + 'px';
        tip.classList.toggle('below', !above);
        svg.querySelectorAll('.ship-room-hit').forEach(h => h.classList.toggle('is-shown', h === hit));
    };

    const hide = function () {
        shown = null;
        if (tip)
            tip.hidden = true;
        if (svg)
            svg.querySelectorAll('.ship-room-hit.is-shown').forEach(h => h.classList.remove('is-shown'));
    };

    // Met le plan (contour, salles, noms) dans l'élément, une seule fois
    const setup = function (element) {
        if (box === element && svg)
            return svg;
        if (!window.LNOB_SHIP_SVG)
            return null;
        box = element;
        let outline = document.createElement('div');
        outline.className = 'ship-outline';
        if (window.LNOB_SHIP_OUTLINE) {
            let url = 'url("' + window.LNOB_SHIP_OUTLINE + '")';
            outline.style.webkitMaskImage = url;
            outline.style.maskImage = url;
        }
        let rooms = document.createElement('div');
        rooms.className = 'ship-rooms';
        rooms.innerHTML = window.LNOB_SHIP_SVG; // fichier statique de la page, pas du réseau
        tip = document.createElement('div');
        tip.className = 'ship-tip';
        tip.hidden = true;
        box.replaceChildren(outline, rooms, tip);
        svg = rooms.querySelector('svg');
        // Zones de survol des salles, sous les noms et les alertes
        let hits = ShipMap.svgEl('g', {id: 'ship-label-hits'});
        svg.insertBefore(hits, svg.querySelector('.ship-room-labels'));

        if (window.ResizeObserver)
            new ResizeObserver(fit).observe(box);
        else
            window.addEventListener('resize', fit);
        if (document.fonts && document.fonts.ready)
            document.fonts.ready.then(fit);
        document.addEventListener('click', hide);
        fit();
        return svg;
    };

    return {setup, fit};
})();
