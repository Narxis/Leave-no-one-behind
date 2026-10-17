var currentCard = {};
var interval_cd;
var countDownRunning = false;
// Pendant un combat (combat.js), le compte à rebours est en pause
var countDownPaused = false;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getActiveStatus () {
    const rawResponse = await fetch('/api/statuses/active', { // faudra rajouter /active
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
    });
    return JSON.parse(await rawResponse.text());
}

async function getNextCard (pop=false) {
    const rawResponse = await fetch('/api/nextCard/'+(pop ? 'pop' : 'get'), {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
    });

    return JSON.parse(await rawResponse.text());
}

async function getCardByName (name) {
    const rawResponse = await fetch('/api/nextCard/get/' + name, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
    });

    return JSON.parse(await rawResponse.text());
}

function startCountDown() {

    let time_left = 30;
    countDownRunning = true;

    const tick = async function () {
        if (countDownPaused)
            return;
        if (time_left > 0) {
            TimerAnim.tick(time_left);
            time_left--;
            return;
        }
        clearInterval(interval_cd);
        countDownRunning = false;
        let choicetab = document.getElementById('choicetab');
        TimerAnim.tick(0);
        choicetab.style.pointerEvents = 'none';
        await sleep(500);
        await hideChoices();
        choicetab.style.pointerEvents = '';
        await TimerAnim.finish();
        currentCard.choices = currentCard.choices.slice(-1);
        await showChoices();
    };
    tick();
    interval_cd = setInterval(tick, 1000);
}

async function stopCountdown() {
    if (typeof interval_cd !== 'undefined' && countDownRunning) {
        clearInterval(interval_cd);
        countDownRunning = false;
        await TimerAnim.cancel();
    }
}

// Appelé par combat.js : le chrono s'arrête au début du combat et repart
// de là où il en était à la fin
function pauseCountDown(paused) {
    countDownPaused = !!paused;
}

async function initialiseModTabs() {
    var mod = document.getElementById('modtab');
    var modTabs = mod.getElementsByClassName('tab');

    for (let i = 0; i < modTabs.length; i++) {
        await sleep(100);
        modTabs.item(i).classList.remove('move-right');
    }
}
async function initialisePlayerTab() {
    var playerTab = document.querySelectorAll('.player-tab');
    for (let i = 0; i < playerTab.length; i++) {
        playerTab.item(i).classList.remove('load-in');
        await sleep(100)
    }
}
async function initialiseleLeftTabs() {
    var consommableTabVar = document.getElementsByClassName('consommable-tab');
    var todoListVar = document.getElementsByClassName('todoList');
    var modsLeftVar = document.getElementsByClassName('mods-left');
    await sleep(1000);
    consommableTabVar.item(0).classList.remove('slide-right');
    todoListVar.item(0).classList.remove('hidden');
    modsLeftVar.item(0).classList.remove('hidden');
}

async function initialiseStatusList (){
    var activeStatus = await getActiveStatus();

    activeStatusList = [];
    document.querySelector(".status").innerHTML = '<div class="status-title-line">\<div class="status-title1">Status :</div><div class="status-title2">Durée</div></div>';
    for (let i=0; i<activeStatus.length; i++){
        addStatus(activeStatus[i]);
        activeStatusList.push(activeStatus[i].slug)
    }
}

// Le coffre est redessiné par l'événement « inventory » (inventory.js)
function removeStarterItem(id, slug) {
    wsLNOB.delItem(slug, id);
}

function quickUpdateModule(el, mod, left=false) {
    let currentVal;
    let input;
    let inputVal='';
    let isCryopods = mod === 'cryopods';
    let maxVal = isCryopods ? 1000 : 100;
    if (left) {
        currentVal = parseInt(document.querySelector('#'+mod+'-value').innerText) || 0;
    }
    else {
        currentVal = parseInt(document.querySelector('#modtab #dial-'+mod).getAttribute('data-value')) || 0;
        input = document.getElementsByName('i-'+ mod)[0];
        inputVal = input.value;
    }
    let modifier = 1;
    let newValue;

    if (el.classList.contains(left ? 'moins' : 'tab-moins')) {
        modifier = -1;
    }

    if (isCryopods)
        modifier *= 5;

    if (inputVal !== ''){
        modifier *= inputVal;
    }
    else {
        if (this.event.shiftKey) {
            modifier *= isCryopods ? 20 : 10;
        }
        else if (this.event.ctrlKey) {
            modifier *= isCryopods ? 2 : 5;
        }
    }

    newValue = currentVal + modifier;
    if (input)
        input.value = '';

    newValue = Math.min(Math.max(newValue, 0), maxVal);
    if (currentVal === newValue) return;

    setModuleVal(mod, newValue, left);
}

