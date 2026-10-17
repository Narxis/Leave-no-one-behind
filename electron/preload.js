// Fenêtre de départ : seul accès de la page au reste de l'app
const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('lnob', {
    start: (choice) => ipcRenderer.invoke('lnob:start', choice)
});
