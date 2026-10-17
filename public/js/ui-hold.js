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