// Choix qui coûtent (ou rapportent) des humains : appliqué au clic
function changeHumans(delta) {
    let counter = document.querySelector('#cryopods-value');
    let current = parseInt(counter.innerText) || 0;
    setModuleVal('cryopods', current + delta, true);

    let pop = document.createElement('div');
    pop.className = 'human-delta ' + (delta < 0 ? 'loss' : 'gain');
    pop.textContent = (delta > 0 ? '+' : '') + delta;
    counter.parentElement.append(pop);
    setTimeout(() => pop.remove(), 1800);
}

function setModuleVal(mod, newValue, left) {
    if (typeof wsLNOB === 'undefined'){
        console.error('YOU MUST INCLUDE socketLNOB.js before this');
    }
    let isCryopods = mod === 'cryopods';
    let maxVal = isCryopods ? 1000 : 100;

    // Une valeur non numérique (case vide, saisie invalide) ne doit jamais
    // être affichée ni envoyée au serveur
    newValue = Number(newValue);
    if (!Number.isFinite(newValue)) return;
    newValue = Math.min(Math.max(newValue, 0), maxVal);

    if (left) {
        let statVal = document.querySelector('#'+mod+'-value');
        statVal.innerText = newValue;
    }
    else {
        let statVal = document.querySelector('#modtab #dial-'+mod);
        statVal.setAttribute('data-value', newValue);

        let tooltip = statVal.querySelector('.mod-button');
        let newTooltip = tooltip.getAttribute('data-tooltip').replace(/\d+%$/, newValue + '%');
        tooltip.setAttribute('data-tooltip', newTooltip)
    }

    wsLNOB.setModule(mod, newValue);
}

const addStatus = (status) => {
    // let index = statusNameList.findIndex(e => e === statusname)
    let svg = statusSvgList[status.slug];

    const html = ` <div class="status-line" id="line_${status.id}">
                        ${svg}
                        <div class="status-name">${status.name}</div>
                        <div class="status-duration">${status.duration}</div>
                    </div>`;
    document.querySelector(".status").innerHTML += html
    // wsLNOB.setStatus(status.slug, status.duration)
}

async function hideChoices() {
    let choicesActive = document.querySelectorAll('#choicetab .choice');

    for (let i = 0; i < choicesActive.length; i++) {
        choicesActive[i].classList.add('move-down');
        await sleep(50);
    }

    await sleep(1000);
    choicesActive.innerHTML = '';
}

async function initCard(forceName = null) {
    if (forceName) {
        currentCard = await getCardByName(forceName);
    }
    else {
        currentCard = await getNextCard(true);
        if (currentCard.type !== -1) {
            fastTravel();
            await sleep(fastTravelTime);
            await sleep(500);
        }
    }
    await initialiseStatusList();
    await writeCardDesc();
    if (currentCard.timer === 1)
        startCountDown();
    await showChoices();
}

