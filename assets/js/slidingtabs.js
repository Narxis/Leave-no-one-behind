function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

async function initialiseChoiceTabs() {
    var choice = document.getElementById('choicetab');
    var choiceTabs = choice.getElementsByClassName('choice');
    
    choiceTabs[0].classList.remove('move-down');
    await sleep(150);
    choiceTabs[1].classList.remove('move-down');
    await sleep(150);
    choiceTabs[2].classList.remove('move-down');
    await sleep(150);
    choiceTabs[3].classList.remove('move-down');
    }
    
    window.addEventListener('load', initialiseChoiceTabs, false);

async function initialiseModTabs() {
    var mod = document.getElementById('modtab');
    var modTabs = mod.getElementsByClassName('tab');

    await sleep(100);
    modTabs[0].classList.remove('move-right');
    await sleep(100);
    modTabs[1].classList.remove('move-right');
    await sleep(100);
    modTabs[2].classList.remove('move-right');
    await sleep(100);
    modTabs[3].classList.remove('move-right');
    await sleep(100);
    modTabs[4].classList.remove('move-right');
    await sleep(100);
    modTabs[5].classList.remove('move-right');
    }

    window.addEventListener('load', initialiseModTabs, false);