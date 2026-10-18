// Fichiers de la page joueur (public/player) tirés des vues du jeu : la page
// est servie telle quelle par le relais, sans EJS.
//   node scripts/player-assets.js   régénère public/player/ship-svg.js
//                                   public/player/ship-map.js
//                                   public/player/planet-view.js
//                                   public/player/status-icons.js
//                                   public/player/game-icons.js
//                                   et public/player/img/modules/*.svg
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

// Plan du vaisseau : le même SVG que sur la page de jeu, salles nommées,
// et le contour du vaisseau
const shipSvg = function () {
    let template = read('public/views/partials/ship-rooms-svg.ejs');
    let rooms = JSON.parse(read('src/config/shipRooms.json'));
    let svg = ejs.render(template, {shipRooms: rooms}).trim();
    // Contour du vaisseau (murs dessinés), en data: : l'app ouvre la page en
    // file://, où une image en masque CSS serait bloquée
    let outline = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'public/img/plan-plugs-stroke.png')).toString('base64');
    return HEADER + 'window.LNOB_SHIP_SVG = ' + JSON.stringify(svg) + ';\n'
        + 'window.LNOB_SHIP_OUTLINE = ' + JSON.stringify(outline) + ';\n';
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

// Icônes des stats (panneau « Statistiques » de l'écran de jeu), tirées de
// la légende des stats
const gameIcons = function () {
    let legend = read('public/views/partials/stats-legend.ejs');
    let icons = {};
    for (let block of legend.split('<div class="player-stat" ').slice(1)) {
        let stat = (block.match(/^data-stat="([a-z]+)"/) || [])[1];
        let svg = (block.match(/<svg[\s\S]*?<\/svg>/) || [])[0];
        if (stat && svg)
            icons[stat] = svg.replace(/\s+id="[^"]*"/g, '').replace(/\s+/g, ' ');
    }
    return HEADER + 'window.LNOB_STAT_SVG = ' + JSON.stringify(icons) + ';\n';
};

// Icônes des modules (cadrans à droite de la carte), les mêmes que sur
// l'écran de jeu, nommées comme les modules du vaisseau
const MODULE_ICONS = {
    motors: 'engine-motor-svgrepo-com.svg',
    scanner: 'location-internet-svgrepo-com.svg',
    proximity: 'radar-svgrepo-com.svg',
    oxygen: 'oxygen-tank-svgrepo-com.svg',
    energy: 'battery-svgrepo-com.svg',
    gravity: 'artificial-gravity-svgrepo-com.svg'
};

// Fichier généré → contenu attendu
const files = () => ({
    'public/player/ship-svg.js': shipSvg(),
    'public/player/ship-map.js': HEADER + read('public/js/ship-map.js'),
    'public/player/planet-view.js': HEADER + read('public/js/planet-view.js'),
    'public/player/status-icons.js': statusIcons(),
    'public/player/game-icons.js': gameIcons(),
    ...Object.fromEntries(Object.entries(MODULE_ICONS).map(([id, file]) =>
        ['public/player/img/modules/' + id + '.svg', read('public/img/modules/' + file)]))
});

module.exports = {files, ROOT};

if (require.main === module) {
    for (let [file, content] of Object.entries(files())) {
        fs.mkdirSync(path.dirname(path.join(ROOT, file)), {recursive: true});
        fs.writeFileSync(path.join(ROOT, file), content);
        console.log(file + ' à jour');
    }
}
