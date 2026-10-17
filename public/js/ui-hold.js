// Maintenir + / - sur les modules (et le compteur Humains) fait défiler la
// valeur, de plus en plus vite. Chaque pas rejoue le onclick du bouton
// (quickUpdateModule), donc envoi au serveur et bornes 0-100 inchangés.
(function () {
    const SELECTOR = '[onclick*="quickUpdateModule"]';
    const START_DELAY = 400;            // avant le premier pas répété
    const STEPS = [                     // [après X ms de maintien, un pas toutes les Y ms]
        [0, 120],
        [1000, 60],
        [2500, 30]
    ];

    let timer = null;
    let repeated = false;

    const stop = () => {
        clearTimeout(timer);
        timer = null;
    };

    const intervalFor = (elapsed) => {
        let interval = STEPS[0][1];
        for (const [after, every] of STEPS)
            if (elapsed >= after)
                interval = every;
        return interval;
    };

    document.addEventListener('pointerdown', (e) => {
        const button = e.target.closest(SELECTOR);
        if (!button || e.button !== 0)
            return;

        stop();
        repeated = false;
        const holdStart = Date.now() + START_DELAY;

        const step = () => {
            repeated = true;
            button.click();
            timer = setTimeout(step, intervalFor(Date.now() - holdStart));
        };
        timer = setTimeout(step, START_DELAY);
    });

    ['pointerup', 'pointercancel', 'blur'].forEach(type => window.addEventListener(type, stop));
    document.addEventListener('pointerout', (e) => {
        if (e.target.closest(SELECTOR))
            stop();
    });

    // Après un maintien, le relâchement déclenche un clic natif : on l'ignore
    // pour ne pas ajouter un pas de trop
    document.addEventListener('click', (e) => {
        if (repeated && e.isTrusted && e.target.closest(SELECTOR)) {
            e.stopPropagation();
            e.preventDefault();
            repeated = false;
        }
    }, true);
})();

// Appui long pour confirmer une action rare et irréversible (fin de combat…),
// sans fenêtre de confirmation : un bouton [data-hold] reçoit l'événement
// « hold-confirm » après HOLD_MS de maintien. Un clic simple ne fait que
// rappeler le texte de data-hold (« Maintenir pour … »)
(function () {
    const SELECTOR = '[data-hold]';
    const HOLD_MS = 800;

    let timer = null;
    let held = null;      // bouton en cours de maintien
    let done = null;      // bouton qui vient d'être confirmé : son clic de relâchement est ignoré

    const stop = () => {
        clearTimeout(timer);
        timer = null;
        if (held)
            held.classList.remove('holding');
        held = null;
    };

    const begin = (button) => {
        stop();
        held = button;
        button.style.setProperty('--hold-ms', HOLD_MS + 'ms');
        button.classList.remove('hold-hint');
        button.classList.add('holding');
        timer = setTimeout(() => {
            let target = held;
            stop();
            done = target;
            setTimeout(() => { if (done === target) done = null; }, 600);
            target.dispatchEvent(new CustomEvent('hold-confirm', {bubbles: true}));
        }, HOLD_MS);
    };

    document.addEventListener('pointerdown', (e) => {
        const button = e.target.closest(SELECTOR);
        if (button && e.button === 0 && !button.disabled)
            begin(button);
    });
    ['pointerup', 'pointercancel', 'blur'].forEach(type => window.addEventListener(type, stop));
    document.addEventListener('pointerout', (e) => {
        if (held && e.target.closest(SELECTOR) === held && !held.contains(e.relatedTarget))
            stop();
    });
    // Au clavier : maintenir Entrée ou Espace
    document.addEventListener('keydown', (e) => {
        const button = (e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest(SELECTOR);
        if (!button)
            return;
        e.preventDefault();
        if (!e.repeat)
            begin(button);
    });
    document.addEventListener('keyup', (e) => {
        if (e.key === 'Enter' || e.key === ' ')
            stop();
    });

    document.addEventListener('click', (e) => {
        const button = e.target.closest(SELECTOR) || (done && e.target.closest('button') === done ? done : null);
        if (!button)
            return;
        e.stopImmediatePropagation();
        e.preventDefault();
        if (button === done) {
            done = null;
            return;
        }
        button.classList.remove('hold-hint');
        void button.offsetWidth;
        button.classList.add('hold-hint');
    }, true);
})();
