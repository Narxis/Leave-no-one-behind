// Généré par scripts/player-assets.js : ne pas modifier à la main
// Animation du compte à rebours : le bras robot charge une boule d'énergie
// pendant 30 s... qui fait pschitt. Faute de mieux, le robot lance son
// pistolet-timer sur le vaisseau, qui part en vrille puis revient à coups
// de réacteur.
const TimerAnim = (function () {
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const $ = (sel) => document.querySelector(sel);

    // Classes de la séquence, retirées à chaque nouveau compte à rebours
    // (plusieurs cartes à timer peuvent se suivre sans recharger la page)
    const BOX_CLASSES = ['start', 'startnot', 'idle', 'grow', 'float', 'flash', 'overcharge',
        'critical', 'plop', 'fizzle', 'shot', 'hide'];
    const IDLE_PERIOD = 2000; // durée d'un cycle du bras au repos (gunfloat*)
    const THROW_AT = 1600;    // lâcher du pistolet dans l'animation shot (CSS)
    const SHIP_CLASSES = ['bonk', 'comeback', 'thrust'];

    let run = 0; // invalide une séquence en cours si on recommence ou annule

    // Taille de la boule : petite charge régulière, puis surcharge à 10 s
    function chargeFor(timeLeft) {
        if (timeLeft > 10)
            return 0.05 + 0.25 * (30 - timeLeft) / 20;
        return 0.6 + 0.4 * (10 - timeLeft) / 10;
    }

    function setDigits(timeLeft) {
        const txt = (timeLeft < 10 ? '0' : '') + timeLeft;
        $('#timer-text').textContent = txt;
        $('#timer-text2').textContent = txt;
    }

    // Relance l'impulsion lumineuse des chiffres, calée sur la seconde
    function beat(box) {
        box.classList.remove('beat');
        void box.offsetWidth;
        box.classList.add('beat');
    }

    function reset() {
        const box = $('#bigboite');
        const ship = $('#plugship');
        box.classList.remove(...BOX_CLASSES, 'beat');
        box.style.removeProperty('--charge');
        ship.classList.remove(...SHIP_CLASSES);
        ship.classList.add('shipflotte');
    }

    // Temps restant avant que le bras au repos repasse par sa pose de départ,
    // celle où commence le lancer : on y démarre le lancer pour éviter un saut
    function untilArmRest() {
        const anim = $('#arm1').getAnimations().find(a => a.animationName === 'gunfloat1');
        if (!anim || anim.currentTime === null) return 0;
        return (IDLE_PERIOD - anim.currentTime % IDLE_PERIOD) % IDLE_PERIOD;
    }

    function tick(timeLeft) {
        const box = $('#bigboite');
        setDigits(timeLeft);
        if (timeLeft === 30) {
            run++;
            reset();
            box.classList.add('start', 'grow', 'float');
        }
        if (timeLeft === 28) {
            box.classList.add('idle');
            box.classList.remove('start');
        }
        if (timeLeft === 10) {
            box.classList.add('flash', 'overcharge');
            // L'onde de choc dure 2 s : la retirer avant la coupait net
            const r = run;
            wait(2000).then(() => { if (r === run) box.classList.remove('flash'); });
        }
        if (timeLeft === 5)
            box.classList.add('critical');
        if (timeLeft > 0) {
            box.style.setProperty('--charge', chargeFor(timeLeft));
            beat(box);
        }
    }

    // Petit nuage de fumée quand la boule s'éteint
    function puff() {
        const host = $('#floatboite');
        for (let i = 0; i < 6; i++) {
            const p = document.createElement('div');
            const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.6;
            p.className = 'fizzle-puff';
            p.style.setProperty('--dx', Math.cos(angle) * (18 + Math.random() * 14) + 'px');
            p.style.setProperty('--dy', Math.sin(angle) * (14 + Math.random() * 10) - 12 + 'px');
            p.style.animationDelay = (i * 40) + 'ms';
            host.append(p);
            setTimeout(() => p.remove(), 1400);
        }
    }

    // Étoile d'impact là où le pistolet touche le vaisseau
    function impact(ship) {
        const burst = document.createElement('div');
        burst.className = 'ship-impact';
        burst.style.left = (ship.offsetLeft + ship.offsetWidth * 0.62) + 'px';
        burst.style.top = (ship.offsetTop + ship.offsetHeight * 0.3) + 'px';
        ship.parentElement.append(burst);
        setTimeout(() => burst.remove(), 900);
    }

    // Fin du temps : la boule fait pschitt, le robot lance son pistolet
    async function finish() {
        const r = run;
        const box = $('#bigboite');
        const ship = $('#plugship');
        const alive = () => r === run;

        setDigits(0);
        box.classList.remove('grow', 'overcharge', 'critical', 'beat');
        box.classList.add('fizzle');
        puff();
        // Le lancer part quand le bras repasse par sa pose de repos, une fois
        // la boule presque éteinte
        let delay = untilArmRest();
        while (delay < 900) delay += IDLE_PERIOD;
        await wait(delay);
        if (!alive()) return;

        // Le lâcher du pistolet est géré en CSS (délai de THROW_AT) pour
        // rester calé à l'image près sur le mouvement du bras
        box.classList.add('shot');
        await wait(THROW_AT + 560);
        if (!alive()) return;

        impact(ship);
        ship.classList.add('bonk');
        await wait(1000);
        if (!alive()) return;

        ship.classList.remove('bonk');
        ship.classList.add('comeback', 'thrust');
        await wait(1450);
        if (!alive()) return;

        ship.classList.remove('thrust');
        box.classList.remove('idle');
        box.classList.add('hide');
        await wait(450);
        if (!alive()) return;

        ship.classList.remove('comeback');
        box.classList.remove('shot', 'fizzle', 'float');
    }

    // Choix fait avant la fin : la boule se dissipe et le bras se replie
    async function cancel() {
        const r = ++run;
        const box = $('#bigboite');
        box.classList.remove('grow', 'flash', 'overcharge', 'critical', 'beat');
        box.classList.add('plop');
        await wait(500);
        if (r !== run) return;
        box.classList.remove('idle', 'start');
        box.classList.add('startnot');
        await wait(2000);
        if (r !== run) return;
        reset();
    }

    return { tick, finish, cancel };
})();
