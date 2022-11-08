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

    roll(data) {
        if (data.success) {
            console.log('%cPlayer ' + data.player_id + ' : success with a roll of ' + data.dice_result + ' (calculated: ' + data.result + ') on ' + data.stat, 'color:green');
        }
        else {
            console.log('%cPlayer ' + data.player_id + ' : fail with a roll of ' + data.dice_result + ' (calculated: ' + data.result + ') on ' + data.stat, 'color:red');
        }
    }
}