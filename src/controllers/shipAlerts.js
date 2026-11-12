// Alerts on the ship map, driven by the GM:
// - rooms blinking on the players' map
// - the map shown by default on the players' side
// - an alert in a room (banner and highlighted room)
// The state is kept in memory: it only concerns the current scene.
const ROOMS = require('../config/shipRooms.json');
const ROOM_IDS = new Set(ROOMS.map(r => r.id));
const MAX_MESSAGE = 120;

let state;
// Unique id even after a restart (the pages remember the last alert seen)
let lastAlertId = 0;

const reset = function () {
    state = {blink: [], showMap: false, alert: null};
}
reset();

const roomName = (id) => (ROOMS.find(r => r.id === id) || {}).name || id;

const getState = function () {
    return JSON.parse(JSON.stringify(state));
}

/**
 * Applies a GM request. Only the fields present are changed:
 * - blink: list of blinking rooms
 * - showMap: map shown on the players' side
 * - alert: {room, message} to start an alert, null to stop it
 */
const update = function (data) {
    data = data || {};
    if (data.alert && !ROOM_IDS.has(data.alert.room))
        return {action: 'ship-alerts', error: true, error_msg: 'salle inconnue : ' + data.alert.room};
    if (Array.isArray(data.blink))
        state.blink = [...new Set(data.blink.filter(id => ROOM_IDS.has(id)))];
    if (data.showMap !== undefined)
        state.showMap = !!data.showMap;
    if (data.alert === null)
        state.alert = null;
    else if (data.alert) {
        state.alert = {
            id: lastAlertId = Math.max(Date.now(), lastAlertId + 1),
            room: data.alert.room,
            name: roomName(data.alert.room),
            message: String(data.alert.message || '').trim().slice(0, MAX_MESSAGE)
        };
    }
    return {action: 'ship-alerts', error: false, data: getState()};
}

const handle = function (response) {
    return update(response.data);
}

module.exports = {ROOMS, handle, update, getState, reset};