async function showChoices() {
    let choiceTab = document.getElementById('choicetab');
    choiceTab.innerHTML = '';
    for (let i=0; i<currentCard.choices.length; i++) {
        let choice = currentCard.choices[i];
        let choiceBtn = document.createElement('button');
        choiceBtn.classList.add('choice');
        choiceBtn.classList.add('move-down');
        choiceBtn.id = 'choice' + i;
        choiceBtn.innerHTML = choice.value;
        choiceBtn.addEventListener('mouseup', async function() {
            stopCountdown();
            if (choice.humans)
                changeHumans(choice.humans);
            await hideChoices();
            let loot = Array.isArray(choice.loot) ? choice.loot : [];
            if (choice.reveal && choice.reveal !== ''){ // NEXT IS REVEAL

               await writeCardDesc(choice.reveal);
               await CardLoot.collect(loot);
               let nextCard = await getNextCard();
               currentCard.choices = [{
                       value: 'Continuer votre chemin',
                       continue: nextCard.value > 0 ? 2 : 1
                   }];
               await showChoices();
            }
            else if (choice.continue && choice.continue === 1) { // NEXT IS CARD
               await initCard();
            }
            else if (choice.continue && choice.continue === 2) { // NEXT IS PLANET ETAPE 1
               let textPlanetEncounter = "\n \u00a0 Votre vaisseau s'approche d'une planète. \n \n \u00a0 Pendant la mise en orbite, vous êtes libre de vous déplacer à bord et de profiter des installations telles que la salle de cinéma, la cuisine, la salle d'entraînement, la bibliothèque, etc... \n \n\u00a0 Dirigez-vous vers la salle des scanners pour obtenir davantage d'informations sur cette planète.";
               await writeCardDesc(textPlanetEncounter);
               currentCard.choices = [{
                   value: 'Aller dans la salle des scanners',
                   continue: 3
               }];
               await showChoices();
            }
            else if (choice.continue && choice.continue === 3) { // NEXT IS PLANET ETAPE 2
                fastTravel();
                await sleep(fastTravelTime);
                window.location.href = '/next';
            }
            else if (choice.next && choice.next !== '') { // NEXT IS FOLLOWUP
               await CardLoot.collect(loot);
               await initCard(choice.next);
            }
        });
        choiceTab.append(choiceBtn);
        await sleep(150);
        choiceBtn.classList.remove('move-down');
    }
}

// Clic sur la carte pendant l'écriture : le texte s'accélère fortement
// (remis à zéro à chaque nouveau texte)
var cardTextFast = false;
var cardTextWriting = false;
const CARD_TEXT_FAST_FACTOR = 15;   // pauses divisées par 15
const CARD_TEXT_FAST_CHARS = 5;     // et 5 caractères par pause

function cardTextPause(ms) {
    return sleep(cardTextFast ? ms / CARD_TEXT_FAST_FACTOR : ms);
}

async function writeCardDesc(text = null) {

    let currentText = '';
    let stopTokenToReplace = '{....}';
    let stopToken = '‡';
    let textDiv = document.querySelector('.card-text');
    text = text || currentCard.desc;
    text = text.replaceAll(stopTokenToReplace, stopToken);
    cardTextFast = false;
    cardTextWriting = true;
    for (let i = 0; i <= text.length; i++) {
        textDiv.innerText = currentText;
        if (text.substring(i, i + 1) === stopToken) {
            for (let j=0; j<4; j++) {
                await cardTextPause(400);
                currentText += '.';
                textDiv.innerText = currentText;
            }
            currentText = '';
            await cardTextPause(500);
        } else {
            currentText += text.substring(i, i + 1)
        }
        if (!cardTextFast || i % CARD_TEXT_FAST_CHARS === 0)
            await cardTextPause(21.7)
    }
    textDiv.innerText = currentText;
    cardTextWriting = false;
}

document.addEventListener('mouseup', function (e) {
    if (cardTextWriting && e.button === 0 && e.target.closest('.container-card'))
        cardTextFast = true;
});

(function(){
    initCard();
    initialiseModTabs();
    initialisePlayerTab();
    initialiseleLeftTabs();
    initialiseItemExpand()
    initialisePlayerExpander()
    initialiseStatusList();
    document.addEventListener('status', initialiseStatusList);
    document.addEventListener('roll',async function(e){
        let player =document.getElementById('player-tab'+e.detail.data.discord_id);
        let iconlist = player.querySelectorAll('.output-absolute');
        for (let i=0; i<iconlist.length; i++){
            iconlist.item(i).classList.add('hide-opacity')
        }
        await sleep(1000);
        player.querySelector('#output-'+e.detail.data.stat).classList.remove('hide-opacity')
    });
})();