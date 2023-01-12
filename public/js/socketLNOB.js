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

                switch (resp.action) {
                    case 'roll':
                        this.roll(resp.data);
                        break;
                }
            }
            catch {
                console.log(event.data)
            }
        }
    }

    send(data) {
        this.socket.send(JSON.stringify(data));
    }

    rollDice(player_id, stat, module) {
        let payload = {
            action: 'roll',
            data: {
                player_id: player_id,
                stat: stat,
                module: module
            }
        }
        this.send(payload);
    }

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

    setStatus(name, value) {
        let payload = {
            action: 'setStatus',
            data: {
                name: name,
                value: value
            }
        }
        this.send(payload);
    }

    addConso(name) {
        let payload = {
            action: 'conso',
            data: {
                remove: false,
                name: name
            }
        }
        this.send(payload);
    }

    delConso(name) {
        let payload = {
            action: 'conso',
            data: {
                remove: true,
                name: name
            }
        }
        this.send(payload);
    }

    setPlanetDetection(value) {
        let payload = {
            action: 'detection',
            data: {
                value: value
            }
        }
        this.send(payload);
    }

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

    roll(data) {
        if (data.success) {
            console.log('%cPlayer ' + data.player_id + ' : success with a roll of ' + data.dice_result + ' (calculated: ' + data.result + ') on ' + data.stat, 'color:green');
        }
        else {
            console.log('%cPlayer ' + data.player_id + ' : fail with a roll of ' + data.dice_result + ' (calculated: ' + data.result + ') on ' + data.stat, 'color:red');
        }
    }
}