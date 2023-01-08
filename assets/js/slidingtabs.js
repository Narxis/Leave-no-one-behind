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

async function write (fulltext, place) {
    let currenttext = ''
    for (let i=0; i<fulltext.length; i++) {
        document.querySelector(place).append(currenttext)
        currenttext = fulltext.substring(i,i+1)
        await sleep(30)
    }
}
window.addEventListener('load', write("Vous rencontrez un barrage de la première douane galactique et vous demande de vous mettre sur le bas côté. La douane considère tous vos consommables comme des biens illégaux et menace de vous les confisquer. ", '.card-text'), false);

( function(){
    let linetab = document.querySelectorAll('.line');
    document.querySelector('#choice1').addEventListener('mouseup',async function() {
        document.querySelector('.card-text').classList.toggle('invisibility')
        document.querySelector('.answer1').classList.toggle('visibility')
        await sleep(1200)
        write("Vous donnez la bouteille à la douane qui vous laisse passer. ", '.answer1')
    })
    document.querySelector('#choice2').addEventListener('mouseup',async function() { 
        document.querySelector('.card-text').classList.toggle('invisibility')
        document.querySelector('.answer2').classList.toggle('visibility')
        await sleep(1200)
        write("La douane est térrifiée à l'idée de devoir gagner au tribunal contre une Nek'air et vous laissent passer. ", '.answer2')
 
    })
    document.querySelector('#choice3').addEventListener('mouseup',async function() {
        document.querySelector('.card-text').classList.toggle('invisibility')
        document.querySelector('.answer3').classList.toggle('visibility')
        await sleep(1200)
        write("Vous donnez tous vos consommables aux douanniers, ils vous laissent continuer votre route. ", '.answer3')
    })
})();
