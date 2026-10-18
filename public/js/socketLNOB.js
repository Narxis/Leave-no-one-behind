class SocketLNOB {
    constructor() {
        this.queue = [];
        this.connected = false;
        this.connect();
    }

    // Connexion, et reconnexion automatique si le serveur redémarre : sans
    // ça, une page ouverte restait sourde jusqu'au rechargement
    connect() {
        this.socket = new WebSocket("ws://" + window.location.host);
        this.socket.onopen = () => {
            let reconnected = this.connected;
            this.connected = true;
            for (let data of this.queue.splice(0))
                this.socket.send(data);
            if (reconnected)
                document.dispatchEvent(new CustomEvent('ws-reconnect'));
        };
        this.socket.onclose = () => {
            setTimeout(() => this.connect(), 2000);
        };
        this.socket.onmessage = (event) => {
            try {
                let resp = JSON.parse(event.data);

                if (resp.error) {
                    console.log(resp.error_msg);
                    // Pour qui attend une réponse (fenêtre de dés…)
                    document.dispatchEvent(new CustomEvent('ws-error', {detail: resp}));
                    return false;
                }

                let custom_event = new CustomEvent(resp.action, {detail: resp});
                document.dispatchEvent(custom_event);

                console.log(custom_event);
            }
            catch (e) {
                console.log(event.data);
                console.log(e);
            }
        }
    }

    // Send payload to backend (mis en attente si la connexion est coupée)
    send(data) {
        let payload = JSON.stringify(data);
        if (this.socket.readyState === WebSocket.OPEN)
            this.socket.send(payload);
        else
            this.queue.push(payload);
    }

    // Send a roll request to the backend
    rollDice(discord_id, stat, module) {
        let payload = {
            action: 'roll',
            data: {
                discord_id: discord_id,
                stat: stat,
                module: module
            }
        }
        this.send(payload);
    }

    //Update a module integrity value in DB
    setModule(name, value) {
        let payload = {
            action: 'setModule',
            data: {
                name: name,
                value: value
            }
        }
        this.send(payload);
    }

    //Update a status value in DB
    setStatus(name, value) {
        let payload = {
            action: 'status',
            data: {
                name: name,
                value: value
            }
        }
        this.send(payload);
    }

    // Add a conso in DB
    addItem(slug, qty = 1) {
        let payload = {
            action: 'item',
            data: {
                remove: false,
                slug: slug,
                qty: qty
            }
        }
        this.send(payload);
    }

    // Delete a conso in DB
    delItem(slug, discord_id='') {
        let payload = {
            action: 'item',
            data: {
                discord_id: discord_id,
                remove: true,
                slug: slug
            }
        }
        this.send(payload);
    }

    /**
     * @deprecated // might be calculated from front
     * @param value
     */
    setPlanetDetection(value) {
        let payload = {
            action: 'detection',
            data: {
                value: value
            }
        }
        this.send(payload);
    }

    // Update a player statistic in DB
    setStatistic(player_id, name, value) {
        let payload = {
            action: 'playerStat',
            data: {
                player_id: player_id,
                name: name,
                value: value
            }
        }
        this.send(payload);
    }

    // Post roll action after a /roll (discord) or a this.rollDice
    roll(data) {
        doPlayerRoll(data);
        if (data.success) {
            console.log('%cPlayer ' + data.player_id + ' : success with a roll of ' + data.dice_result + ' (calculated: ' + data.result + ') on ' + data.stat, 'color:green');
        }
        else {
            console.log('%cPlayer ' + data.player_id + ' : fail with a roll of ' + data.dice_result + ' (calculated: ' + data.result + ') on ' + data.stat, 'color:red');
        }
    }

    triggerCustomEvent(eventName, eventData) {
        let payload = {
            action: 'passThrough',
            data: {
                action: eventName,
                data: eventData
            }
        }
        this.send(payload);
    }
}

const wsLNOB = new SocketLNOB();