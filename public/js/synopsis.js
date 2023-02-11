function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function write(fulltext) {
    let currenttext = ''
    let place = document.querySelector('.card')
        for (let i = 0; i <= fulltext.length; i++) {
        place.innerText = currenttext;
        currenttext += fulltext.substring(i, i + 1)
        await sleep(21.7)
    }
}

write("Des membres de différentes espèces extraterrestres unissent leurs forces pour sauver l'humanité de l'extinction en envoyant des vaisseaux spatiaux pour récupérer des humains cryogénisés et les emmener vers une nouvelle planète habitable. \n\nCependant, durant le voyage, le vaisseau rencontre des problèmes inattendus et l'équipage doit travailler ensemble pour trouver une solution et protéger au mieux les humains à bord.")