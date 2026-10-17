// Page de jeu : salles qui clignotent et alertes envoyées par le MJ.
// L'état vient du serveur (/api/ship/alerts) puis de l'événement « ship-alerts ».
(function () {
    const container = document.querySelector('.plan-container');
    const svg = document.getElementById('zoneActive');
    if (!container || !svg)
        return;

    // Bandeau d'alerte, au-dessus de tout le reste
    const overlay = document.createElement('div');
    overlay.id = 'ship-alert';
    overlay.className = 'ship-alert';
    overlay.setAttribute('role', 'alert');
    overlay.innerHTML =
        '<div class="ship-alert-vignette"></div>' +
        '<div class="ship-alert-stripes top"></div><div class="ship-alert-stripes bottom"></div>' +
        '<div class="ship-alert-banner">' +
        '<div class="ship-alert-title"><span class="ship-alert-icon">⚠</span> Alerte <span class="ship-alert-icon">⚠</span></div>' +
        '<div class="ship-alert-room"></div>' +
        '<div class="ship-alert-message"></div>' +
        '</div>';
    document.body.appendChild(overlay);

    let shownByMJ = false;   // plan ouvert par le MJ (pas par F1)
    let lastAlertId = null;
    // Alerte déjà vue avant un changement de page : pas de nouvelle sirène
    try { lastAlertId = parseInt(sessionStorage.getItem('shipAlertSeen')) || null; } catch (e) {}
    let compactTimer = null;

    // Sirène courte (deux tons), générée sans fichier son
    function siren() {
        try {
            let AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx)
                return;
            let ctx = siren.ctx || (siren.ctx = new AudioCtx());
            if (ctx.state === 'suspended')
                ctx.resume();
            let osc = ctx.createOscillator();
            let gain = ctx.createGain();
            osc.type = 'sawtooth';
            let t = ctx.currentTime;
            for (let i = 0; i < 6; i++)
                osc.frequency.setValueAtTime(i % 2 ? 620 : 880, t + i * 0.35);
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(0.08, t + 0.05);
            gain.gain.setValueAtTime(0.08, t + 2);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 2.15);
        } catch (e) {}
    }

    function showMap(show) {
        if (show && !container.classList.contains('mapshow')) {
            container.classList.add('mapshow');
            shownByMJ = true;
        }
        else if (!show && shownByMJ) {
            container.classList.remove('mapshow');
            shownByMJ = false;
        }
    }

    function render(state) {
        state = state || {};
        let blink = Array.isArray(state.blink) ? state.blink : [];
        let alert = state.alert;

        // Contours qui clignotent (style existant .showroom) + salle remplie
        svg.querySelectorAll('.zone-active').forEach(p => {
            p.classList.toggle('mj-blink', blink.includes(p.id) || !!(alert && alert.room === p.id));
        });
        let g = ShipMap.layer(svg, 'ship-alert-layer');
        blink.filter(id => !alert || id !== alert.room)
            .forEach(id => ShipMap.roomFill(svg, id, 'ship-blink-fill', g));
        if (alert) {
            ShipMap.roomFill(svg, alert.room, 'ship-alert-fill', g);
            ShipMap.alertMarker(svg, alert.room, alert.name, g);
        }

        // Bandeau : grand à l'arrivée de l'alerte, puis réduit en haut de l'écran
        overlay.classList.toggle('active', !!alert);
        if (alert) {
            overlay.querySelector('.ship-alert-room').textContent = alert.name;
            overlay.querySelector('.ship-alert-message').textContent = alert.message || '';
            overlay.querySelector('.ship-alert-message').hidden = !alert.message;
            if (alert.id !== lastAlertId) {
                lastAlertId = alert.id;
                try { sessionStorage.setItem('shipAlertSeen', alert.id); } catch (e) {}
                overlay.classList.remove('compact');
                void overlay.offsetWidth;
                overlay.classList.add('fresh');
                clearTimeout(compactTimer);
                compactTimer = setTimeout(() => {
                    overlay.classList.add('compact');
                    overlay.classList.remove('fresh');
                }, 6000);
                siren();
            }
            else if (!overlay.classList.contains('fresh'))
                overlay.classList.add('compact');
        }
        else {
            clearTimeout(compactTimer);
            overlay.classList.remove('compact', 'fresh');
        }

        showMap(!!state.showMap || !!alert);
    }

    function load() {
        fetch('/api/ship/alerts').then(r => r.json()).then(render).catch(() => {});
    }

    document.addEventListener('ship-alerts', (e) => render(e.detail.data));
    document.addEventListener('ws-reconnect', load);
    load();
})();
