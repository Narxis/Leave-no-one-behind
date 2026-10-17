// Partie en ligne (lobby.ejs) : code de la partie et joueurs connectés au relais
(function () {
    const $ = (id) => document.getElementById(id);
    const STATUS = {
        connecting: 'Connexion au relais…',
        reconnecting: 'Connexion au relais perdue, reconnexion…',
        open: 'Partie ouverte : donne le code ou le lien aux joueurs.',
        error: 'Relais injoignable, nouvel essai en cours…'
    };

    const render = function (state) {
        let closed = state.status === 'closed';
        $('lobby-closed').hidden = !closed;
        $('lobby-opened').hidden = closed;
        $('lobby-error').hidden = !state.error;
        $('lobby-error').textContent = state.error || '';
        if (closed)
            return;

        $('lobby-status').textContent = STATUS[state.status] || '';
        $('lobby-status').className = 'lobby-status ' + state.status;
        $('lobby-code').textContent = state.code || '———';
        $('lobby-link').value = state.link || '';
        $('lobby-copy').disabled = !state.link;

        let online = state.players.filter(p => p.online).length;
        $('lobby-count').textContent = state.players.length ? '(' + online + ' en ligne)' : '';
        $('lobby-empty').hidden = state.players.length > 0;
        $('lobby-players').replaceChildren(...state.players.map(p => {
            let li = document.createElement('li');
            li.className = 'lobby-player' + (p.online ? ' online' : '');
            let name = document.createElement('span');
            name.className = 'lobby-player-name';
            name.textContent = p.name;
            let status = document.createElement('span');
            status.className = 'lobby-player-status';
            status.textContent = p.online ? 'en ligne' : 'déconnecté';
            let kick = document.createElement('button');
            kick.type = 'button';
            kick.className = 'lobby-kick';
            kick.textContent = 'Retirer';
            kick.addEventListener('click', () => {
                if (confirm('Retirer ' + p.name + ' de la partie ?'))
                    wsLNOB.send({action: 'lobby-kick', data: {id: p.id}});
            });
            li.append(name, status, kick);
            return li;
        }));
    };

    document.addEventListener('lobby', (e) => render(e.detail.data));
    // Après une coupure du serveur du jeu, on redemande l'état
    document.addEventListener('ws-reconnect', () => wsLNOB.send({action: 'lobby-state'}));

    $('lobby-open').addEventListener('click', () => wsLNOB.send({action: 'lobby-open'}));
    $('lobby-close').addEventListener('click', () => {
        if (confirm('Fermer la partie ? Les joueurs seront déconnectés et le code ne marchera plus.'))
            wsLNOB.send({action: 'lobby-close'});
    });
    $('lobby-copy').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText($('lobby-link').value);
            $('lobby-copy').textContent = 'Copié !';
        } catch (e) {
            $('lobby-link').select();
            $('lobby-copy').textContent = 'Ctrl+C pour copier';
        }
        setTimeout(() => { $('lobby-copy').textContent = 'Copier le lien'; }, 2000);
    });

    render(JSON.parse($('lobby').dataset.state));
})();
