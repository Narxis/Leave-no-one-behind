// Chat de la partie en ligne, côté MJ (lobby.ejs) : le salon commun et une
// conversation privée avec chaque joueur. Les messages arrivent par le
// WebSocket du jeu (actions « chat » et « chat-history »).
(function () {
    const $ = (id) => document.getElementById(id);
    const ROOM = '';      // salon commun
    let messages = [];
    let players = [];     // joueurs du lobby (pour les conversations privées)
    let channel = ROOM;
    const unread = new Map();

    const channelOf = (m) => m.to || ROOM;
    const time = (at) => new Date(at).toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'});

    const el = function (tag, cls, text) {
        let node = document.createElement(tag);
        if (cls)
            node.className = cls;
        if (text !== undefined)
            node.textContent = text;
        return node;
    };

    const renderChannels = function () {
        // Joueurs du lobby, plus ceux qui ont écrit puis sont partis
        let ids = new Map(players.map(p => [p.id, p.character || p.name]));
        for (let m of messages)
            if (m.to && !ids.has(m.to))
                ids.set(m.to, m.from.gm ? m.to : m.from.name);
        let list = [[ROOM, 'Salon']].concat([...ids].map(([id, name]) => [id, '🔒 ' + name]));
        $('chat-channels').replaceChildren(...list.map(([id, label]) => {
            let b = el('button', 'chat-channel' + (id === channel ? ' active' : ''), label);
            b.type = 'button';
            let n = unread.get(id) || 0;
            if (n)
                b.append(el('span', 'chat-unread', String(n)));
            b.addEventListener('click', () => select(id));
            return b;
        }));
    };

    const renderMessages = function () {
        let list = messages.filter(m => channelOf(m) === channel);
        $('chat-empty').hidden = list.length > 0;
        $('chat-messages').replaceChildren(...list.map(m => {
            let li = el('li', 'chat-message' + (m.from.gm ? ' gm' : '') + (m.dice ? ' chat-dice' : ''));
            let head = el('div', 'chat-head');
            head.append(el('strong', '', m.from.name), el('span', 'chat-time', time(m.at)));
            li.append(head, el('p', 'chat-text', m.text));
            return li;
        }));
        $('chat-messages').scrollTop = $('chat-messages').scrollHeight;
        let player = players.find(p => p.id === channel);
        $('chat-text').placeholder = channel === ROOM ? 'Écrire dans le salon…' : 'Message privé à ' + (player ? (player.character || player.name) : 'ce joueur') + '…';
    };

    const select = function (id) {
        channel = id;
        unread.delete(id);
        renderChannels();
        renderMessages();
        $('chat-text').focus();
    };

    document.addEventListener('chat', (e) => {
        let m = e.detail.data.message;
        messages.push(m);
        if (channelOf(m) !== channel && !m.from.gm)
            unread.set(channelOf(m), (unread.get(channelOf(m)) || 0) + 1);
        renderChannels();
        renderMessages();
    });
    document.addEventListener('chat-history', (e) => {
        messages = e.detail.data.messages || [];
        renderChannels();
        renderMessages();
    });
    document.addEventListener('lobby', (e) => {
        players = e.detail.data.players || [];
        renderChannels();
    });
    document.addEventListener('ws-reconnect', () => wsLNOB.send({action: 'chat-history'}));

    $('chat-form').addEventListener('submit', (e) => {
        e.preventDefault();
        let text = $('chat-text').value.trim();
        if (!text)
            return;
        wsLNOB.send({action: 'chat-send', data: {text: text, to: channel || null}});
        $('chat-text').value = '';
    });
    // Entrée envoie, Maj+Entrée va à la ligne
    $('chat-text').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            $('chat-form').requestSubmit();
        }
    });

    players = (JSON.parse($('lobby').dataset.state).players) || [];
    renderChannels();
    renderMessages();
    wsLNOB.send({action: 'chat-history'});
})();
