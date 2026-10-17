function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getShip() {
    const rawResponse = await fetch('/api/ship', {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
    });
    return JSON.parse(await rawResponse.text());
}
var detectionPoints;
function scanPoints() { //calcul points de detec
    // Labo de planètes (/planet-lab) : scans illimités
    if (window.PLANET_LAB) {
        detectionPoints = Infinity;
        return;
    }
    let scan = parseInt(document.getElementById('dial-scanner').getAttribute('data-value'))
    console.log(scan)
    detectionPoints = Math.floor(scan / 16) * 2;
    let remain = scan % 16;
    let luck = Math.random() * 16;
    if (remain > luck) {
        detectionPoints += 2
    }
    detectionPoints = (Math.min(detectionPoints, 12));
    console.log(detectionPoints)
}

var o2 = document.getElementById('pointso2');
var cl = document.getElementById('pointscl');
var ff = document.getElementById('pointsff');
var re = document.getElementById('pointsre');
var gr = document.getElementById('pointsgr');
var eau = document.getElementById('pointseau');

var costo2 = o2.innerText; //coût en points de detection
var costcl = cl.innerText;//coût en points de detection
var costff = ff.innerText;//coût en points de detection
var costre = re.innerText;//coût en points de detection
var costgr = gr.innerText;//coût en points de detection
var costeau = eau.innerText;//coût en points de detection

var valueo2 = o2.getAttribute('data-value');
var valuecl = cl.getAttribute('data-value');
var valuefaune = ff.getAttribute('data-fauvalue');
var valueflore = ff.getAttribute('data-flovalue');
var valueciv = ff.getAttribute('data-civvalue');
var valuere = re.getAttribute('data-value');
var valuegr = gr.getAttribute('data-value');
var valueeau = eau.getAttribute('data-value');

const oxyValTab = [0,0.2,0.4,0.6,0.8,1];
const clValTab = [0,0.25,0.5,0.75,1];
const fauneValTab = [0,0.25,0.5,0.75,1];
const floreValTab = [0,0.25,0.5,0.75,1];
const civValTab = [0,0.1,0.2,0.8,1];
const reValTab = [0,0.2,0.4,0.6,0.8,1];
const grValTab = [0,0.3,0.6,0.8,1];
const eauValTab = [0,0.2,0.3,0.4,0.6,0.8,1];

var texto2 = getPlanetText('oxy',valueo2,oxyValTab);
var textcl = getPlanetText('cli',valuecl,clValTab);
var textff = getPlanetText('fau',valuefaune,fauneValTab) +'\ '+ getPlanetText('flo',valueflore,floreValTab) +'\ '+ getPlanetText('civ',valueciv,civValTab);
var textre = getPlanetText('res',valuere,reValTab);
var texteau = getPlanetText('eau',valueeau,eauValTab);
var textgr = getPlanetText('gra',valuegr,grValTab,true);

var costList = [costo2, costcl, costff, costre, costeau, costgr,];
var showbuttons = false;
var dronenbr = document.querySelector('#planet-line-2 .drone').innerText || 0;
var iswritting = 0;
var droneUse = false;

function writePoints(place, number) {
    document.querySelector(place).innerText = number === Infinity ? '∞' : String(number);
};

function getPlanetText(name,value,valueList,isgrav = false){
    let i=0;
    while (value>valueList[i+1]*100){
        i++
    }
    if (isgrav && i<2){
        if (value%2 == 0){
            return lang.card_vars.planet_text.module[name]['value'+i]['pair']
        }
        else
            return lang.card_vars.planet_text.module[name]['value'+i]['impair']
    }
    else
        return lang.card_vars.planet_text.module[name]['value'+i]
}

async function initialisePlanet() {
    scanPoints()
    writePoints('.detection-point', detectionPoints);
    writePoints('.drone', dronenbr);
    announcePlanet();
}

