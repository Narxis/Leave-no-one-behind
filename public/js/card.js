var currentCard = {};
var isWritting = false;

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

async function getShip () {
    const rawResponse = await fetch('/api/ship', {
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
    // On récupère le texte dans le timer (en tant qu'entier)
    let time_left = 30;
    // On lance une fonction toutes les secondes (1000ms)
    interval_cd = setInterval(async function () {
        // On change le texte dans le timer (avec un 0 devant si on est en dessous de 10)
        timerText.textContent = (time_left < 10 ? '0' : '') + time_left;
        timerText2.textContent = (time_left < 10 ? '0' : '') + time_left;
        switch (time_left) {
            case 30:
                bigBoite.classList.add('start')
                bigBoite.classList.add('grow')
                bigBoite.classList.add('float')
                break;
            case 28:
                bigBoite.classList.add('idle')
                bigBoite.classList.remove('start')
                break;
            case 10:
                bigBoite.classList.add('flash')
                break;
            case 9:
                await sleep(300)
                bigBoite.classList.remove('flash')
                break;
            case 0:
                clearInterval(interval_cd);
                clickable = false
                console.log('essaye de cliquer pour voir')
                await sleep(500)
                var choice = document.getElementById('choicetab');
                var choiceTabs = choice.getElementsByClassName('choice');
                for (let k = 0; k < choiceTabs.length-1; k++) {
                    choiceTabs.item(k).disabled = 'true'
                    choiceTabs.item(k).classList.add('move-down');
                    choiceTabs.item(k).classList.remove('choice-hover')
                }
                bigBoite.classList.remove('grow')
                bigBoite.classList.add('plop')
                await sleep(100)
                clickable = true
                await sleep(400)
                bigBoite.classList.add('shot')
                await sleep(1520)
                bigBoite.classList.add('show-plugun')
                bigBoite.classList.add('hide-plugun')
                await sleep(250)
                plugShip.classList.remove('shipflotte')
                plugShip.classList.add('bonk')
                await sleep(900)
                plugShip.classList.remove('bonk')
                plugShip.classList.add('comeback')
                await sleep(1200)
                plugShip.classList.add('shipflotte')
                bigBoite.classList.remove('idle')
                bigBoite.classList.add('hide')
                await sleep(300)
                plugShip.classList.remove('comeback')
                break;
        }
        time_left--;

    }, 1000);
}

async function stopCountdown() {
    if (typeof interval_cd !== 'undefined') {
        clearInterval(interval_cd);
        bigBoite.classList.remove("grow");
        bigBoite.classList.remove("flash");
        bigBoite.classList.add("plop");
        await sleep(500);
        bigBoite.classList.remove("idle");
        bigBoite.classList.remove("start");
        bigBoite.classList.add("startnot");
        await sleep(3870);
        bigBoite.classList.remove("startnot");
        bigBoite.classList.remove("plop");
        bigBoite.classList.remove('idle')
        bigBoite.classList.remove('shot')
        bigBoite.classList.remove('show-plugun')
        bigBoite.classList.remove('hide-plugun')
    }
}

async function initialiseChoiceTabs() {
    var choice = document.getElementById('choicetab');
    var choiceTabs = choice.getElementsByClassName('choice');

    for (let i = 0; i < choiceTabs.length; i++) {
        choiceTabs.item(i).classList.remove('move-down');
        await sleep(150);
    }
}
async function initialiseModTabs() {
    var mod = document.getElementById('modtab');
    var modTabs = mod.getElementsByClassName('tab');

    for (let i = 0; i < modTabs.length; i++) {
        await sleep(100);
        modTabs.item(i).classList.remove('move-right');
    }
}
async function initialiseTimerTab() {
    var timerTab = document.getElementsByClassName('timertab');

    for (let i = 0; i < timerTab.length; i++) {
        await sleep(100);
        timerTab.item(i).classList.remove('rotate-90');
        await sleep(31000)
        timerTab.item(i).classList.add('rotate-90');
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
        // applystatus(activeStatus[i])
        addStatus(activeStatus[i]);
        activeStatusList.push(activeStatus[i].slug)
    }
    blackout = activeStatusList.includes("blackout");
}

function removeStarterItem(id, slug) {
    document.querySelector('#player-tab'+id+' .itemlist-line.'+slug).remove();
    wsLNOB.delItem(slug, id);
}

const addNewStatus = (slug, duration) => {
    wsLNOB.setStatus(slug, duration)
}

function quickUpdateModule(el, mod, left=false) {
    let currentVal;
    let input;
    let inputVal='';
    let isCryopods = mod === 'cryopods';
    let maxVal = isCryopods ? 1000 : 100;
    if (left) {
        currentVal = parseInt(document.querySelector('#'+mod+'-value').innerText);
    }
    else {
        currentVal = parseInt(document.querySelector('#modtab #dial-'+mod).getAttribute('data-value'));
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

function setModuleVal(mod, newValue, left) {
    if (typeof wsLNOB === 'undefined'){
        console.error('YOU MUST INCLUDE socketLNOB.js before this');
    }
    let isCryopods = mod === 'cryopods';
    let maxVal = isCryopods ? 1000 : 100;

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

document.addEventListener('roll',async function(e){
    let player =document.getElementById('player-tab'+e.detail.data.discord_id);
    let iconlist = player.querySelectorAll('.output-absolute');
    for (let i=0; i<iconlist.length; i++){
        iconlist.item(i).classList.add('hide-opacity')
    }
    await sleep(1000);
    player.querySelector('#output-'+e.detail.data.stat).classList.remove('hide-opacity')
});

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
    if (forceName)
        currentCard = await getCardByName(forceName);
    else
        currentCard = await getNextCard(true);
    await writeCardDesc();
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
        choiceBtn.innerText = choice.value;
        choiceBtn.addEventListener('mouseup', async function() {
           await hideChoices();
           if (choice.reveal && choice.reveal !== ''){ // NEXT IS REVEAL
               await writeCardDesc(choice.reveal);
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
           else if (choice.continue && choice.continue === 2) { // NEXT IS PLANET
               window.location.href = '/next';
           }
           else if (choice.next && choice.next !== '') { // NEXT IS FOLLOWUP
               await initCard(choice.next);
           }
        });
        choiceTab.append(choiceBtn);
        await sleep(150);
        choiceBtn.classList.remove('move-down');
    }
}

async function writeCardDesc(text = null) {

    let currentText = '';
    text = text || currentCard.desc;
    for (let i = 0; i <= text.length; i++) {
        document.querySelector('.card-text').innerText = currentText;
        currentText += text.substring(i, i + 1)
        await sleep(21.7)
    }
}

(async function(){

    // console.log(currentCard);
    // await initialiseChoiceTabs();
    await initCard();
    await initialiseModTabs();
    await initialisePlayerTab();
    await initialiseleLeftTabs();
    initialiseItemExpand()
    initialisePlayerExpander()
    await initialiseStatusList();
    document.addEventListener('status', initialiseStatusList);
})();