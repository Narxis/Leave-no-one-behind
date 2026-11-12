// "Dans le jeu" tables of the wiki (Leave-no-one-behind-Wiki repo), taken
// from the game files, which are authoritative for the numbers:
//   node scripts/wiki-tableaux.js <wiki folder> [--customs] [--check]
// In the wiki pages, only the text between two markers is replaced:
//   <!-- jeu:debut stats-races -->  …  <!-- jeu:fin -->
// Possible tables: stats-races (all, or "stats-races fnek" /
// "stats-races nek_eau,nek_feu"), objets-depart, objets-autres, statuts.
// --customs adds the custom races of the /races editor (local data
// folder) to "stats-races"; --check changes nothing and exits with an error if a
// page isn't up to date. By hand: npm run wiki-tableaux -- ../Leave-no-one-behind-Wiki
//
// Also run by .github/workflows/wiki-tableaux.yml, which pushes to the wiki
// with the WIKI_TOKEN secret, to create once: on GitHub, account Settings →
// Developer settings → Personal access tokens → Fine-grained tokens, access to
// the Leave-no-one-behind-Wiki repo only, "Contents: Read and write" permission;
// then in this repo: Settings → Secrets and variables → Actions → New
// repository secret, name WIKI_TOKEN.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

const STATS = [['combat', 'Combat'], ['pilotage', 'Pilotage'], ['engineering', 'Ingénierie'], ['survival', 'Survie'], ['recon', 'Reconnaissance']];
const POOLS = {starter: 'Départ', electronique: 'Électronique'};
const BLOCK = /(<!-- jeu:debut ([\w-]+)(?: ([\w,-]+))? -->)[\s\S]*?(<!-- jeu:fin -->)/g;
// Pages never touched
const SKIP = ['.git', 'archives-notion', 'node_modules', '_site'];

const signed = (v) => v > 0 ? '+' + v : (v < 0 ? '−' + (-v) : '0');
const cell = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
const upper = (t) => t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
const table = (head, rows) => ['| ' + head.join(' | ') + ' |', '| ' + head.map(() => '---').join(' | ') + ' |']
    .concat(rows.map(r => '| ' + r.map(cell).join(' | ') + ' |')).join('\n');
const note = (files) => '_Généré depuis ' + files.map(f => '`' + f + '`').join(', ') + ' du jeu : ne pas modifier à la main._';

// Base races (raceStats.json, names from lang.json), then the customs if requested
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

// A page: its blocks replaced (the rest of the text doesn't move)
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

// Updates the wiki pages; returns the list of changed pages (or pages to change)
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
