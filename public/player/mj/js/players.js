// Généré par scripts/player-assets.js : ne pas modifier à la main
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

// Une stat a changé côté serveur (menu MJ, dégâts en combat) : l'onglet suit
function syncPlayerStats(e) {
    let player = e.detail && e.detail.data;
    if (!player || !player.discord_id)
        return;
    for (let stat of ['combat', 'pilotage', 'engineering', 'survival', 'recon', 'moral']) {
        let value = document.querySelector('#player-tab' + player.discord_id + ' .' + stat + ' .player-stat-value');
        if (value && player[stat] !== undefined)
            value.innerText = player[stat];
    }
}

document.addEventListener('playerStat', syncPlayerStats);

// Le MJ a changé le rôle d'un joueur (fiche des persos) : logo à côté du nom
function syncPlayerRole(e) {
    let data = e.detail && e.detail.data;
    let box = data && document.querySelector('#player-tab' + data.discord_id + ' .player-role');
    if (!box)
        return;
    let role = data.role;
    box.dataset.role = role ? role.slug : '';
    box.title = role ? role.name + ' : ' + role.effect : '';
    box.replaceChildren();
    if (role) {
        let img = document.createElement('img');
        img.src = role.icon;
        img.alt = role.name;
        box.append(img);
    }
    fitPlayerName(box.closest('.player-tab'));
}

// Joueurs qui ont voté pour un choix (votes.js) : le logo de leur rôle, pris
// sur leur onglet, pour voir qui veut aller où ; sans rôle, leur initiale
function voteRoleIcons(voters) {
    let box = document.createElement('span');
    box.className = 'vote-roles';
    for (let voter of voters || []) {
        let tab = document.getElementById('player-tab' + voter.id);
        let logo = tab && tab.querySelector('.player-role img');
        let nameNode = tab && tab.querySelector('.player-name-text');
        let name = voter.name || (nameNode ? nameNode.textContent : '');
        let icon;
        if (logo) {
            icon = document.createElement('img');
            icon.src = logo.src;
            icon.alt = '';
        } else {
            icon = document.createElement('span');
            icon.className = 'vote-initial';
            icon.textContent = (String(name).trim().charAt(0) || '?').toUpperCase();
        }
        icon.classList.add('vote-role');
        icon.title = name;
        box.append(icon);
    }
    return box;
}

document.addEventListener('player-role', syncPlayerRole);
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
// Nom long sur l'en-tête d'une carte : la police rétrécit jusqu'à 13px ; si ça
// ne tient toujours pas (cartes étroites), le nom passe sur deux lignes en 12px
function fitPlayerName(tab) {
    let name = tab.querySelector('.player-name');
    let text = tab.querySelector('.player-name-text');
    if (!name || !text || !text.clientWidth)
        return;
    name.classList.remove('name-wrap');
    text.style.fontSize = text.style.lineHeight = '';
    let size = parseFloat(getComputedStyle(text).fontSize);
    while (text.scrollWidth > text.clientWidth + 1 && size > 13) {
        size -= .5;
        text.style.fontSize = size + 'px';
    }
    if (text.scrollWidth > text.clientWidth + 1) {
        text.style.fontSize = '';
        name.classList.add('name-wrap');
        // Trois lignes nécessaires (mots longs, PNJ à race longue) : un cran plus petit
        if (text.scrollHeight > text.clientHeight + 1) {
            text.style.fontSize = '11px';
            text.style.lineHeight = '11.5px';
        }
    }
}

(function () {
    const fitAll = () => document.querySelectorAll('.player-tab').forEach(fitPlayerName);
    // Une carte qui change de largeur (arrivée d'un PNJ, animation d'entrée,
    // fenêtre redimensionnée) remesure son nom
    let resized = typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(entries => entries.forEach(e => fitPlayerName(e.target))) : null;
    const watch = () => document.querySelectorAll('.player-tab').forEach(tab => {
        if (resized && !tab.dataset.fitWatched) {
            tab.dataset.fitWatched = '1';
            resized.observe(tab);
        }
    });
    watch();
    fitAll();
    let container = document.getElementById('playertabs_container');
    if (container)
        new MutationObserver(() => { watch(); fitAll(); }).observe(container, {childList: true});
    // La police Jura arrive après le premier rendu : on remesure
    if (document.fonts)
        document.fonts.ready.then(fitAll);
    window.addEventListener('resize', fitAll);
})();
