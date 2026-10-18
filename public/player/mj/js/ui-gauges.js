// Généré par scripts/player-assets.js : ne pas modifier à la main
// Jauges des modules du vaisseau.
// L'ancien anneau en pointillés restait toujours plein et son texte ne suivait
// pas les changements : on le remplace par un anneau qui suit data-value
// (posé par card.js, end-screen.js...), avec une couleur selon l'état.
// Les barres de la fiche vaisseau (image fixe à 10/10) deviennent des
// barres à 10 segments liées à la jauge de la même ligne.
(function () {
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const SEGMENTS = 10;

    const level = (v) => v >= 60 ? 'ok' : (v >= 30 ? 'warn' : 'crit');

    const readValue = (dial) => {
        let v = parseInt(dial.getAttribute('data-value'), 10);
        return isNaN(v) ? 0 : Math.min(Math.max(v, 0), 100);
    };

    const makeCircle = (cls) => {
        let c = document.createElementNS(SVG_NS, 'circle');
        c.setAttribute('class', cls);
        c.setAttribute('cx', '50');
        c.setAttribute('cy', '50');
        c.setAttribute('r', '44');
        c.setAttribute('pathLength', '100');
        c.setAttribute('transform', 'rotate(-90 50 50)');
        return c;
    };

    // Barre à segments de la fiche vaisseau, sur la même ligne que la jauge
    const findSegbarHost = (dial) => {
        let wrapper = dial.closest('.wrapper');
        let module = wrapper && wrapper.previousElementSibling;
        if (!module || !module.classList.contains('module'))
            return null;
        return module.querySelector('.bars');
    };

    const buildSegbar = (host) => {
        let bar = document.createElement('div');
        bar.className = 'ui-segbar';
        for (let i = 0; i < SEGMENTS; i++)
            bar.appendChild(document.createElement('span'));
        host.replaceChildren(bar);
        return bar;
    };

    const update = (dial, parts) => {
        let v = readValue(dial);
        dial.dataset.level = level(v);
        parts.fill.setAttribute('stroke-dasharray', v + ' 100');
        parts.fill.style.opacity = v === 0 ? '0' : '';
        parts.text.textContent = v + '%';

        if (parts.segbar) {
            parts.segbar.dataset.level = level(v);
            let on = Math.round(v / (100 / SEGMENTS));
            parts.segbar.querySelectorAll('span').forEach((s, i) => s.classList.toggle('on', i < on));
        }
    };

    const build = (dial) => {
        let svg = dial.querySelector('svg');
        if (!svg || svg.classList.contains('ui-gauge'))
            return;

        svg.replaceChildren();
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.classList.add('ui-gauge');

        let fill = makeCircle('ui-gauge-fill');
        let text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('class', 'ui-gauge-text');
        text.setAttribute('x', '50');
        text.setAttribute('y', '50');
        svg.append(makeCircle('ui-gauge-track'), fill, text);

        let host = findSegbarHost(dial);
        let parts = {fill: fill, text: text, segbar: host ? buildSegbar(host) : null};

        update(dial, parts);
        new MutationObserver(() => update(dial, parts))
            .observe(dial, {attributes: true, attributeFilter: ['data-value']});
    };

    const init = () => document.querySelectorAll('.dial').forEach(build);

    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', init);
    else
        init();
})();
