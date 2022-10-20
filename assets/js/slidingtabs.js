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