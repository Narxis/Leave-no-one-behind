// Start window: the page's only access to the rest of the app
const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('lnob', {
    start: (choice) => ipcRenderer.invoke('lnob:start', choice)
});
