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

// Texte envoyé par le serveur (src/controllers/intro.js), le même que pour les joueurs
write(SYNOPSIS)
