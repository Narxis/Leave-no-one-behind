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
                    case 'join':
                        this.actionJoin(resp);
                        break;
                    case 'set-race':
                        this.setRace(resp);
                        break;
                    case 'set-name':
                        this.setName(resp);
                        break;
                    case 'roll-stats':
                        this.setRollPlayerStats(resp);
                        break;
                    case 'playerStat':
                        this.playerStatUpdatedAction(resp.data);
                        break;
                }
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

    // After player joined with /join (discord)
    actionJoin(resp) {
        addPlayerSheet(resp.uid).then();
    }

    // After a player rolled a stat with /create (discord)
    setRollPlayerStats(response) {
        // TODO implement front interaction to a player roll
        console.log(response);
    }

    // After a stat has been updated in DB with this.setStatistic()
    playerStatUpdatedAction(response) {
        console.log(response);
    }

    // After a player chose a race with /create (discord)
    setRace(response) {
        setPlayerRace(null, response.data.race, response.data.uid);
    }

    // After a player chose a name with /create (discord)
    setName(response) {
        console.log(response);
        console.log(document.querySelector('#p'+ response.data.uid + ' .player-name'));
        document.querySelector('#p'+ response.data.uid + ' .player-name').value = response.data.nick;
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
            action: 'setStatus',
            data: {
                name: name,
                value: value
            }
        }
        this.send(payload);
    }

    // Add a conso in DB
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

    // Delete a conso in DB
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