function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

var title = document.querySelector('.title');
var pasTitle = document.querySelector('.pas-title');

function addDiv(place, div) {
    console.log(document.querySelector(place))
    document.querySelector(place).classList.add(div)
}
function removeDiv(place, div) {
    document.querySelector(place).classList.remove(div)
}
function toggleDiv(place, div) {
    document.querySelector(place).classList.toggle(div)
}
/*async function boot() {
    addDiv('.title','hello');
    addDiv('.pas-title','hello2');
    console.log('oui')
    await sleep(3050);
    console.log('ouioui')
    removeDiv('.pas-title','hello2');
    addDiv('.pas-title','hello3');
}*/

async function boot() {
    title.classList.add('hello');
    pasTitle.classList.add('hello2');
    await sleep(3050);
    pasTitle.classList.remove('hello2');
    pasTitle.classList.add('hello3');
}

    window.addEventListener('load', boot(), false);







//   exemple de ligne
//   window.addEventListener('load', addDiv('.start','timer'), false);