// Joueurs en ligne : la page annonce son état (points de détection, drones,
// scans faits, planetScan.js) et les scans pour lesquels voter (votes.js).
// Le MJ scanne toujours lui-même.
const PLANET_SCANS = [
    {key: 'oxy', label: 'Oxygène', button: '#o2-button', cost: () => costo2, text: () => texto2},
    {key: 'cli', label: 'Climat', button: '#cl-button', cost: () => costcl, text: () => textcl},
    {key: 'ff', label: 'Faune & flore', button: '#ff-button', cost: () => costff, text: () => textff},
    {key: 'res', label: 'Ressources & minerais', button: '#re-button', cost: () => costre, text: () => textre},
    {key: 'wtr', label: 'Présence d\'eau', button: '#eau-button', cost: () => costeau, text: () => texteau},
    {key: 'grv', label: 'Gravité', button: '#gr-button', cost: () => costgr, text: () => textgr}
];
const PLANET_EXITS = [
    {key: 'land', label: 'Atterrir sur la planète', button: '.land-button'},
    {key: 'leave', label: 'Continuer votre voyage', button: '.leave-button'}
];
const planetRevealed = new Set();
var planetVoteChoices = [];

function announcePlanet() {
    if (window.PLANET_LAB || typeof wsLNOB === 'undefined')
        return;
    let cardId = window.PLANET_DATA ? PLANET_DATA.id : null;
    let drones = Number(dronenbr) || 0;
    wsLNOB.send({action: 'planet-screen', data: {
        cardId: cardId,
        points: detectionPoints,
        drones: drones,
        done: showbuttons,
        scans: PLANET_SCANS.map(s => ({key: s.key, cost: Number(s.cost()) || 0, revealed: planetRevealed.has(s.key), text: planetRevealed.has(s.key) ? s.text() : ''}))
    }});
    planetVoteChoices = PLANET_SCANS.filter(s => !planetRevealed.has(s.key) && (detectionPoints >= Number(s.cost()) || drones > 0))
        .concat(showbuttons ? PLANET_EXITS : []);
    wsLNOB.send({action: 'card-screen', data: {cardId: cardId, text: '', choices: planetVoteChoices.map(c => c.label)}});
}

// Votes des joueurs affichés sur les boutons (scans, atterrir, repartir)
document.addEventListener('votes', function (e) {
    let counts = (e.detail.data && e.detail.data.counts) || [];
    document.querySelectorAll('[data-votes]').forEach(b => b.removeAttribute('data-votes'));
    planetVoteChoices.forEach(function (choice, i) {
        let button = document.querySelector(choice.button);
        if (button && counts[i])
            button.setAttribute('data-votes', counts[i] + (counts[i] > 1 ? ' votes' : ' vote'));
    });
});
document.addEventListener('planet-reveal', function (e) {
    planetRevealed.add(e.detail);
    announcePlanet();
});
document.addEventListener('ws-reconnect', announcePlanet);
// Le MJ atterrit ou repart : votes fermés
PLANET_EXITS.forEach(function (exit) {
    let button = document.querySelector(exit.button);
    if (button)
        button.addEventListener('mousedown', function () {
            let i = planetVoteChoices.indexOf(exit);
            if (i >= 0 && typeof wsLNOB !== 'undefined')
                wsLNOB.send({action: 'card-screen', data: {cardId: window.PLANET_DATA ? PLANET_DATA.id : null, text: '', choices: planetVoteChoices.map(c => c.label), chosen: i}});
        });
});
window.addEventListener('load', initialisePlanet, false);

function pointsLeft() {
    showbuttons = true
    for (let i = 0; i < costList.length; i++) {
        if (detectionPoints >= costList[i]) {
            showbuttons = false
        }
    }
}
async function showbuttons_fun() {
    if (showbuttons) {
        while (iswritting > 0) {
            await sleep(100)
        }
        document.querySelector('.land-button').classList.add('show-buttons')
        document.querySelector('.leave-button').classList.add('show-buttons')
    }
}


async function initialisePlayerTab() {
    var playerTab = document.querySelectorAll('.player-tab');
    for (let i = 0; i < playerTab.length; i++) {
        playerTab.item(i).classList.remove('load-in');
        await sleep(100)
    }
}

window.addEventListener('load', initialisePlayerTab, false);


async function write(fulltext, place) {
    iswritting++
    let currenttext = ''
    for (let i = 0; i <= fulltext.length; i++) {
        document.querySelector(place).innerText = currenttext;
        currenttext += fulltext.substring(i, i + 1)
        await sleep(30)
    }
    iswritting--
}

