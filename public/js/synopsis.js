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

// Text sent by the server (src/controllers/intro.js), the same as for the players
write(SYNOPSIS)
