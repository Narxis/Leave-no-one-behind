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

async function doPlayerEmote(e) {
    let data = e.detail;
    let rollDiv = document.getElementById('p'+ data.uid+'-roll');
    let oldVal = rollDiv.innerText;

    rollDiv.style.transition = '0.2s';
    await sleep(10);
    rollDiv.style.color = 'transparent';
    await sleep(200);
    if (data.type === 'glyph')
        rollDiv.style.color = 'inherit';
    rollDiv.innerHTML = data.emoji;
    await sleep(2000);
    if (data.type === 'glyph')
        rollDiv.style.color = 'transparent';
    await sleep(200);
    rollDiv.innerHTML = oldVal;
    rollDiv.style.color = 'inherit';
    await sleep(200);
    rollDiv.style.transition = 'none';
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

document.addEventListener('emote', doPlayerEmote);
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
// Nom long sur l'en-tête d'une carte : la police rétrécit jusqu'à 12px, puis le
// nom est coupé par « … » (nom complet au survol)
function fitPlayerName(tab) {
    let text = tab.querySelector('.player-name-text');
    if (!text)
        return;
    text.style.fontSize = '';
    let size = parseFloat(getComputedStyle(text).fontSize);
    while (text.scrollWidth > text.clientWidth + 1 && size > 12) {
        size -= .5;
        text.style.fontSize = size + 'px';
    }
}

(function () {
    const fitAll = () => document.querySelectorAll('.player-tab').forEach(fitPlayerName);
    fitAll();
    // La police Jura arrive après le premier rendu : on remesure
    if (document.fonts)
        document.fonts.ready.then(fitAll);
    window.addEventListener('resize', fitAll);
})();
