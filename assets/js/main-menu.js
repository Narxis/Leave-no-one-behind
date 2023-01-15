function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function addDiv(place, div) {
    document.querySelector(place).classList.add(div)
}
function removeDiv(place, div) {
    document.querySelector(place).classList.remove(div)
}
function toggleDiv(place, div) {
    document.querySelector(place).classList.toggle(div)
}

    window.addEventListener('load', addDiv('.title','hello'), false);




//   exemple de ligne
//   window.addEventListener('load', addDiv('.start','timer'), false);