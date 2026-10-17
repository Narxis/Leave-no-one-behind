// Fichiers de la page joueur (public/player) tirés des vues du jeu : la page
// est servie telle quelle par le relais, sans EJS.
//   node scripts/player-assets.js   régénère public/player/ship-svg.js
//                                   public/player/ship-map.js
//                                   public/player/planet-view.js
//                                   et public/player/status-icons.js
// Les vignettes des races de base (public/player/img/races/*.webp, 240 px)
// sont faites une fois à la main depuis public/img/races, par exemple :
//   convert public/img/races/fnek.png -resize 240x240 -quality 80 public/player/img/races/fnek.webp
// (un script et non un .svg : l'app ouvre la page en file://, où fetch est bloqué)
// Les tests vérifient que le fichier est à jour.
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const ROOT = path.join(__dirname, '..');
const HEADER = '// Généré par scripts/player-assets.js : ne pas modifier à la main\n';
// Fins de ligne Unix : même résultat sous Windows (git y met des \r\n)
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');

// Plan du vaisseau : le même SVG que sur la page de jeu, salles nommées
const shipSvg = function () {
    let template = read('public/views/partials/ship-rooms-svg.ejs');
    let rooms = JSON.parse(read('src/config/shipRooms.json'));
    let svg = ejs.render(template, {shipRooms: rooms}).trim();
    return HEADER + 'window.LNOB_SHIP_SVG = ' + JSON.stringify(svg) + ';\n';
};

// Icônes des statuts (Codex de la page joueur), les mêmes que sur les cartes
const statusIcons = function () {
    let icons = {};
    for (let status of JSON.parse(read('src/config/statuses.json'))) {
        let file = 'public/views/svg/' + status.slug + '.ejs';
        if (fs.existsSync(path.join(ROOT, file)) && read(file).trim())
            icons[status.slug] = read(file).trim();
    }
    return HEADER + 'window.LNOB_STATUS_SVG = ' + JSON.stringify(icons) + ';\n';
};

// Fichier généré → contenu attendu
const files = () => ({
    'public/player/ship-svg.js': shipSvg(),
    'public/player/ship-map.js': HEADER + read('public/js/ship-map.js'),
    'public/player/planet-view.js': HEADER + read('public/js/planet-view.js'),
    'public/player/status-icons.js': statusIcons()
});

module.exports = {files, ROOT};

if (require.main === module) {
    for (let [file, content] of Object.entries(files())) {
        fs.writeFileSync(path.join(ROOT, file), content);
        console.log(file + ' à jour');
    }
}
