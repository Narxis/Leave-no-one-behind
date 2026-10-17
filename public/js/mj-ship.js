// Panneau MJ : plan du vaisseau. Le MJ fait clignoter des salles, affiche le
// plan chez les joueurs et envoie une alerte dans une salle. L'état fait foi
// côté serveur et revient par l'événement « ship-alerts ».
(function () {
    const map = document.getElementById('mj-ship-map');
    if (!map)
        return;
    const svg = map.querySelector('svg');
    const rooms = (typeof SHIP_ROOMS !== 'undefined' ? SHIP_ROOMS : []);
    const roomList = document.getElementById('mj-ship-rooms');
    const showMap = document.getElementById('mj-ship-show');
    const alertRoom = document.getElementById('mj-ship-alert-room');
    const alertMessage = document.getElementById('mj-ship-alert-message');
    const alertSend = document.getElementById('mj-ship-alert-send');
    const alertStop = document.getElementById('mj-ship-alert-stop');
    const alertStatus = document.getElementById('mj-ship-alert-status');

    let state = {blink: [], showMap: false, alert: null};

    const send = (data) => wsLNOB.send({action: 'ship-alerts', data: data});
    const nameOf = (id) => (rooms.find(r => r.id === id) || {}).name || id;

    function toggleRoom(id) {
        let blink = state.blink.includes(id) ? state.blink.filter(r => r !== id) : state.blink.concat(id);
        send({blink: blink});
        // La salle cliquée devient la cible proposée pour l'alerte
        alertRoom.value = id;
    }

    // Zones cliquables : la salle pleine, au-dessus du contour
    const hit = ShipMap.svgEl('g', {id: 'mj-ship-hit'}, svg);
    for (let room of rooms) {
        let path = ShipMap.roomFill(svg, room.id, 'mj-ship-room', hit);
        if (!path)
            continue;
        ShipMap.svgEl('title', {}, path).textContent = room.name;
        path.addEventListener('click', () => toggleRoom(room.id));
    }

    // Liste des salles, pour cliquer sans viser sur le plan
    const chips = {};
    for (let room of rooms) {
        let chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'mj-ship-chip';
        chip.textContent = room.name;
        chip.addEventListener('click', () => toggleRoom(room.id));
        chip.addEventListener('mouseenter', () => map.querySelector('.mj-ship-room[data-room="' + room.id + '"]')?.classList.add('hover'));
        chip.addEventListener('mouseleave', () => map.querySelector('.mj-ship-room[data-room="' + room.id + '"]')?.classList.remove('hover'));
        roomList.append(chip);
        chips[room.id] = chip;
    }

    function render(next) {
        state = Object.assign({blink: [], showMap: false, alert: null}, next || {});
        let alert = state.alert;

        for (let id in chips) {
            chips[id].classList.toggle('active', state.blink.includes(id));
            chips[id].classList.toggle('alert', !!(alert && alert.room === id));
        }
        // Calque sous les zones cliquables, pour ne pas gêner les clics
        let g = ShipMap.layer(svg, 'ship-alert-layer');
        svg.insertBefore(g, hit);
        state.blink.filter(id => !alert || id !== alert.room)
            .forEach(id => ShipMap.roomFill(svg, id, 'ship-blink-fill', g));
        if (alert) {
            ShipMap.roomFill(svg, alert.room, 'ship-alert-fill', g);
            ShipMap.alertMarker(svg, alert.room, alert.name, g);
        }

        showMap.checked = !!state.showMap;
        alertStop.disabled = !alert;
        alertStatus.classList.toggle('active', !!alert);
        alertStatus.textContent = alert
            ? 'Alerte en cours : ' + alert.name + (alert.message ? ' — ' + alert.message : '')
            : 'Aucune alerte en cours';
    }

    showMap.addEventListener('change', () => send({showMap: showMap.checked}));
    document.getElementById('mj-ship-clear').addEventListener('click', () => send({blink: []}));
    alertSend.addEventListener('click', () => {
        send({alert: {room: alertRoom.value, message: alertMessage.value}});
    });
    alertMessage.addEventListener('keydown', (e) => { if (e.key === 'Enter') alertSend.click(); });
    alertStop.addEventListener('click', () => send({alert: null}));

    function load() {
        fetch('/api/ship/alerts').then(r => r.json()).then(render).catch(() => {});
    }

    document.addEventListener('ship-alerts', (e) => render(e.detail.data));
    document.addEventListener('ws-reconnect', load);
    load();
})();
