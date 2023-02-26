// ACTIONS ON PLAYER TABS

function doPlayerRoll(e) {

    let data = e.detail.data;

    if (data.module !== "") {
        document.getElementById('roll-1-'+data.discord_id).checked = false;
        document.getElementById('roll-2-'+data.discord_id).checked = true;
    }
    else {
        document.getElementById('roll-2-'+data.discord_id).checked = false;
        document.getElementById('roll-1-'+data.discord_id).checked = true;
    }

    let i=20;
    let rollDiv = document.getElementById('p'+ data.discord_id+'-roll');

    rollDiv.classList.remove('success');
    rollDiv.classList.remove('fail');
    let randomDisp = setInterval(function() {
        rollDiv.innerText = Math.floor(Math.random()*99).toString();
        i--;
        if (i<0) {
            rollDiv.innerText = data.result;
            rollDiv.classList.add((data.success ? 'success' : 'fail'));
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

    newValue = Math.min(Math.max(newValue, 0), 100);

    let statVal = document.querySelector('#player-tab'+id+' .'+stat+' .player-stat-value');
    statVal.innerText = newValue;
    wsLNOB.setStatistic(id, stat, newValue);
}

document.addEventListener('roll', doPlayerRoll);

function initialiseItemExpand() {
    document.querySelectorAll(".expander-item").forEach(function (e) {
        e.addEventListener('mouseup', function () {
            this.lastElementChild.classList.toggle("itemshow");
        })
    })
}

function initialisePlayerExpander() {
    document.querySelectorAll(".expander").forEach(function (e) {
        e.addEventListener('mouseup', function () {
            this.parentElement.classList.toggle('move-up')
        })
    })
}