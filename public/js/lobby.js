// Partie en ligne (lobby.ejs) : code de la partie et joueurs connectés au relais
(function () {
    const $ = (id) => document.getElementById(id);
    const STATUS = {
        connecting: 'Connexion au relais…',
        reconnecting: 'Connexion au relais perdue, reconnexion…',
        open: 'Partie ouverte : donne le code ou le lien aux joueurs.',
        error: 'Relais injoignable, nouvel essai en cours…'
    };

    // Bouton de lancement selon l'étape de la partie : page ouverte sur l'écran principal
    const LAUNCH = {
        creation: {
            hint: 'Création des persos en cours : les joueurs créent leur perso depuis leur app.',
            label: 'Afficher la création des persos',
            page: '/persos'
        },
        gameLive: {
            hint: 'Partie en cours.',
            label: 'Afficher l\'écran de jeu',
            page: '/next'
        },
        none: {
            hint: 'Quand tout le monde est là, lance la partie : paramètres, puis création des persos, que les joueurs font depuis leur app.',
            label: 'Lancer la partie',
            page: '/parametres'
        }
    };
    let phase = null;

    // Dans l'app, la page s'ouvre dans la fenêtre du jeu ; dans un navigateur,
    // dans un onglet à part (ou l'onglet du lobby si les fenêtres sont bloquées)
    const openGame = function (page) {
        if (!window.open(page, 'lnob-game') && !/Electron/.test(navigator.userAgent))
            location.href = page;
    };

    // Lancement : l'écran de jeu passe aux paramètres et la page du MJ va au panneau MJ
    const launch = function () {
        openGame('/parametres');
        location.href = '/mj-menu';
    };

    const renderLaunch = function () {
        let step = LAUNCH[phase] || LAUNCH.none;
        $('lobby-launch-hint').textContent = step.hint;
        $('lobby-launch-main').textContent = step.label;
        // Partie en cours ou création commencée : on peut aussi tout recommencer
        $('lobby-launch-new').hidden = !LAUNCH[phase];
    };

    const render = function (state) {
        phase = state.phase || null;
        renderLaunch();
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
            // Compte Discord vérifié par le relais : avatar et pseudo
            if (p.discord) {
                let avatar = document.createElement('img');
                avatar.className = 'discord-avatar';
                avatar.src = p.discord.avatar;
                avatar.alt = '';
                avatar.referrerPolicy = 'no-referrer';
                name.prepend(avatar);
                let tag = document.createElement('span');
                tag.className = 'discord-name';
                tag.textContent = ' · Discord : ' + p.discord.name;
                name.append(tag);
            }
            // Perso retrouvé grâce à l'identifiant d'app du joueur
            let character = document.createElement('span');
            character.className = 'lobby-player-character';
            character.textContent = p.character ? 'perso : ' + p.character : 'pas de perso';
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
            li.append(name, character, status, kick);
            return li;
        }));
    };

    document.addEventListener('lobby', (e) => render(e.detail.data));
    // Après une coupure du serveur du jeu, on redemande l'état
    document.addEventListener('ws-reconnect', () => wsLNOB.send({action: 'lobby-state'}));

    $('lobby-launch-main').addEventListener('click', () => {
        if (LAUNCH[phase])
            openGame(LAUNCH[phase].page);
        else
            launch();
    });
    $('lobby-launch-new').addEventListener('click', () => {
        if (confirm('Recommencer une nouvelle partie ? La partie en cours sera perdue.'))
            launch();
    });
    // L'étape a pu changer pendant que la fenêtre était en arrière-plan
    window.addEventListener('focus', () => wsLNOB.send({action: 'lobby-state'}));

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