(function () {
    let tree = document.querySelectorAll('.ff-tree')
    let cloud = document.querySelectorAll('.cl-cloud')
    let cloudshadow = document.querySelectorAll('.cloudshadow')
    let mountain = document.querySelectorAll('.re-mountain')
    let mountainstar = document.querySelectorAll('.re-background')
    let txt = document.querySelectorAll('.p-txt')
    document.querySelector('.o2-txt').addEventListener('mouseup', async function () {
        if (detectionPoints >= costo2 || droneUse) {
            document.querySelector('#o2-button').disabled = 'disabled'
            if (!droneUse) {
                detectionPoints = detectionPoints - costo2;
            }
            else {
                document.querySelector('.cursor').classList.add('o2-cursor')
                droneUse = !droneUse;
                droneCursor = document.querySelector('.transparent')
                await sleep(500)
                droneCursor = document.querySelector('.position')
                document.querySelector('.o2-pulsebox').classList.add('pulse')
                document.querySelector('.use-drone').classList.toggle('switch-on')
                document.querySelector('.cursor').classList.toggle('visible')
                document.querySelector('.drone-svg').classList.remove('cursor-on-txt')
                dronenbr--;
                wsLNOB.delItem('drone');
                writePoints('.drone', dronenbr);
                document.querySelector('.cursor').classList.remove('o2-cursor')
            }
            writePoints('.detection-point', detectionPoints);
            let index = costList.indexOf(costo2)
            costList.splice(index, 1);
            pointsLeft();
            document.querySelector('#rond1').classList.add('rond1');
            document.querySelector('#rond2').classList.add('rond2');
            document.querySelector('.o2-blur').classList.add('blurring');
            document.querySelector('.o2-line').classList.add('trace-o2-line');
            document.querySelector('.o2-line2').classList.add('trace-o2-line2');
            document.querySelector('.o2-linedot').classList.add('trace-o2-linedot');
            document.querySelector('#reading-1').classList.remove('scanning');
            document.querySelector('#pointso2').classList.add('display-off');
            write(texto2, '#reading-1');
            document.dispatchEvent(new CustomEvent('planet-reveal', {detail: 'oxy'}));
            showbuttons_fun();
        }
    })
    document.querySelector('.ff-txt').addEventListener('mouseup', async function () {
        if (detectionPoints >= costff || droneUse) {
            document.querySelector('#ff-button').disabled = 'disabled'
            if (!droneUse) {
                detectionPoints = detectionPoints - costff;
            }
            else {
                document.querySelector('.cursor').classList.add('ff-cursor')
                droneCursor = document.querySelector('.transparent')
                droneUse = !droneUse;
                await sleep(500)
                droneCursor = document.querySelector('.position')
                document.querySelector('.ff-pulsebox').classList.add('pulse')
                document.querySelector('.use-drone').classList.toggle('switch-on')
                document.querySelector('.cursor').classList.toggle('visible')
                document.querySelector('.drone-svg').classList.remove('cursor-on-txt')
                dronenbr--;
                wsLNOB.delItem('drone');
                writePoints('.drone', dronenbr);
                document.querySelector('.cursor').classList.remove('ff-cursor')
            }
            writePoints('.detection-point', detectionPoints);
            let index = costList.indexOf(costff)
            costList.splice(index, 1);
            pointsLeft();
            document.querySelector('.ff-line').classList.add('trace-ff-line')
            document.querySelector('.ff-line2').classList.add('trace-ff-line2')
            document.querySelector('.ff-linedot').classList.add('trace-ff-linedot')
            for (let i = 0; i < tree.length; i++) {
                tree.item(i).classList.add('trace-tree' + i);
            }
            document.querySelector('#reading-3').classList.remove('scanning')
            document.querySelector('#pointsff').classList.add('display-off');
            write(textff, '#reading-3')
            document.dispatchEvent(new CustomEvent('planet-reveal', {detail: 'ff'}));
            showbuttons_fun();
        }
    })
    document.querySelector('.cl-txt').addEventListener('mouseup', async function () {
        if (detectionPoints >= costcl || droneUse) {
            document.querySelector('#cl-button').disabled = 'disabled'
            if (!droneUse) {
                detectionPoints = detectionPoints - costcl;
            }
            else {
                document.querySelector('.cursor').classList.add('cl-cursor')
                droneUse = !droneUse;
                droneCursor = document.querySelector('.transparent')
                await sleep(500)
                droneCursor = document.querySelector('.position')
                document.querySelector('.cl-pulsebox').classList.add('pulse')
                document.querySelector('.use-drone').classList.toggle('switch-on')
                document.querySelector('.cursor').classList.toggle('visible')
                document.querySelector('.drone-svg').classList.remove('cursor-on-txt')
                dronenbr--;
                wsLNOB.delItem('drone');
                writePoints('.drone', dronenbr);
                document.querySelector('.cursor').classList.remove('cl-cursor')
            }
            writePoints('.detection-point', detectionPoints);
            let index = costList.indexOf(costcl)
            costList.splice(index, 1);
            pointsLeft();
            document.querySelector('.cl-line').classList.add('trace-cl-line')
            document.querySelector('.cl-line2').classList.add('trace-cl-line2')
            document.querySelector('.cl-linedot').classList.add('trace-cl-linedot')
            for (let i = 0; i < cloud.length; i++) {
                cloud.item(i).classList.add('trace-cloud' + i);
            }
            for (let i = 0; i < cloudshadow.length; i++) {
                cloudshadow.item(i).classList.add('trace-cloudshadow');
            }
            document.querySelector('#reading-2').classList.remove('scanning')
            document.querySelector('#pointscl').classList.add('display-off');
            write(textcl, '#reading-2')
            document.dispatchEvent(new CustomEvent('planet-reveal', {detail: 'cli'}));
            showbuttons_fun();
        }
    })
    document.querySelector('.eau-txt').addEventListener('mouseup', async function () {
        if (detectionPoints >= costeau || droneUse) {
            document.querySelector('#eau-button').disabled = 'disabled'
            if (!droneUse) {
                detectionPoints = detectionPoints - costeau;
            }
            else {
                document.querySelector('.cursor').classList.add('eau-cursor')
                droneUse = !droneUse;
                droneCursor = document.querySelector('.transparent')
                await sleep(500)
                droneCursor = document.querySelector('.position')
                document.querySelector('.eau-pulsebox').classList.add('pulse')
                document.querySelector('.use-drone').classList.toggle('switch-on')
                document.querySelector('.cursor').classList.toggle('visible')
                document.querySelector('.drone-svg').classList.remove('cursor-on-txt')
                dronenbr--;
                wsLNOB.delItem('drone');
                writePoints('.drone', dronenbr);
                document.querySelector('.cursor').classList.remove('eau-cursor')
            }
            writePoints('.detection-point', detectionPoints);
            let index = costList.indexOf(costeau)
            costList.splice(index, 1);
            pointsLeft();
            document.querySelector('.eau-line').classList.add('trace-eau-line')
            document.querySelector('.eau-line2').classList.add('trace-eau-line2')
            document.querySelector('.eau-linedot').classList.add('trace-eau-linedot')
            document.querySelector('.eau-fill').classList.add('trace-eau-fill')
            document.querySelector('.eau-border').classList.add('trace-eau-border')

            document.querySelector('#reading-5').classList.remove('scanning')
            document.querySelector('#pointseau').classList.add('display-off');
            write(texteau, '#reading-5')
            document.dispatchEvent(new CustomEvent('planet-reveal', {detail: 'wtr'}));
            showbuttons_fun();
        }
    })
    document.querySelector('.re-txt').addEventListener('mouseup', async function () {
        if (detectionPoints >= costre || droneUse) {
            document.querySelector('#re-button').disabled = 'disabled'
            if (!droneUse) {
                detectionPoints = detectionPoints - costre;
            }
            else {
                document.querySelector('.cursor').classList.add('re-cursor')
                droneUse = !droneUse;
                droneCursor = document.querySelector('.transparent')
                await sleep(500)
                droneCursor = document.querySelector('.position')
                document.querySelector('.re-pulsebox').classList.add('pulse')
                document.querySelector('.use-drone').classList.toggle('switch-on')
                document.querySelector('.cursor').classList.toggle('visible')
                document.querySelector('.drone-svg').classList.remove('cursor-on-txt')
                dronenbr--;
                wsLNOB.delItem('drone');
                writePoints('.drone', dronenbr);
                document.querySelector('.cursor').classList.remove('re-cursor')
            }
            writePoints('.detection-point', detectionPoints);
            let index = costList.indexOf(costre)
            costList.splice(index, 1);
            pointsLeft();
            document.querySelector('.re-line').classList.add('trace-re-line')
            document.querySelector('.re-line2').classList.add('trace-re-line2')
            document.querySelector('.re-linedot').classList.add('trace-re-linedot')
            for (let i = 0; i < mountain.length; i++) {
                mountain.item(i).classList.add('trace-mountain' + i);
            }
            for (let i = 0; i < mountainstar.length; i++) {
                mountainstar.item(i).classList.add('trace-re-background');
            }
            document.querySelector('#reading-4').classList.remove('scanning')
            document.querySelector('#pointsre').classList.add('display-off');
            write(textre, '#reading-4')
            document.dispatchEvent(new CustomEvent('planet-reveal', {detail: 'res'}));
            showbuttons_fun();
        }
    })
    document.querySelector('.gr-txt').addEventListener('mouseup', async function () {
        if (detectionPoints >= costgr || droneUse) {
            document.querySelector('#gr-button').disabled = 'disabled';
            if (!droneUse) {
                detectionPoints = detectionPoints - costgr;
            }
            else {
                document.querySelector('.cursor').classList.add('gr-cursor')
                droneUse = !droneUse;
                droneCursor = document.querySelector('.transparent')
                await sleep(500)
                droneCursor = document.querySelector('.position')
                document.querySelector('.gr-pulsebox').classList.add('pulse')
                document.querySelector('.use-drone').classList.toggle('switch-on')
                document.querySelector('.cursor').classList.toggle('visible')
                document.querySelector('.drone-svg').classList.remove('cursor-on-txt')
                dronenbr--;
                wsLNOB.delItem('drone');
                writePoints('.drone', dronenbr);
                document.querySelector('.cursor').classList.remove('gr-cursor')
            }
            writePoints('.detection-point', detectionPoints);
            let index = costList.indexOf(costgr)
            costList.splice(index, 1);
            pointsLeft();
            document.querySelector('.gr-line').classList.add('trace-gr-line')
            document.querySelector('.gr-line2').classList.add('trace-gr-line2')
            document.querySelector('.gr-linedot').classList.add('trace-gr-linedot')
            document.querySelector('.gr-circle').classList.add('trace-gr-circle')
            document.querySelector('#reading-6').classList.remove('scanning')
            document.querySelector('#pointsgr').classList.add('display-off');
            write(textgr, '#reading-6')
            document.dispatchEvent(new CustomEvent('planet-reveal', {detail: 'grv'}));
            showbuttons_fun();
        }
    })
    document.querySelector('.use-drone').addEventListener('mouseup', async function () {
        if (dronenbr > 0) {
            droneUse = !droneUse;
            document.querySelector('.use-drone').classList.toggle('switch-on') //class pour le visuel
            document.querySelector('.cursor').classList.toggle('visible')
        }
    })
    for (let i = 0; i < txt.length; i++) {
        txt.item(i).addEventListener('mouseover', function () {
            document.querySelector('.drone-svg').classList.add('cursor-on-txt')
        })
        txt.item(i).addEventListener('mouseleave', function () {
            document.querySelector('.drone-svg').classList.remove('cursor-on-txt')
        })
    }
})();


let index = 0,
    interval = 1000;

const rand = (min, max) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

const animate = star => {
    star.style.setProperty("--star-left", `${rand(-10, 100)}%`);
    star.style.setProperty("--star-top", `${rand(-40, 80)}%`);

    star.style.animation = "none";
    star.offsetHeight;
    star.style.animation = "";
}

for (const star of document.getElementsByClassName("magic-star")) {
    setTimeout(() => {
        animate(star);

        setInterval(() => animate(star), 2500);
    }, index++ * (interval / 3))
}

var droneCursor = document.querySelector('.position');

window.onmousemove = e => {
    const x = e.clientX + droneCursor.offsetWidth / 2,
        y = e.clientY + droneCursor.offsetHeight / 2;

    droneCursor.style.transform = `translate(${x}px, ${y}px)`;
}

