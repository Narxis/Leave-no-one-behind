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

async function initialiseleLeftTabs() {
    var statusTabVar = document.getElementsByClassName('status-tab');
    var todoListVar = document.getElementsByClassName('todoList'); 
    var modsLeftVar = document.getElementsByClassName('mods-left');
    await sleep(1000);
    statusTabVar.item(0).classList.remove('slide-right');
    await sleep(900);
    todoListVar.item(0).classList.remove('hidden');
    modsLeftVar.item(0).classList.remove('hidden');
    statusTabVar.item(0).classList.add('open-left');
    statusTabVar.item(0).firstElementChild.querySelector('svg').classList.remove('rotate270')
    statusTabVar.item(0).firstElementChild.querySelector('svg').classList.add('rotate90')
    todoListVar.item(0).classList.add('open-mod-left');
    modsLeftVar.item(0).classList.add('open-mod-left');
    await sleep(5000);
    todoListVar.item(0).classList.add('glitch-effect1');
    modsLeftVar.item(0).classList.add('glitch-effect2');
}
window.addEventListener('load', initialiseleLeftTabs, false); 