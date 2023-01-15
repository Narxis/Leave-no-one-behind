function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function addDiv(place, div) {
    document.querySelector(place).classlist.add(div)
}
function removeDiv(place, div) {
    document.querySelector(place).classlist.remove(div)
}
function toggleDiv(place, div) {
    document.querySelector(place).classlist.toggle(div)
}
//   exemple de ligne
//   window.addEventListener('load', addDiv('.start','timer'), false);