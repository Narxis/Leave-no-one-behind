// Fichiers de la page joueur (public/player) tirés des vues du jeu : la page
// est servie telle quelle par le relais, sans EJS.
//   node scripts/player-assets.js   régénère public/player/ship-svg.js
//                                   public/player/ship-map.js
//                                   public/player/planet-view.js
//                                   public/player/status-icons.js
//                                   public/player/game-icons.js
//                                   public/player/timer-markup.js,
//                                   timer-animation.css, timer-anim.js
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

// Compte à rebours de l'écran de jeu (bras robot, boule d'énergie, vaisseau
// qui flotte au-dessus de la carte) : même balisage, même CSS (police en
// data: pour le file://), même script d'animation
const blockAt = function (lines, start) {
    let indent = lines[start].match(/^ */)[0];
    let end = lines.findIndex((l, i) => i > start && l === indent + '</div>');
    return lines.slice(start, end + 1).join('\n');
};
const timerMarkup = function () {
    let lines = read('public/views/template-card.ejs').split('\n');
    let arm = blockAt(lines, lines.findIndex(l => l.includes('<div id="bigboite"')));
    let ship = blockAt(lines, lines.findIndex(l => l.includes('<div id="plugship"')));
    return HEADER + 'window.LNOB_TIMER_HTML = ' + JSON.stringify(arm + '\n' + ship) + ';\n';
};
const timerCss = function () {
    let font = 'data:font/ttf;base64,' + fs.readFileSync(path.join(ROOT, 'public/fonts/7segments.ttf')).toString('base64');
    return '/* Généré par scripts/player-assets.js : ne pas modifier à la main */\n'
        + read('public/css/timer-animation.css').replace("url('/fonts/7segments.ttf')", "url('" + font + "')");
};

// ---- Écran de jeu du MJ, porté tel quel pour les joueurs (public/player/mj) ----
// La page joueur affiche, dans un cadre (iframe), une copie de l'écran de
// jeu (template-card.ejs) : même balisage, mêmes feuilles de style, mêmes
// scripts d'affichage. Seuls les boutons du MJ sont cachés (mj/screen.css),
// et mj/screen.js remplit l'écran avec l'état de la partie reçu du relais.
// Les fichiers (styles, scripts, images) sont recopiés dans public/player/mj :
// le relais ne sert que public/player.
const MJ_DIR = 'public/player/mj/';
// Feuilles de style de template-card.ejs, dans le même ordre (head.ejs ajoute ui-theme.css)
const MJ_CSS = ['template-card', 'timer-animation', 'style', 'plan-du-vaisseau', 'ui-card', 'merchant', 'ui-theme'];
// Scripts d'affichage repris tels quels, dans l'ordre de template-card.ejs
// (ui-gauges.js et stat-tooltips.js viennent de bottom-scripts.ejs, en defer)
const MJ_JS = ['players', 'timer-anim', 'combat-text', 'combat', 'card-loot', 'template-card', 'inventory'];
const MJ_JS_DEFER = ['ui-gauges', 'stat-tooltips'];

// Données vides pour rendre les vues (tout est rempli ensuite par mj/screen.js)
const STUB_SHIP = Object.fromEntries(['motors', 'scanner', 'proximity', 'oxygen', 'energy', 'gravity', 'shield', 'landing',
    'construction', 'dbscience', 'dbhistory', 'cryopods'].map(k => [k, 0]));
const viewLocals = () => ({
    players: [], ship: STUB_SHIP, card: {}, statuses: [], items: [], shipItems: [], lang: {lang: ''},
    shipRooms: JSON.parse(read('src/config/shipRooms.json')), playerRoles: {find: () => null}, discordOf: () => null
});
const renderView = (file, locals) => ejs.render(read(file), locals, {filename: path.join(ROOT, file)});

// Fichiers de public/ cités par une vue ou une feuille de style (/img/…, /fonts/…) :
// recopiés dans public/player/mj/, chemin rendu relatif
const mjAssets = new Set();
const localAsset = function (url) {
    let clean = url.replace(/^\//, '');
    if (!/^(img|fonts)\//.test(clean) || !fs.existsSync(path.join(ROOT, 'public', clean)))
        return null;
    mjAssets.add(clean);
    return clean;
};
const relink = (html) => html.replace(/(src|href)="(\/?(?:img|fonts)\/[^"]+)"/g, (all, attr, url) => {
    let local = localAsset(url);
    return local ? attr + '="' + local + '"' : all;
});

