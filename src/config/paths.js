const fs = require('fs');
const path = require('path');

// Game folders.
// - ROOT: the code and files shipped with the game (views, css, images…),
//   read-only in the desktop app.
// - DATA: what the game writes (SQLite databases, storage/cache, custom race
//   images). By default the server launch folder, as before;
//   the desktop app puts it in the user's data folder
//   with LNOB_DATA_DIR.
const ROOT = path.join(__dirname, '../..');
const DATA = path.resolve(process.env.LNOB_DATA_DIR || process.cwd());

const storage = (...parts) => path.join(DATA, 'storage', ...parts);
const cache = (...parts) => storage('cache', ...parts);
const databases = (...parts) => storage('databases', ...parts);
const raceImages = (...parts) => path.join(DATA, 'public/img/races', ...parts);
const itemImages = (...parts) => path.join(DATA, 'public/img/items', ...parts);

// Item catalog (/items editor). Started from the repo (DATA = ROOT),
// the editor changes src/config/items.json as before. In the installed app,
// the shipped catalog is read-only: the first change makes
// a copy in storage/cache/items.json, read instead from then on. As long as the
// GM doesn't touch anything, they keep the catalog shipped with each update.
const BASE_ITEMS = path.join(ROOT, 'src/config/items.json');
const sameDir = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const itemsWriteFile = () => sameDir(DATA, ROOT) ? BASE_ITEMS : cache('items.json');
const itemsFile = () => fs.existsSync(itemsWriteFile()) ? itemsWriteFile() : BASE_ITEMS;

// Creates the data folders. When storage/cache is created, copies the
// starting files shipped with the game (the places) into it: only once, so
// that a place deleted in the editor doesn't come back on the next launch.
const prepare = function () {
    let seed = path.join(ROOT, 'storage/cache');
    let firstRun = !fs.existsSync(cache()) && fs.existsSync(seed);

    for (let dir of [cache(), databases(), raceImages(), itemImages()])
        fs.mkdirSync(dir, {recursive: true});

    if (firstRun)
        for (let file of fs.readdirSync(seed))
            fs.copyFileSync(path.join(seed, file), cache(file));
}

module.exports = {ROOT, DATA, storage, cache, databases, raceImages, itemImages, itemsFile, itemsWriteFile, prepare};
