// Synopsis and ship sheet: online players ready to continue.
// Shown under "Suivant"; when all are ready and "Suivant" is
// available, the page moves on. The GM can click before.
(function () {
    let next = document.getElementById('next');
    if (!next || typeof wsLNOB === 'undefined')
        return;
    let label = document.createElement('p');
    label.className = 'intro-ready';
    label.hidden = true;
    next.after(label);
    let last = null;
    let leaving = false;

    const available = () => getComputedStyle(next).opacity !== '0';

    const check = function () {
        if (!last || leaving)
            return;
        label.hidden = !last.expected;
        label.textContent = 'Joueurs prêts : ' + last.ready + '/' + last.expected;
        if (last.all && available()) {
            leaving = true;
            setTimeout(() => location.href = next.getAttribute('href'), 800);
        }
    };

    document.addEventListener('intro', (e) => {
        last = e.detail.data;
        check();
    });
    // Ship sheet: "Suivant" appears when the game is ready
    document.addEventListener('game-ready', () => setTimeout(check, 600));
    document.addEventListener('ws-reconnect', () => wsLNOB.send({action: 'intro'}));
    // Players arriving or leaving: the count follows
    setInterval(() => wsLNOB.send({action: 'intro'}), 3000);
    wsLNOB.send({action: 'intro'});
})();
