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
// La page joueur affiche, dans un cadre (iframe), une copie des pages de jeu
// du MJ : mj/screen.html (template-card.ejs : carte, combat),
// mj/planet.html (template-planet.ejs : scans d'une planète) et mj/end.html
// (end-screen.ejs : score de fin). Même balisage,
// mêmes feuilles de style, mêmes scripts d'affichage ; seuls les boutons du
// MJ sont cachés (mj/screen.css), et mj/screen.js remplit l'écran avec l'état
// de la partie reçu du relais. Les fichiers (styles, scripts, images) sont
// recopiés dans public/player/mj : le relais ne sert que public/player.
const MJ_DIR = 'public/player/mj/';
const CARD_VIEW = 'public/views/template-card.ejs';
const PLANET_VIEW = 'public/views/template-planet.ejs';
const END_VIEW = 'public/views/end-screen.ejs';
// Scripts d'affichage repris tels quels, dans l'ordre des vues
const MJ_JS = ['players', 'timer-anim', 'combat-text', 'combat', 'card-loot', 'template-card', 'inventory'];
const PLANET_JS = ['planet', 'players'];
// Après les onglets : inventaires, puis onglets des compagnons (partials/npc-tabs.ejs)
const TABS_JS = ['inventory'];
// bottom-scripts.ejs, en defer
const MJ_JS_DEFER = ['ui-gauges', 'stat-tooltips'];

// Données vides pour rendre les vues (tout est rempli ensuite par mj/screen.js)
const STUB_SHIP = Object.fromEntries(['motors', 'scanner', 'proximity', 'oxygen', 'energy', 'gravity', 'shield', 'landing',
    'construction', 'dbscience', 'dbhistory', 'cryopods'].map(k => [k, 0]));
const viewLocals = () => ({
    players: [], ship: STUB_SHIP, card: {}, statuses: [], items: [], shipItems: [], lang: {lang: ''},
    shipRooms: JSON.parse(read('src/config/shipRooms.json')), playerRoles: {find: () => null}, discordOf: () => null
});
// Planète sans valeurs ni coûts : ils arrivent au fil des scans
const PLANET_MODULES = ['oxy', 'cli', 'fau', 'flo', 'civ', 'res', 'wtr', 'grv'];
const planetLocals = (last) => Object.assign(viewLocals(), {
    card: {id: 0, modules: Object.fromEntries(PLANET_MODULES.map(k => [k, {val: 0, cost: ''}]))},
    lastPlanet: last ? JSON.parse(read('src/config/lang.json')).last_planet : null
});
const renderView = (file, locals) => ejs.render(read(file), locals, {filename: path.join(ROOT, file)}).replace(/\r\n/g, '\n');
const tidy = (html) => html.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trimEnd();
// Boutons qui changent de page chez le MJ (atterrir, repartir) : sans effet ici
const noNavigation = (html) => html.replace(/ onclick="[^"]*"/g, '');

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

// Feuilles de style d'une vue : la liste cssFiles de son en-tête, puis
// ui-theme.css (ajoutée par partials/head.ejs)
const viewCss = function (file) {
    let m = read(file).match(/cssFiles\s*:\s*\[([^\]]*)\]/);
    if (!m)
        throw new Error(file + ' : feuilles de style introuvables');
    return [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]).concat('/css/ui-theme.css');
};
const cssName = (href) => (href.match(/^\/css\/([\w-]+)\.css$/) || [])[1];
const cssLinks = (file) => viewCss(file)
    .map(href => '    <link rel="stylesheet" href="' + (cssName(href) ? 'css/' + cssName(href) + '.css' : href) + '">').join('\n');
const mjCssNames = () => [...new Set([CARD_VIEW, PLANET_VIEW, END_VIEW].flatMap(viewCss).map(cssName).filter(Boolean))];

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

