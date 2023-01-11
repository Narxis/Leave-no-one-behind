function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

async function initialiseChoiceTabs() {
    var choice = document.getElementById('choicetab');
    var choiceTabs = choice.getElementsByClassName('choice');

    for (let i=0; i<choiceTabs.length; i++) {
        choiceTabs.item(i).classList.remove('move-down');
        await sleep(150);
    }

    // choiceTabs[0].classList.remove('move-down');
    // await sleep(150);
    // choiceTabs[1].classList.remove('move-down');
    // await sleep(150);
    // choiceTabs[2].classList.remove('move-down');
    // await sleep(150);
    // choiceTabs[3].classList.remove('move-down');
}

window.addEventListener('load', initialiseChoiceTabs, false);

async function initialiseModTabs() {
    var mod = document.getElementById('modtab');
    var modTabs = mod.getElementsByClassName('tab');

    for (let i=0; i<modTabs.length; i++) {
        await sleep(100);
        modTabs.item(i).classList.remove('move-right');
    }

    // await sleep(100);
    // modTabs[0].classList.remove('move-right');
    // await sleep(100);
    // modTabs[1].classList.remove('move-right');
    // await sleep(100);
    // modTabs[2].classList.remove('move-right');
    // await sleep(100);
    // modTabs[3].classList.remove('move-right');
    // await sleep(100);
    // modTabs[4].classList.remove('move-right');
    // await sleep(100);
    // modTabs[5].classList.remove('move-right');
}

window.addEventListener('load', initialiseModTabs, false);

async function initialiseTimerTab() {
    var timerTab = document.getElementsByClassName('timertab');
    console.log(timerTab.tagName);

    for (let i=0; i<timerTab.length; i++) {
        await sleep(100);
        timerTab.item(i).classList.remove('rotate-90');
        await sleep(31000)
        timerTab.item(i).classList.add('rotate-90');
    }

}    

window.addEventListener('load', initialiseTimerTab, false);

async function initialisePlayerTab(){
    var playerTab = document.querySelectorAll('.player-tab');
    for (let i=0; i<playerTab.length; i++) {
        playerTab.item(i).classList.remove('load-in');
        await sleep(100)
    }
}

window.addEventListener('load', initialisePlayerTab, false);
var cardtextstr = "Vous rencontrez un barrage de la première douane galactique et vous demande de vous mettre sur le bas côté. La douane considère tous vos consommables comme des biens illégaux et menace de vous les confisquer. ";
var answer1str = "Vous donnez la bouteille à la douane qui vous laisse passer. ";
var answer2str = "La douane est térrifiée à l'idée de devoir gagner au tribunal contre une Nek'air et vous laissent passer. ";
var answer3str = "Vous donnez tous vos consommables aux douanniers, ils vous laissent continuer votre route. ";
var texttimeout = "Temps écoulé. lol";
var textprintednbr= 0;
var cardnbrUntilPlanet = 5;

function nextoption () {
    if (textprintednbr == 2) {
        document.querySelector('#next1').classList.add('next-show')
    }
    if (textprintednbr == 3) {
        document.querySelector('#next2').classList.add('next-show')
    }
}

async function write (fulltext, place) {
    let currenttext = ''
    for (let i=0; i<fulltext.length; i++) {
        document.querySelector(place).innerText = currenttext ;
        currenttext +=fulltext.substring(i,i+1)
        await sleep(30)
    }
    textprintednbr +=1;
    nextoption();
}
window.addEventListener('load', write(cardtextstr, '.card-text'), false);

