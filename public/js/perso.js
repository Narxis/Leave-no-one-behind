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
        this.closest('.options-affichage').classList.remove('display-options');
    }

    // Même message que le menu Discord (set-race.js) : le serveur enregistre
    // la race puis la renvoie à toutes les pages, qui l'affichent via setRace
    wsLNOB.send({
        action: 'set-race',
        uid: discord_id,
        race: race
    });
}

// Image + description de la race sur la fiche du joueur
function showRace(discord_id, race) {
    let img = document.querySelector('#p' + discord_id + ' .race-img');
    let desc = document.querySelector('#p' + discord_id + ' .race-desc');
    if (img)
        img.onerror = () => { img.onerror = null; img.src = '/img/races/wat.png'; };
        img.src = '/img/races/' + race + '.png';

    // Race active surlignée dans le menu, et son nom en titre de description
    let label = '';
    document.querySelectorAll('#p' + discord_id + ' .race-possible').forEach(li => {
        let active = li.getAttribute('data-name') === race;
        li.classList.toggle('selected', active);
        if (active)
            label = li.textContent;
    });

    if (desc) {
        let text = lang.card_vars[race] ? lang.card_vars[race].desc : '';
        desc.innerHTML = text ? '<div class="race-desc-title">' + label + '</div><p>' + text + '</p>' : '';
    }
}

async function addPlayerSheet (discord_id) {
    let container = document.getElementById('players_create');
    getPlayerSheet(discord_id).then(sheet => {
        let div = document.createElement('div');
        div.innerHTML = sheet.trim();
        let playerSheet = div.firstChild;
        container.append(playerSheet);
        setPlayerRaceListeners(discord_id);
        if (playerSheet.dataset.race)
            showRace(discord_id, playerSheet.dataset.race);
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
    showRace(e.detail.data.uid, e.detail.data.race);
}

async function join(e) {
    await addPlayerSheet(e.detail.uid)
}

function setStats(e) {
    let stats = e.detail.data;

    let id = '#p' + stats.discord_id;

    document.querySelector(id + ' #combat input').value = stats.combat;
    document.querySelector(id + ' #pilotage input').value = stats.pilotage;
    document.querySelector(id + ' #engineering input').value = stats.engineering;
    document.querySelector(id + ' #recon input').value = stats.recon;
    document.querySelector(id + ' #survival input').value = stats.survival;
    document.querySelector(id + ' #moral input').value = stats.moral;
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