// Morceau d'une vue rendue, de start (inclus) à end (exclu)
const slice = function (html, start, end, what) {
    let from = html.search(start);
    let to = html.indexOf(end, from);
    if (from < 0 || to < 0)
        throw new Error(what + ' : écran de jeu introuvable');
    return relink(noNavigation(tidy(html.slice(from, html.lastIndexOf('\n', to)))));
};
// Script en ligne qui anime l'écran (jauges, onglets des modules…) : repris tel quel
const inlineScript = function (html, marker, what) {
    let start = html.lastIndexOf('<script>', html.indexOf(marker));
    let end = html.indexOf('</script>', start);
    if (html.indexOf(marker) < 0 || start < 0 || end < 0)
        throw new Error(what + ' : script de l\'écran introuvable');
    return html.slice(start, end + '</script>'.length).replace(/[ \t]+$/gm, '');
};
const bodyTag = (html) => (html.match(/<body[^>]*>/) || ['<body>'])[0];

// Onglet d'un joueur (partials/player-tabs.ejs), avec des repères remplacés par mj/screen.js
const mjPlayerTab = function () {
    let player = {discord_id: '__ID__', name: '__NAME__', race: '', role: '', items: []};
    for (let stat of ['combat', 'pilotage', 'engineering', 'survival', 'recon', 'moral'])
        player[stat] = '__' + stat.toUpperCase() + '__';
    let html = renderView('public/views/partials/player-tabs.ejs', Object.assign(viewLocals(), {player}));
    return relink(tidy(html).trim());
};
// Onglets des compagnons : modèle et script de la vue (partials/npc-tabs.ejs)
const npcTabs = () => relink(tidy(renderView('public/views/partials/npc-tabs.ejs', viewLocals())).trim())
    .replace(/src="\/js\/npc-tabs\.js"/, 'src="js/npc-tabs.js"');

// Ce que la page du MJ a et que les scripts repris attendent
const stubs = function (extra) {
    let custom = read('public/views/svg/custom.ejs').trim();
    return `<script>
    // Icônes des statuts, comme sur l'écran de jeu (card.js, addStatus)
    var statusSvgList = Object.assign({custom: ${JSON.stringify(custom)}}, window.LNOB_STATUS_SVG || {});
    function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    // Les boutons du MJ n'envoient rien depuis l'écran des joueurs
    var wsLNOB = {send() {}, setModule() {}, setStatus() {}, addItem() {}, delItem() {}, setStatistic() {}, rollDice() {}, triggerCustomEvent() {}};
    // Les scripts repris lisent l'API du MJ au chargement (/api/combat…) : ici
    // l'état vient de la page joueur, rien n'est demandé au relais
    (function (fetchPage) {
        window.fetch = function (url) {
            return String(url).indexOf('/api/') === 0 ? Promise.reject(new Error('API du MJ : sur sa page seulement')) : fetchPage.apply(this, arguments);
        };
    })(window.fetch);${extra || ''}
</script>`;
};
const scripts = (names, attr) => names.map(name => '<script src="js/' + name + '.js"' + (attr || '') + '></script>').join('\n');

const page = (view, title, head, body) => `<!doctype html>
<!-- Généré par scripts/player-assets.js depuis ${view.split('/').pop()} : ne pas modifier à la main -->
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
${head}
    <link rel="stylesheet" href="screen.css">
</head>
${body}
</html>
`;

// Carte (événement, lieu), son combat et son butin
const mjScreen = function () {
    let html = renderView(CARD_VIEW, viewLocals());
    return page(CARD_VIEW, 'LNOB', cssLinks(CARD_VIEW), `${bodyTag(html)}
${slice(html, /^ *<div class="center">/m, '<div class="next-button"', 'template-card.ejs')}
  <template id="player-tab-template">
${mjPlayerTab()}
  </template>
<script src="../status-icons.js"></script>
${stubs()}
${scripts(MJ_JS)}
${npcTabs()}
  ${inlineScript(html, 'var observer = new MutationObserver', 'template-card.ejs')}
${scripts(MJ_JS_DEFER, ' defer')}
<script src="screen.js" defer></script>
</body>`);
};

