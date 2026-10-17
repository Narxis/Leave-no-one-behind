const fs = require('fs');
const path = require('path');

// Dossiers du jeu.
// - ROOT : le code et les fichiers livrés avec le jeu (vues, css, images…),
//   en lecture seule dans l'app de bureau.
// - DATA : ce que le jeu écrit (bases SQLite, storage/cache, images des races
//   customs). Par défaut le dossier de lancement du serveur, comme avant ;
//   l'app de bureau le place dans le dossier de données de l'utilisateur
//   avec LNOB_DATA_DIR.
const ROOT = path.join(__dirname, '../..');
const DATA = path.resolve(process.env.LNOB_DATA_DIR || process.cwd());

const storage = (...parts) => path.join(DATA, 'storage', ...parts);
const cache = (...parts) => storage('cache', ...parts);
const databases = (...parts) => storage('databases', ...parts);
const raceImages = (...parts) => path.join(DATA, 'public/img/races', ...parts);

// Crée les dossiers de données. À la création de storage/cache, y copie les
// fichiers de départ livrés avec le jeu (les lieux) : une seule fois, pour
// qu'un lieu supprimé dans l'éditeur ne revienne pas au lancement suivant.
const prepare = function () {
    let seed = path.join(ROOT, 'storage/cache');
    let firstRun = !fs.existsSync(cache()) && fs.existsSync(seed);

    for (let dir of [cache(), databases(), raceImages()])
        fs.mkdirSync(dir, {recursive: true});

    if (firstRun)
        for (let file of fs.readdirSync(seed))
            fs.copyFileSync(path.join(seed, file), cache(file));
}

module.exports = {ROOT, DATA, storage, cache, databases, raceImages, prepare};
