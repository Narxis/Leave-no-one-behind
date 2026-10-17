// Tableaux « Dans le jeu » du wiki (dépôt Leave-no-one-behind-Wiki), tirés
// des fichiers du jeu, qui font foi pour les chiffres :
//   node scripts/wiki-tableaux.js <dossier du wiki> [--customs] [--check]
// Dans les pages du wiki, seul le texte entre deux marqueurs est remplacé :
//   <!-- jeu:debut stats-races -->  …  <!-- jeu:fin -->
// Tableaux possibles : stats-races (toutes, ou « stats-races fnek » /
// « stats-races nek_eau,nek_feu »), objets-depart, objets-autres, statuts.
// --customs ajoute les races customs de l'éditeur /races (dossier de données
// local) à « stats-races » ; --check ne modifie rien et sort en erreur si une
// page n'est pas à jour. À la main : npm run wiki-tableaux -- ../Leave-no-one-behind-Wiki
//
// Lancé aussi par .github/workflows/wiki-tableaux.yml, qui pousse sur le wiki
// avec le secret WIKI_TOKEN, à créer une fois : sur GitHub, Settings du compte →
// Developer settings → Personal access tokens → Fine-grained tokens, accès au
// seul dépôt Leave-no-one-behind-Wiki, permission « Contents : Read and write » ;
// puis dans ce dépôt : Settings → Secrets and variables → Actions → New
// repository secret, nom WIKI_TOKEN.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

const STATS = [['combat', 'Combat'], ['pilotage', 'Pilotage'], ['engineering', 'Ingénierie'], ['survival', 'Survie'], ['recon', 'Reconnaissance']];
const POOLS = {starter: 'Départ', electronique: 'Électronique'};
const BLOCK = /(<!-- jeu:debut ([\w-]+)(?: ([\w,-]+))? -->)[\s\S]*?(<!-- jeu:fin -->)/g;
// Pages jamais touchées
const SKIP = ['.git', 'archives-notion', 'node_modules', '_site'];

const signed = (v) => v > 0 ? '+' + v : (v < 0 ? '−' + (-v) : '0');
const cell = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
const upper = (t) => t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
const table = (head, rows) => ['| ' + head.join(' | ') + ' |', '| ' + head.map(() => '---').join(' | ') + ' |']
    .concat(rows.map(r => '| ' + r.map(cell).join(' | ') + ' |')).join('\n');
const note = (files) => '_Généré depuis ' + files.map(f => '`' + f + '`').join(', ') + ' du jeu : ne pas modifier à la main._';

// Races de base (raceStats.json, noms de lang.json), puis les customs si demandé
const loadRaces = function (withCustoms) {
    let lang = readJson('src/config/lang.json');
    let base = readJson('src/config/raceStats.json');
    let forms = (lang.card_vars && lang.card_vars.race) || {};
    let races = Object.keys(base).map(slug => ({
        slug: slug,
        name: (forms[slug] && forms[slug].no) || slug.split('_').map(upper).join('-'),
        stats: base[slug]
    }));
    if (withCustoms) {
        let custom = [];
        try {
            custom = JSON.parse(fs.readFileSync(require('../src/config/paths').cache('customRaces.json'), 'utf8'));
        }
        catch (e) {}
        for (let race of Array.isArray(custom) ? custom : [])
            races.push({slug: race.slug, name: race.name + ' (custom)', stats: race.stats || {}});
    }
    return races;
}

const loadItems = () => readJson('src/config/items.json');

const generators = {
    'stats-races': function (arg, opts) {
        let races = loadRaces(opts.customs);
        let files = ['src/config/raceStats.json'];
        if (arg) {
            let wanted = arg.split(',');
            races = wanted.map(slug => races.find(r => r.slug === slug)).filter(Boolean);
            if (races.length !== wanted.length)
                throw new Error('stats-races : race inconnue dans « ' + arg + ' »');
        }
        if (races.length === 1)
            return [note(files), table(STATS.map(s => s[1]), [STATS.map(s => signed(parseInt(races[0].stats[s[0]]) || 0))])];
        return [note(files), table(['Race'].concat(STATS.map(s => s[1])),
            races.map(r => [r.name].concat(STATS.map(s => signed(parseInt(r.stats[s[0]]) || 0)))))];
    },
    'objets-depart': function () {
        let races = loadRaces(false);
        let order = races.map(r => r.slug);
        let name = (slug) => (races.find(r => r.slug === slug) || {name: upper(slug)}).name;
        let items = (loadItems().starter || []).slice()
            .sort((a, b) => (order.indexOf(a.race) + 1 || 99) - (order.indexOf(b.race) + 1 || 99));
        return [note(['src/config/items.json']), table(['Race', 'Objet', 'Type', 'Description'],
            items.map(i => [name(i.race), i.name, upper(i.type), i.desc]))];
    },
    'objets-autres': function () {
        let rows = [];
        let pools = loadItems();
        for (let pool in pools) {
            if (pool === 'starter')
                continue;
            for (let i of pools[pool])
                rows.push([POOLS[pool] || upper(pool.replace(/_/g, ' ')), i.name, upper(i.type), i.desc]);
        }
        return [note(['src/config/items.json']), table(['Catégorie', 'Objet', 'Type', 'Description'], rows)];
    },
    'statuts': function () {
        let statuses = readJson('src/config/statuses.json');
        return [note(['src/config/statuses.json']), table(['Statut', 'Texte du jeu'],
            statuses.map(s => ['**' + cell(s.name) + '**', s.desc]))];
    }
};

// Une page : ses blocs remplacés (le reste du texte ne bouge pas)
const render = function (text, opts = {}) {
    let eol = text.includes('\r\n') ? '\r\n' : '\n';
    return text.replace(BLOCK, (all, start, name, arg, end) => {
        if (!generators[name])
            throw new Error('Tableau inconnu : ' + name);
        return [start, ''].concat(generators[name](arg, opts).join('\n\n').split('\n'), ['', end]).join(eol);
    });
}

const pages = function (dir) {
    let out = [];
    for (let entry of fs.readdirSync(dir, {withFileTypes: true})) {
        if (SKIP.includes(entry.name))
            continue;
        let full = path.join(dir, entry.name);
        if (entry.isDirectory())
            out = out.concat(pages(full));
        else if (entry.name.endsWith('.md'))
            out.push(full);
    }
    return out;
}

// Met à jour les pages du wiki ; rend la liste des pages modifiées (ou à modifier)
const run = function (wikiDir, opts = {}) {
    let changed = [];
    for (let file of pages(wikiDir)) {
        let text = fs.readFileSync(file, 'utf8');
        let next = render(text, opts);
        if (next === text)
            continue;
        changed.push(path.relative(wikiDir, file));
        if (!opts.check)
            fs.writeFileSync(file, next);
    }
    return changed;
}

if (require.main === module) {
    let args = process.argv.slice(2);
    let dir = args.find(a => !a.startsWith('--'));
    if (!dir || !fs.existsSync(dir)) {
        console.error('Usage : node scripts/wiki-tableaux.js <dossier du wiki> [--customs] [--check]');
        process.exit(2);
    }
    let opts = {customs: args.includes('--customs'), check: args.includes('--check')};
    let changed = run(dir, opts);
    console.log(changed.length ? (opts.check ? 'Pages pas à jour : ' : 'Pages mises à jour : ') + changed.join(', ') : 'Tableaux du wiki à jour');
    if (opts.check && changed.length)
        process.exit(1);
}

module.exports = {render, run, generators};
