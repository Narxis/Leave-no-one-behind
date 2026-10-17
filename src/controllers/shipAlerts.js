// Alertes sur le plan du vaisseau, pilotées par le MJ :
// - des salles qui clignotent sur le plan des joueurs
// - le plan affiché d'office chez les joueurs
// - une alerte dans une salle (bandeau et salle mise en évidence)
// L'état est gardé en mémoire : il ne concerne que la scène en cours.
const ROOMS = require('../config/shipRooms.json');
const ROOM_IDS = new Set(ROOMS.map(r => r.id));
const MAX_MESSAGE = 120;

let state;
// Identifiant unique même après un redémarrage (les pages retiennent la dernière alerte vue)
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
 * Applique une demande du MJ. Seuls les champs présents sont modifiés :
 * - blink : liste des salles qui clignotent
 * - showMap : plan affiché chez les joueurs
 * - alert : {room, message} pour lancer une alerte, null pour l'arrêter
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
