function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//variables cartes
var texttimeout = "Temps écoulé. lol";
var textprintednbr = 0;
var cardnbrUntilPlanet = 5;
//variables status
var blackout;
var statushtml = document.querySelector(".status");
//html bouton suivant
var nextbuttonhtml = `<button class="next-button choice move-down" id="next1">Continuer votre chemin</button>`;
// timer 
var interval_cd;
var timerText = document.querySelector('#timer-text');
var timerText2 = document.querySelector('#timer-text2');
var bigBoite = document.querySelector('#bigboite');
var bigBoite2 = document.querySelector('#bigboite2');
var plugShip = document.querySelector('#plugship');
var plugShip2 = document.querySelector('#plugship2');
//TODO remove test ternary at the end of the dev
var nextbuttonhtml2 = `<a href="`+(location.href.endsWith('/next') ? '/next' : '/template-planet')+`"><button class="next-button choice move-down" id="next2">Aller dans la salle des scanners</button></a>`;

//Active status

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

function startCountDown() {
    // On récupère le texte dans le timer (en tant qu'entier)
    let time_left = parseInt(timerText.textContent);
    // On lance une fonction toutes les secondes (1000ms)
    interval_cd = setInterval(async function () {
        // aucune idée, une sorte de magie noire
        time_left = time_left - 1;
        // On change le texte dans le timer (avec un 0 devant si on est en dessous de 10)
        timerText.textContent = (time_left < 10 ? '0' : '') + time_left;
        timerText2.textContent = (time_left < 10 ? '0' : '') + time_left;
        switch (time_left) {
        /* case 30:
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
        case 4:
            await sleep(500)
            bigBoite.classList.remove('grow')
            bigBoite.classList.add('plop')
            break;
        case 3:
            bigBoite.classList.add('shot')
            break;
        case 2:
            await sleep(520)
            bigBoite.classList.add('show-plugun')
            bigBoite.classList.add('hide-plugun')
            await sleep(250)
            plugShip.classList.remove('shipflotte')
            plugShip.classList.add('bonk')
            await sleep(900)
            plugShip.classList.remove('bonk')
            plugShip.classList.add('comeback')
            break;
        case 0:
            await sleep(1200)
            plugShip.classList.remove('comeback')
            plugShip.classList.add('shipflotte')
            bigBoite.classList.remove('idle')
            clearInterval(interval_cd);
            return true;
            break; */
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
                await sleep(500)
                bigBoite.classList.remove('grow')
                bigBoite.classList.add('plop')
                await sleep(500)
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
                return true;
                break;
        }
    }, 1000);
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

function eventchoices() {
    var choice = document.getElementById('choicetab');
    var choiceTabs = choice.getElementsByClassName('choice');
    for (let i = 0; i < choiceTabs.length; i++) {
        if (nextlist[i] !== ""){
            document.querySelector('#choice' + (i)).addEventListener('mouseup', async function () {
                for (let k = 0; k < choiceTabs.length; k++) {
                    choiceTabs.item(k).disabled = 'true'
                    choiceTabs.item(k).classList.add('move-down');
                    choiceTabs.item(k).classList.remove('choice-hover')
                }
                document.querySelector('.card-text').classList.toggle('invisibility')
                await sleep (1100);
                document.querySelector('.card-text').innerHTML = "";
                await sleep (100);
                document.querySelector('.choices').innerHTML = ""
                document.querySelector('.card-text').classList.toggle('invisibility')
                console.log(nextlist[i])
                let nextCard = await getCardByName(''+nextlist[i])
                cardtextstr = nextCard.desc;
                nextlist = nextCard.choices.map(v => v.next);
                choicelist = nextCard.choices.map(v => v.value);
                answerlist = nextCard.choices.map(v => v.reveal);
                textprintednbr = 0;
                write(cardtextstr, '.card-text');
            })    
        }
        else {
            document.querySelector('#choice' + (i)).addEventListener('mouseup', async function () {
                document.querySelector('.card-text').classList.toggle('invisibility')
                document.querySelector('.answer' + (i)).classList.toggle('visibility')
                for (let k = 0; k < choiceTabs.length; k++) {
                    choiceTabs.item(k).disabled = 'true'
                    choiceTabs.item(k).classList.add('move-down');
                    choiceTabs.item(k).classList.remove('choice-hover')
                }
                await sleep(1200)
                if (blackout){
                    write(answerlist[i], '.answer' + (i),'blackout');
                }
                else
                    write(answerlist[i], '.answer' + (i),);
            })
        }
        document.querySelector('#choice' + (i)).addEventListener('mouseover', function () {
            this.classList.add('choice-hover')
        })
        document.querySelector('#choice' +(i)).addEventListener('mouseleave', function () {
            this.classList.remove('choice-hover')
        })
    }
};

async function nextoption() {
    //le currentCardType pour les lieux
    if (textprintednbr === 1) {
        let str;
        let choiceshtml;
        let spanstart = 0;
        let spanend;
        let spancontent;
        if (blackout){
            let blackoutTextverif = false;
            for (let i = 0; i < choicelist.length; i++) {
                str = choicelist[i]
                choiceshtml = `<button class="choice move-down" id="choice${i}"></button>`
                if (str.includes('class=\"blackout\"')){
                    blackoutTextverif = true
                    spanstart = str.indexOf('>', str.indexOf('class=\"blackout\"'));
                    spanend = str.indexOf('>', spanstart+1)
                    spancontent =  str.substring(spanstart+1, spanend)
                    document.querySelector('.choices').innerHTML += choiceshtml
                    document.querySelector('#choice' + i).innerHTML = `<span class="blackout">${spancontent}</span>`
                }
            }
            if (!blackoutTextverif) {
                for (let i = 0; i < choicelist.length; i++) {
                    choiceshtml = `<button class="choice move-down" id="choice${i}"></button>`
                    document.querySelector('.choices').innerHTML += choiceshtml
                    document.querySelector('#choice'+ i).innerHTML = choicelist[i]
                }
            }
        }
        else {
            for (let i = 0; i < choicelist.length; i++) {
                str = choicelist[i]
                choiceshtml = `<button class="choice move-down" id="choice${i}"></button>`
                spanend = str.indexOf('<', spanstart+1)
                console.log(spanend,'spanend line243')
                spancontent =  str.substring(spanstart, spanend)
                if (spanend == -1) {
                    spancontent = str
                }
                document.querySelector('.choices').innerHTML += choiceshtml
                document.querySelector('#choice'+ i).innerHTML = `<span class="base-text">${spancontent}</span>`
            }
        }
        await sleep(500)
        initialiseChoiceTabs();
        startCountDown();
        initialiseTimerTab();
        eventchoices();
    }
    if (textprintednbr === 2) {
        document.querySelector('.choices').innerHTML = nextbuttonhtml
        await sleep(100)//ça marche pas sans on pose pas de question
        document.querySelector('.choice').classList.remove('move-down')
        initialiseNextButton()

    }
    if (textprintednbr === 3) {
        document.querySelector('.choices').innerHTML = nextbuttonhtml2
        await sleep(100)//ça marche pas sans on pose pas de question
        document.querySelector('.choice').classList.remove('move-down')
        initialiseNextButton()
    }
}

async function write(fulltext, place, spanclass='base-text') {
    let currenttext = '';
    let start = -1 ;
    document.querySelector(place).innerHTML = `<span class =\"${spanclass}\"></span>`
    if (fulltext.includes(''+spanclass)) {
        start = fulltext.indexOf('>', fulltext.indexOf(''+spanclass));
    }
    // console.log(start)
    for (let i = start+1; i <= fulltext.length; i++) {
        document.querySelector(place).querySelector('.'+spanclass).innerText = currenttext;
        if (fulltext.substring(i, i + 1) == "<") {
            i = fulltext.length
        }
        currenttext += fulltext.substring(i, i + 1)
        await sleep(30)
    }
    textprintednbr += 1;
    nextoption();
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

async function initialiseNextButton() {

    document.querySelector('.next-button').addEventListener('mouseover', function () {
        this.classList.add('choice-hover')
    })
    document.querySelector('.next-button').addEventListener('mouseleave', function () {
        this.classList.remove('choice-hover')
    })
    document.querySelector('#next1').addEventListener('mouseup', async function () {

        let nextCard = await getNextCard();

        if (nextCard.type === 0) {
            console.log("NEXT IS PLANET");
            //hide text animation and 'next-button'
            document.querySelector('.next-button').disabled = 'true'
            document.querySelector('.next-button').classList.add('move-down')
            document.querySelector('.next-button').classList.remove('choice-hover')
            document.querySelector('.card-text').classList.remove('visibility')
            document.querySelector('.answer0').classList.remove('visibility')
            document.querySelector('.answer1').classList.remove('visibility')
            document.querySelector('.answer2').classList.remove('visibility')
            document.querySelector('.card-text').classList.add('invisibility')
            document.querySelector('.answer0').classList.add('invisibility')
            document.querySelector('.answer1').classList.add('invisibility')
            document.querySelector('.answer2').classList.add('invisibility')
            await sleep(1000)
            //clear text and move next button
            document.querySelector('.card-text').innerHTML = ""
            document.querySelector('.answer0').innerHTML = ""
            document.querySelector('.answer1').innerHTML = ""
            document.querySelector('.answer2').innerHTML = ""
            document.querySelector('.choices').innerHTML = ""
            //ready to show new text
            document.querySelector('.card-text').classList.remove('invisibility')
            document.querySelector('.answer0').classList.remove('invisibility')
            document.querySelector('.answer1').classList.remove('invisibility')
            document.querySelector('.answer2').classList.remove('invisibility')
            //new text
            let textPlanetEncounter = "Votre vaisseau est entrée dans l'orbite d'une planète, allez dans la salle des scanners pour voir les informations sur cette planète ";
            await initialiseStatusList();
            write(textPlanetEncounter, '.card-text',);
        }
        else {
            let nextCard = await getNextCard(true);
            currentCardType = nextCard.type
            //hide text animation and 'next-button'
            document.querySelector('.next-button').disabled = 'true'
            document.querySelector('.next-button').classList.add('move-down')
            document.querySelector('.next-button').classList.remove('choice-hover')
            document.querySelector('.card-text').classList.remove('visibility')
            document.querySelector('.answer0').classList.remove('visibility')
            document.querySelector('.answer1').classList.remove('visibility')
            document.querySelector('.answer2').classList.remove('visibility')
            document.querySelector('.card-text').classList.add('invisibility')
            document.querySelector('.answer0').classList.add('invisibility')
            document.querySelector('.answer1').classList.add('invisibility')
            document.querySelector('.answer2').classList.add('invisibility')
            await sleep(1000)
            //clear text and move next button
            document.querySelector('.card-text').innerHTML = ""
            document.querySelector('.answer0').innerHTML = ""
            document.querySelector('.answer1').innerHTML = ""
            document.querySelector('.answer2').innerHTML = ""
            document.querySelector('.choices').innerHTML = ""

            //ready to show new text
            document.querySelector('.card-text').classList.remove('invisibility')
            document.querySelector('.answer0').classList.remove('invisibility')
            document.querySelector('.answer1').classList.remove('invisibility')
            document.querySelector('.answer2').classList.remove('invisibility')
            //set up new text
            cardtextstr = nextCard.desc;
            nextlist = nextCard.choices.map(v => v.next);
            choicelist = nextCard.choices.map(v => v.value);
            answerlist = nextCard.choices.map(v => v.reveal);
            // answer0str = "Vous donnez la bouteille à la douane qui vous laisse passer. ";
            // answer1str = "La douane est térrifiée à l'idée de devoir gagner au tribunal contre une Nek'air et vous laissent passer. ";
            // answer2str = "Vous donnez tous vos consommables aux douanniers, ils vous laissent continuer votre route. ";
            textprintednbr = 0;
            cardnbrUntilPlanet -= 1;
            await initialiseStatusList();
            if (blackout){
                write(cardtextstr, '.card-text','blackout');
            }
            else
                write(cardtextstr, '.card-text');
        }
    })
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
    statushtml.innerHTML = '<div class="status-title-line">\<div class="status-title1">Status :</div><div class="status-title2">Durée</div></div>';
    for (let i=0; i<activeStatus.length; i++){
        // applystatus(activeStatus[i])
        addStatus(activeStatus[i]);
        activeStatusList.push(activeStatus[i].slug)
    }
    blackout = activeStatusList.includes("blackout");
}

const addStatus = (status) => {
    // let index = statusNameList.findIndex(e => e === statusname)
    let svg = statusSvgList[status.slug];

    const html = ` <div class="status-line" id="line_${status.id}">
                        ${svg}
                        <div class="status-name">${status.name}</div>
                        <div class="status-duration">${status.duration}</div>
                    </div>`;
    statushtml.innerHTML += html
    // wsLNOB.setStatus(status.slug, status.duration)
}

const addNewStatus = (slug, duration) => {
    wsLNOB.setStatus(slug, duration)
}

function quickUpdateModule(el, mod, left=false) {
    let currentVal;
    let input;
    let inputVal='';
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

    if (inputVal !== ''){
        modifier *= inputVal;
    }
    else {
        if (this.event.shiftKey) {
            modifier *= 10;
        }
        else if (this.event.ctrlKey) {
            modifier *= 5;
        }
    }

    newValue = currentVal + modifier;
    if (input)
        input.value = '';

    newValue = Math.min(Math.max(newValue, 0), 100);
    if (currentVal === newValue) return;

    setModuleVal(mod, newValue, left);
}

function setModuleVal(mod, newValue, left) {
    if (typeof wsLNOB === 'undefined'){
        console.error('YOU MUST INCLUDE socketLNOB.js before this');
    }

    newValue = Math.min(Math.max(newValue, 0), 100);

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

function stopCountdown() {
  clearInterval(interval_cd)
}

//timer end -> cacher tous les choix sauf ne rien faire

// EXECUTION AU CHARGEMENT DE LA PAGE
(async function(){
    initialiseChoiceTabs();
    initialiseModTabs();
    initialisePlayerTab();
    await initialiseStatusList();
    if (blackout){
        // console.log(blackout,'blackout','if')
        write(cardtextstr, '.card-text','blackout');
    }
    else{
        // console.log(blackout,'blackout','else')
        write(cardtextstr, '.card-text');
    }
    initialiseleLeftTabs();
    document.addEventListener('status', initialiseStatusList);
})();