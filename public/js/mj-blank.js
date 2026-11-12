// Blank card (src/controllers/blankCard.js): when the players choose
// "Autre…", the panel lights up; the GM writes the text and up to 4 choices
// (result, morale, humans, loot) then shows it on the game screen. They
// can also show one at any time, or cancel to go back to the card.
(function () {
    const $ = (id) => document.getElementById(id);
    const panel = $('mj-blank');
    const status = $('mj-blank-status');
    const desc = $('mj-blank-desc');
    const rows = Array.from(panel.querySelectorAll('.mj-blank-choice'));
    const HELP = status.textContent;

    function read() {
        return {
            desc: desc.value,
            choices: rows.map(row => ({
                value: row.querySelector('.mj-blank-value').value,
                reveal: row.querySelector('.mj-blank-reveal').value,
                moral: row.querySelector('.mj-blank-moral').value,
                humans: row.querySelector('.mj-blank-humans').value,
                loot: row.querySelector('.mj-blank-loot').value
            })).filter(c => c.value.trim())
        };
    }

    function clear() {
        desc.value = '';
        panel.querySelectorAll('.mj-blank-choice input, .mj-blank-choice textarea').forEach(e => { e.value = ''; });
    }

    function render(state) {
        panel.classList.toggle('waiting', !!state && state.status === 'waiting');
        panel.classList.toggle('shown', !!state && state.status === 'shown');
        if (!state)
            status.textContent = HELP;
        else if (state.status === 'waiting')
            status.textContent = 'Les joueurs ont choisi « Autre… » : écoutez leur action, écrivez la suite et affichez-la.';
        else
            status.textContent = 'Carte blanche affichée : en attente du choix sur l\'écran de jeu.';
    }

    function load() {
        fetch('/api/blankCard').then(r => r.json()).then(s => render(s && s.status ? s : null)).catch(() => {});
    }

    $('mj-blank-show').addEventListener('click', () => {
        let card = read();
        if (!card.desc.trim() && !card.choices.length) {
            desc.classList.remove('shake');
            void desc.offsetWidth;
            desc.classList.add('shake');
            desc.focus();
            return;
        }
        wsLNOB.send({action: 'blank-card-show', data: card});
    });
    $('mj-blank-cancel').addEventListener('click', () => wsLNOB.send({action: 'blank-card-cancel', data: {}}));
    $('mj-blank-clear').addEventListener('click', clear);

    document.addEventListener('blank-card-request', (e) => {
        render(e.detail.data);
        panel.scrollIntoView({behavior: 'smooth', block: 'start'});
        desc.focus({preventScroll: true});
    });
    document.addEventListener('blank-card-show', () => render({status: 'shown'}));
    document.addEventListener('blank-card-cancel', () => render(null));
    // Choice made: the card is finished, the form is cleared for the next one
    document.addEventListener('blank-card-choice', () => { render(null); clear(); });
    document.addEventListener('ws-reconnect', load);
    load();
})();
