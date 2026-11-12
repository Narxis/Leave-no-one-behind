// Holding + / - on the modules (and the Humans counter) scrolls the
// value, faster and faster. Each step replays the button's onclick
// (quickUpdateModule), so sending to the server and 0-100 bounds unchanged.
(function () {
    const SELECTOR = '[onclick*="quickUpdateModule"]';
    const START_DELAY = 400;            // before the first repeated step
    const STEPS = [                     // [after X ms of holding, one step every Y ms]
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

    // After a hold, the release fires a native click: ignore it
    // so as not to add one step too many
    document.addEventListener('click', (e) => {
        if (repeated && e.isTrusted && e.target.closest(SELECTOR)) {
            e.stopPropagation();
            e.preventDefault();
            repeated = false;
        }
    }, true);
})();

// Long press to confirm a rare and irreversible action (end of combat…),
// without a confirmation dialog: a [data-hold] button receives the
// "hold-confirm" event after HOLD_MS of holding. A simple click only
// recalls the data-hold text ("Maintenir pour …")
(function () {
    const SELECTOR = '[data-hold]';
    const HOLD_MS = 800;

    let timer = null;
    let held = null;      // button being held
    let done = null;      // button just confirmed: its release click is ignored

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
    // With the keyboard: hold Enter or Space
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
