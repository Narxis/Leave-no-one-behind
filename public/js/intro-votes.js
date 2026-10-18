// Synopsis et fiche du vaisseau : joueurs en ligne prêts à continuer.
// Affiché sous « Suivant » ; quand tous sont prêts et que « Suivant » est
// disponible, la page passe à la suite. Le MJ peut cliquer avant.
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
    // Fiche du vaisseau : « Suivant » apparaît quand la partie est prête
    document.addEventListener('game-ready', () => setTimeout(check, 600));
    document.addEventListener('ws-reconnect', () => wsLNOB.send({action: 'intro'}));
    // Joueurs qui arrivent ou partent : le compte suit
    setInterval(() => wsLNOB.send({action: 'intro'}), 3000);
    wsLNOB.send({action: 'intro'});
})();