( function(){
    let linetab = document.querySelectorAll('.line');
    document.querySelector('#choice1').addEventListener('mouseup',async function() {
        document.querySelector('.card-text').classList.toggle('invisibility')
        document.querySelector('.answer1').classList.toggle('visibility')
        await sleep(1200)
        write(answer1str, '.answer1')
    })
    document.querySelector('#choice2').addEventListener('mouseup',async function() { 
        document.querySelector('.card-text').classList.toggle('invisibility')
        document.querySelector('.answer2').classList.toggle('visibility')
        await sleep(1200)
        write(answer2str, '.answer2')
 
    })
    document.querySelector('#choice3').addEventListener('mouseup',async function() {
        document.querySelector('.card-text').classList.toggle('invisibility')
        document.querySelector('.answer3').classList.toggle('visibility')
        await sleep(1200)
        write(answer3str, '.answer3')
    })
    document.querySelector('#next1').addEventListener('mouseup', async function (){
        if (cardnbrUntilPlanet == 1) {
                    //hide text animation and 'next-button'
            document.querySelector('.next-button').classList.add('next-button-invisibility')
            document.querySelector('.card-text').classList.remove('visibility')
            document.querySelector('.answer1').classList.remove('visibility')
            document.querySelector('.answer2').classList.remove('visibility')
            document.querySelector('.answer3').classList.remove('visibility')
            document.querySelector('.card-text').classList.add('invisibility')
            document.querySelector('.answer1').classList.add('invisibility')
            document.querySelector('.answer2').classList.add('invisibility')
            document.querySelector('.answer3').classList.add('invisibility')
            await sleep(1000)
            //clear text and move next button
            document.querySelector('.next-button').classList.remove('next-show')
            document.querySelector('.card-text').innerHTML = ""
            document.querySelector('.answer1').innerHTML = ""
            document.querySelector('.answer2').innerHTML = ""
            document.querySelector('.answer3').innerHTML = ""
            //ready to show new text
            document.querySelector('.next-button').classList.remove('next-button-invisibility')
            document.querySelector('.card-text').classList.remove('invisibility')
            document.querySelector('.answer1').classList.remove('invisibility')
            document.querySelector('.answer2').classList.remove('invisibility')
            document.querySelector('.answer3').classList.remove('invisibility')
            //new text
            cardtextstr = "Votre vaisseau est entrée dans l'orbite d'une planète, allez dans la salle des scanners pour voir les informations sur cette planète ";
            write (cardtextstr,'.card-text')
            document.querySelector('#next2').addEventListener('mouseup',function(){
                window.open('template-planet.html','_self')
                })
            }
        if (cardnbrUntilPlanet != 1) {
            //hide text animation and 'next-button'
            document.querySelector('.next-button').classList.add('next-button-invisibility')
            document.querySelector('.card-text').classList.remove('visibility')
            document.querySelector('.answer1').classList.remove('visibility')
            document.querySelector('.answer2').classList.remove('visibility')
            document.querySelector('.answer3').classList.remove('visibility')
            document.querySelector('.card-text').classList.add('invisibility')
            document.querySelector('.answer1').classList.add('invisibility')
            document.querySelector('.answer2').classList.add('invisibility')
            document.querySelector('.answer3').classList.add('invisibility')
            await sleep(1000)
            //clear text and move next button
            document.querySelector('.next-button').classList.remove('next-show')
            document.querySelector('.card-text').innerHTML = ""
            document.querySelector('.answer1').innerHTML = ""
            document.querySelector('.answer2').innerHTML = ""
            document.querySelector('.answer3').innerHTML = ""
            //ready to show new text
            document.querySelector('.next-button').classList.remove('next-button-invisibility')
            document.querySelector('.card-text').classList.remove('invisibility')
            document.querySelector('.answer1').classList.remove('invisibility')
            document.querySelector('.answer2').classList.remove('invisibility')
            document.querySelector('.answer3').classList.remove('invisibility')
            //set up new text
            cardtextstr = "Vous rencontrez un barrage de la première douane galactique et vous demande de vous mettre sur le bas côté. La douane considère tous vos consommables comme des biens illégaux et menace de vous les confisquer. ";
            answer1str = "Vous donnez la bouteille à la douane qui vous laisse passer. ";
            answer2str = "La douane est térrifiée à l'idée de devoir gagner au tribunal contre une Nek'air et vous laissent passer. ";
            answer3str = "Vous donnez tous vos consommables aux douanniers, ils vous laissent continuer votre route. ";
            textprintednbr = 0;
            cardnbrUntilPlanet -= 1; 
            write(cardtextstr,'.card-text')
            }
    })

})();

async function initialiseleLeftTabs() {
    var consommableTabVar = document.getElementsByClassName('consommable-tab');
    var todoListVar = document.getElementsByClassName('todoList'); 
    var modsLeftVar = document.getElementsByClassName('mods-left');
    await sleep(1000);
    consommableTabVar.item(0).classList.remove('slide-right');
    todoListVar.item(0).classList.remove('hidden');
    modsLeftVar.item(0).classList.remove('hidden');
}
window.addEventListener('load', initialiseleLeftTabs, false);