// Feuille de style : chemins absolus rendus relatifs (le fichier est dans mj/css/),
// photo de fond externe retirée (ui-card.css la remplace de toute façon)
const mjCss = function (name) {
    return '/* Généré par scripts/player-assets.js depuis public/css/' + name + '.css : ne pas modifier à la main */\n'
        + read('public/css/' + name + '.css')
            .replace(/url\((['"]?)(\/(?:img|fonts)\/[^'")]+)\1\)/g, (all, q, url) => {
                let local = localAsset(url);
                return local ? 'url(' + q + '../' + local + q + ')' : all;
            })
            .replace(/url\(https:\/\/images\.pexels\.com[^)]*\)/g, 'none');
};

// Morceau de template-card.ejs : de <div class="center"> au bouton « suivant »
const mjBody = function () {
    let html = renderView('public/views/template-card.ejs', viewLocals()).replace(/\r\n/g, '\n');
    let start = html.indexOf('  <div class="center">');
    let end = html.indexOf('  <div class="next-button"');
    if (start < 0 || end < start)
        throw new Error('template-card.ejs : écran de jeu introuvable');
    return relink(html.slice(start, end).replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trimEnd());
};

// Script en ligne de template-card.ejs qui anime l'écran (jauges, onglets des
// modules, onglet de gauche) : repris tel quel
const mjInlineScript = function () {
    let html = renderView('public/views/template-card.ejs', viewLocals()).replace(/\r\n/g, '\n');
    let start = html.lastIndexOf('<script>', html.indexOf('var observer = new MutationObserver'));
    let end = html.indexOf('</script>', start);
    if (start < 0 || end < 0)
        throw new Error('template-card.ejs : script de l\'écran introuvable');
    return html.slice(start, end + '</script>'.length).replace(/[ \t]+$/gm, '');
};

// Onglet d'un joueur (partials/player-tabs.ejs), avec des repères remplacés par mj/screen.js
const mjPlayerTab = function () {
    let player = {discord_id: '__ID__', name: '__NAME__', race: '', role: '', items: []};
    for (let stat of ['combat', 'pilotage', 'engineering', 'survival', 'recon', 'moral'])
        player[stat] = '__' + stat.toUpperCase() + '__';
    let html = renderView('public/views/partials/player-tabs.ejs', Object.assign(viewLocals(), {player}));
    return relink(html.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim());
};

const mjScreen = function () {
    let css = MJ_CSS.map(name => '    <link rel="stylesheet" href="css/' + name + '.css">').join('\n');
    let js = MJ_JS.map(name => '<script src="js/' + name + '.js"></script>').join('\n');
    let deferred = MJ_JS_DEFER.map(name => '<script src="js/' + name + '.js" defer></script>').join('\n');
    let custom = read('public/views/svg/custom.ejs').trim();
    return `<!doctype html>
<!-- Généré par scripts/player-assets.js depuis template-card.ejs : ne pas modifier à la main -->
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>LNOB</title>
${css}
    <link rel="stylesheet" href="https://use.fontawesome.com/releases/v5.7.2/css/all.css">
    <link rel="stylesheet" href="screen.css">
</head>
<body class="wrap--1">
${mjBody()}
  <template id="player-tab-template">
${mjPlayerTab()}
  </template>
<script src="../status-icons.js"></script>
<script>
    // Icônes des statuts, comme sur l'écran de jeu (card.js, addStatus)
    var statusSvgList = Object.assign({custom: ${JSON.stringify(custom)}}, window.LNOB_STATUS_SVG || {});
    function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    // Les boutons du MJ n'envoient rien depuis l'écran des joueurs
    var wsLNOB = {send() {}, setModule() {}, setStatus() {}, addItem() {}, delItem() {}, setStatistic() {}, rollDice() {}, triggerCustomEvent() {}};
</script>
${js}
  ${mjInlineScript()}
${deferred}
<script src="screen.js" defer></script>
</body>
</html>
`;
};

// Fichiers de l'écran porté (le HTML d'abord : il relève les images à recopier)
const mjFiles = function () {
    mjAssets.clear();
    let out = {};
    out[MJ_DIR + 'screen.html'] = mjScreen();
    for (let name of MJ_CSS)
        out[MJ_DIR + 'css/' + name + '.css'] = mjCss(name);
    for (let name of MJ_JS.concat(MJ_JS_DEFER))
        out[MJ_DIR + 'js/' + name + '.js'] = HEADER + read('public/js/' + name + '.js');
    // Images des objets (coffres, liste du vaisseau) et de la monnaie
    for (let file of fs.readdirSync(path.join(ROOT, 'public/img/items')).sort())
        localAsset('/img/items/' + file);
    localAsset('/img/monnaie.svg');
    // Logos des rôles (onglets des joueurs)
    for (let role of JSON.parse(read('src/config/roles.json')).roles || [])
        if (role.icon)
            localAsset(role.icon);
    for (let asset of [...mjAssets].sort())
        out[MJ_DIR + asset] = fs.readFileSync(path.join(ROOT, 'public', asset));
    return out;
};

// Fichier généré → contenu attendu
const files = () => ({
    'public/player/ship-svg.js': shipSvg(),
    'public/player/ship-map.js': HEADER + read('public/js/ship-map.js'),
    'public/player/planet-view.js': HEADER + read('public/js/planet-view.js'),
    'public/player/status-icons.js': statusIcons(),
    'public/player/game-icons.js': gameIcons(),
    'public/player/timer-markup.js': timerMarkup(),
    'public/player/timer-animation.css': timerCss(),
    'public/player/timer-anim.js': HEADER + read('public/js/timer-anim.js'),
    ...Object.fromEntries(Object.entries(MODULE_ICONS).map(([id, file]) =>
        ['public/player/img/modules/' + id + '.svg', read('public/img/modules/' + file)])),
    ...mjFiles()
});

module.exports = {files, ROOT};

if (require.main === module) {
    for (let [file, content] of Object.entries(files())) {
        fs.mkdirSync(path.dirname(path.join(ROOT, file)), {recursive: true});
        fs.writeFileSync(path.join(ROOT, file), content);
        console.log(file + ' à jour');
    }
}
