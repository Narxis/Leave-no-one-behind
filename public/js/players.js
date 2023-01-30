// ACTIONS ON PLAYER TABS

function doPlayerRoll(resp) {

    let i=20;
    let rollDiv = document.getElementById('p'+resp.discord_id+'-roll');
    rollDiv.classList.remove('success');
    rollDiv.classList.remove('fail');
    let randomDisp = setInterval(function() {
        rollDiv.innerText = Math.floor(Math.random()*99).toString();
        i--;
        if (i<0) {
            rollDiv.innerText = resp.result;
            rollDiv.classList.add((resp.success ? 'success' : 'fail'));
            clearInterval(randomDisp);
        }
    },50);
}

function quickUpdateStat(el, id, stat) {

    let currentVal = parseInt(document.querySelector('#player-tab'+id+' .'+stat+' .player-stat-value').innerText);
    let modifier = 1;
    if (el.classList.contains('player-stat-down')) {
        modifier = -1;
    }
    if (this.event.shiftKey) {
        modifier *= 10;
    }
    else if (this.event.ctrlKey) {
        modifier *= 5;
    }
    let newValue = currentVal + modifier;

    setPlayerStat(id, stat, newValue);
}

function setPlayerStat(id, stat, newValue) {
    if (typeof wsLNOB === 'undefined'){
        console.error('YOU MUST INCLUDE socketLNOB.js before this');
    }

    let statVal = document.querySelector('#player-tab'+id+' .'+stat+' .player-stat-value');
    statVal.innerText = newValue;
    wsLNOB.setStatistic(id, stat, newValue);
}