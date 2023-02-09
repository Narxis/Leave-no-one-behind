// EDITED 2023-01-17 pour le templating

function setPlayerRaceListeners(discord_id) {
    let playerRaceContainer = document.querySelectorAll('#p'+discord_id+' .race-selector-container');
    let clickImg = document.querySelectorAll('#p'+discord_id+' .select-affichage');
    for (let i = 0; i < clickImg.length; i++) {
        let races = playerRaceContainer.item(i).querySelector('.options-affichage')
        clickImg.item(i).addEventListener('mouseup', function () {
            races.classList.toggle('display-options')
        })
        let race_list = races.querySelectorAll('.race-possible');
        for (let k = 0; k < race_list.length; k++) {
            race_list.item(k).addEventListener('mouseup', setRaceSelect)
        }
    }
}

function setRaceSelect(e=null, race=null, discord_id=null) {

    if (e) {
        if (!race) {
            race = this.getAttribute('data-name');
        }
        if (!discord_id) {
            discord_id = this.closest('.player').id.substring(1);
        }
    }

    let img = document.querySelector('#p' + discord_id + ' .race-img');
    img.src = '/img/races/' + race + '.png';
}

async function addPlayerSheet (discord_id) {
    let container = document.getElementById('players_create');
    getPlayerSheet(discord_id).then(sheet => {
        let div = document.createElement('div');
        div.innerHTML = sheet.trim();
        container.append(div.firstChild);
        setPlayerRaceListeners(discord_id);
    });
}

async function getPlayerSheet(discord_id) {
    const rawResponse = await fetch('/fiche', {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({discord_id: discord_id})
    });
    return rawResponse.text();
}

async function getExistingPlayers() {

    const rawResponse = await fetch('/api/players', {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
    });
    return JSON.parse(await rawResponse.text());
}

function setName(e) {
    document.querySelector('#p'+ e.detail.data.uid + ' .player-name').value = e.detail.data.nick;
}

function setRace(e) {
    let img = document.querySelector('#p' + e.detail.data.uid + ' .race-img');
    img.src = '/img/races/' + e.detail.data.race + '.png';
}

async function join(e) {
    await addPlayerSheet(e.detail.uid)
}

function setStats(e) {
    let stats = e.detail.data;

    document.querySelector('#combat input').value = stats.combat;
    document.querySelector('#pilotage input').value = stats.pilotage;
    document.querySelector('#engineering input').value = stats.engineering;
    document.querySelector('#recon input').value = stats.recon;
    document.querySelector('#survival input').value = stats.survival;
    document.querySelector('#moral input').value = stats.moral;
}

async function loadPlayerSheets() {

    let players = await getExistingPlayers();

    if (players.length > 0)
        document.querySelector('.lecadre').remove();

    for (let i in players) {
        await addPlayerSheet(players[i].discord_id);
    }
}

document.addEventListener('join', join);
document.addEventListener('set-name', setName);
document.addEventListener('set-race', setRace);
document.addEventListener('roll-stats-done', setStats);
document.addEventListener('join', function(){
    document.querySelector('.lecadre').remove();
}, {once : true} )