// Planète : la même page que le MJ, dessinée sans ses valeurs secrètes ;
// mj/screen.js joue chaque scan fait par le MJ avec planet.js
const mjPlanet = function () {
    let html = renderView(PLANET_VIEW, planetLocals(false));
    let lines = renderView(PLANET_VIEW, planetLocals(true)).split('\n');
    let block = function (cls) {
        let i = lines.findIndex(l => l.includes('<div class="' + cls + '"'));
        if (i < 0)
            throw new Error('template-planet.ejs : ' + cls + ' introuvable');
        return blockAt(lines, i);
    };
    let last = relink(noNavigation(tidy(block('last-planet-alert') + '\n' + block('topcenter'))));
    let texts = JSON.parse(read('src/config/lang.json')).card_vars.planet_text;
    return page(PLANET_VIEW, 'LNOB', cssLinks(PLANET_VIEW), `${bodyTag(html)}
${slice(html, /^ *<div class="center">/m, '<script>var PLANET_DATA', 'template-planet.ejs')}
  <template id="last-planet-template">
${last}
  </template>
  <template id="player-tab-template">
${mjPlayerTab()}
  </template>
<script src="../status-icons.js"></script>
${stubs(`
    // Planète de la carte en cours (?card=id) : même graine, donc même planète
    // que chez le MJ ; ses valeurs n'arrivent qu'au fil des scans (mj/screen.js)
    var PLANET_DATA = {id: Number(new URLSearchParams(location.search).get('card')) || 0, modules: {}};
    // Dernière planète (?last=1) : l'alerte et le seul bouton « Terminer le voyage »
    var LAST_PLANET = new URLSearchParams(location.search).get('last') === '1';
    if (LAST_PLANET)
        document.querySelector('.topcenter').replaceWith(document.getElementById('last-planet-template').content.cloneNode(true));
    // Textes des scans du jeu (planet.js les prépare au chargement)
    var lang = {card_vars: {planet_text: ${JSON.stringify(texts).replace(/</g, '\\u003c')}}};`)}
<script src="../planet-view.js"></script>
${scripts(PLANET_JS)}
${scripts(TABS_JS)}
${npcTabs()}
  ${inlineScript(html, 'var observer = new MutationObserver', 'template-planet.ejs')}
${scripts(MJ_JS_DEFER, ' defer')}
<script src="screen.js" defer></script>
</body>`);
};

// Écran de fin : le même que chez le MJ ; end-screen.js lit le score au
// chargement, mj/screen.js le charge une fois le score reçu. Les valeurs de
// la planète sont des repères (__oxy__…) remplacés par mj/screen.js
const mjEnd = function () {
    let locals = Object.assign(viewLocals(), {
        score: {scoreShip: 0, scorePlanet: 0, scoreCards: 0, scoreTotal: 0}, settings: null, js: {vars: ''}, leaderboardId: null,
        planet: {id: 0, name: '', modules: Object.fromEntries(PLANET_MODULES.map(k => [k, {val: '__' + k + '__'}]))}
    });
    let html = renderView(END_VIEW, locals);
    let lang = JSON.parse(read('src/config/lang.json')).card_vars;
    let texts = {planet_text: lang.planet_text, end_screen: lang.end_screen};
    // Récap des réglages (partials/settings-recap.ejs), compilé pour le navigateur
    let recap = ejs.compile(read('public/views/partials/settings-recap.ejs'), {client: true, compileDebug: false}).toString();
    return page(END_VIEW, 'LNOB', cssLinks(END_VIEW), `${bodyTag(html)}
${slice(html, /^ *<div class="center">/m, '<script>', 'end-screen.ejs').replace(/ href="\/leaderboard[^"]*"/, '')}
<script src="../status-icons.js"></script>
${stubs(`
    // Textes de l'écran de fin et des scans du jeu (end-screen.js)
    var lang = {card_vars: ${JSON.stringify(texts).replace(/</g, '\\u003c')}};
    var settingsRecap = ${recap};`)}
<script src="../planet-view.js"></script>
  ${inlineScript(html, 'var observer = new MutationObserver', 'end-screen.ejs')}
${scripts(MJ_JS_DEFER, ' defer')}
<script src="screen.js" defer></script>
</body>`);
};

// Fichiers de l'écran porté (le HTML d'abord : il relève les images à recopier)
const mjFiles = function () {
    mjAssets.clear();
    let out = {};
    out[MJ_DIR + 'screen.html'] = mjScreen();
    out[MJ_DIR + 'planet.html'] = mjPlanet();
    out[MJ_DIR + 'end.html'] = mjEnd();
    for (let name of mjCssNames())
        out[MJ_DIR + 'css/' + name + '.css'] = mjCss(name);
    for (let name of [...new Set(MJ_JS.concat(PLANET_JS, TABS_JS, MJ_JS_DEFER, ['npc-tabs', 'end-screen']))])
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
