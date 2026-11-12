// Game page: blinking rooms and alerts sent by the GM.
// The state comes from the server (/api/ship/alerts) then from the "ship-alerts" event.
(function () {
    const container = document.querySelector('.plan-container');
    const svg = document.getElementById('zoneActive');
    if (!container || !svg)
        return;

    // Alert banner, above everything else
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

    let shownByMJ = false;   // map opened by the GM (not by F1)
    let lastAlertId = null;
    // Alert already seen before a page change: it doesn't show up large again
    try { lastAlertId = parseInt(sessionStorage.getItem('shipAlertSeen')) || null; } catch (e) {}
    let compactTimer = null;

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

        // Blinking outlines (existing .showroom style) + filled room
        svg.querySelectorAll('.zone-active').forEach(p => {
            p.classList.toggle('mj-blink', blink.includes(p.id) || !!(alert && alert.room === p.id));
        });
        let g = ShipMap.layer(svg, 'ship-alert-layer');
        ShipMap.markAlertLabel(svg, alert && alert.room);
        blink.filter(id => !alert || id !== alert.room)
            .forEach(id => ShipMap.roomFill(svg, id, 'ship-blink-fill', g));
        if (alert) {
            ShipMap.roomFill(svg, alert.room, 'ship-alert-fill', g);
            ShipMap.alertMarker(svg, alert.room, alert.name, g);
        }

        // Banner: large when the alert arrives, then shrunk at the top of the screen
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
