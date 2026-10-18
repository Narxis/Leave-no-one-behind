// Réglages du son, gardés dans le navigateur (chaque écran règle le sien).
// Les futurs sons passent par LNOBSound pour respecter ces réglages :
//   LNOBSound.play('/sounds/porte.mp3', 'effects')
//   audio.volume = LNOBSound.volume('music')  (et suivre l'événement « sound-settings »)
const LNOBSound = (function () {
    const KEY = 'lnob-sound';
    const DEFAULTS = {master: 80, effects: 80, music: 60, muted: false};
    let settings = Object.assign({}, DEFAULTS);

    try {
        Object.assign(settings, JSON.parse(localStorage.getItem(KEY)) || {});
    } catch (e) {}

    const clamp = (v) => Math.min(100, Math.max(0, parseInt(v) || 0));

    function get() {
        return Object.assign({}, settings);
    }

    function set(changes) {
        for (let k in changes) {
            if (!(k in DEFAULTS))
                continue;
            settings[k] = k === 'muted' ? !!changes[k] : clamp(changes[k]);
        }
        try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) {}
        document.dispatchEvent(new CustomEvent('sound-settings', {detail: get()}));
    }

    // Volume final (0 à 1) d'une catégorie : 'effects' ou 'music'
    function volume(category) {
        if (settings.muted)
            return 0;
        let cat = category in settings ? settings[category] : 100;
        return (settings.master / 100) * (cat / 100);
    }

    function play(src, category = 'effects') {
        let v = volume(category);
        if (!v)
            return null;
        let audio = new Audio(src);
        audio.volume = v;
        audio.play().catch(() => {});
        return audio;
    }

    return {get, set, volume, play};
})();

// Fenêtre Options, ouverte par l'engrenage du menu
(function () {
    const modal = document.getElementById('options-modal');
    const open = document.getElementById('options-open');
    if (!modal || !open)
        return;

    function sync() {
        let s = LNOBSound.get();
        modal.querySelectorAll('[data-sound]').forEach(input => {
            let key = input.dataset.sound;
            if (input.type === 'checkbox')
                input.checked = s[key];
            else {
                input.value = s[key];
                input.nextElementSibling.textContent = s[key] + ' %';
                input.disabled = s.muted;
            }
        });
    }

    function show() {
        sync();
        modal.hidden = false;
        let nav = document.getElementById('navBtn');
        if (nav && nav.checked)
            nav.click();
        modal.querySelector('input').focus();
    }

    function hide() {
        modal.hidden = true;
    }

    open.addEventListener('click', (e) => {
        e.preventDefault();
        show();
    });
    document.getElementById('options-close').addEventListener('click', hide);
    modal.addEventListener('click', (e) => { if (e.target === modal) hide(); });
    modal.querySelectorAll('[data-sound]').forEach(input => {
        input.addEventListener('input', () => {
            LNOBSound.set({[input.dataset.sound]: input.type === 'checkbox' ? input.checked : input.value});
            sync();
        });
    });

    // Échap ferme la fenêtre sans rouvrir le menu (capturé avant keyPressFunctions.js)
    ['keydown', 'keyup'].forEach(type => window.addEventListener(type, (e) => {
        if (modal.hidden || e.key !== 'Escape')
            return;
        e.stopPropagation();
        if (type === 'keyup')
            hide();
    }, true));
})();
