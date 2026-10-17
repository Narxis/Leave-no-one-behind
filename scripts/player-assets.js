// Fichiers de la page joueur (public/player) tirés des vues du jeu : la page
// est servie telle quelle par le relais, sans EJS.
//   node scripts/player-assets.js   régénère public/player/ship-svg.js
//                                   et public/player/ship-map.js
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

// Fichier généré → contenu attendu
const files = () => ({
    'public/player/ship-svg.js': shipSvg(),
    'public/player/ship-map.js': HEADER + read('public/js/ship-map.js')
});

module.exports = {files, ROOT};

if (require.main === module) {
    for (let [file, content] of Object.entries(files())) {
        fs.writeFileSync(path.join(ROOT, file), content);
        console.log(file + ' à jour');
    }
}
