class SocketLNOB {
    constructor() {
        this.socket = new WebSocket("ws://" + window.location.host);
        this.socket.onmessage = (event) => {
            try {
                let resp = JSON.parse(event.data);

                if (resp.error) {
                    console.log(resp.error_msg);
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

    // Send payload to backend
    send(data) {
        this.socket.send(JSON.stringify(data));
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
    addItem(slug) {
        let payload = {
            action: 'item',
            data: {
                remove: false,
                slug: slug
            }
        }
        this.send(payload);
    }

    // Delete a conso in DB
    delItem(slug) {
        let payload = {
            action: 'item',
            data: {
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
}

const wsLNOB = new SocketLNOB();