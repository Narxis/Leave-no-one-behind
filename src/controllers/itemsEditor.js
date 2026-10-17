const fs = require('fs');
const path = require('path');
const races = require('./races');

// Catalogue des objets (éditeur /items) : src/config/items.json, rangé par
// catégorie (« pool »). Chaque objet a aussi un type facultatif (arme,
// consommable, ressource…), propre au catalogue pour l'instant. Les objets « starter » sont donnés au début de la
// partie aux joueurs de leur race. Chaque modification met aussi à jour la
// table items de la partie en cours, sans toucher aux exemplaires que les
// joueurs ou le vaisseau possèdent déjà.

const ITEMS_FILE = path.join(__dirname, '../config/items.json');
const IMAGE_DIR = path.join(__dirname, '../../public/img/items');
const IMAGE_PATH = '/img/items/';
const STARTER = 'starter';
const MAX_NAME = 60;
const MAX_DESC = 600;
// Types proposés d'office dans l'éditeur ; on peut en créer d'autres
const TYPES = ['arme', 'armure', 'munition', 'consommable', 'ressource', 'outil', 'gadget', 'divers'];

const read = () => JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf8'));
const write = (pools) => fs.writeFileSync(ITEMS_FILE, JSON.stringify(pools, null, 2) + '\n');

const slugify = (text, sep = '-') => String(text).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, sep).replace(new RegExp('^' + sep + '+|' + sep + '+$', 'g'), '');

const imageUrl = (file) => file ? IMAGE_PATH + file : '';
const ownersOf = (row) => row && row.owners ? String(row.owners).split(',').filter(Boolean) : [];

// Exemplaires dans la partie en cours : {slug: {players, ship}}
const usage = async function () {
    let rows = await DB.tables.items.findAll({raw: true});
    let out = {};
    for (let row of rows)
        out[row.slug] = {players: ownersOf(row).length, ship: row.quantity || 0};
    return out;
}

// Liste à plat, dans l'ordre du fichier
const list = async function () {
    let pools = read(), used = await usage();
    let items = [];
    for (let pool in pools)
        for (let item of pools[pool])
            items.push({
                slug: item.slug,
                name: item.name,
                desc: item.desc || '',
                pool: pool,
                type: item.type || '',
                race: item.race || '',
                image: imageUrl(item.image),
                used: used[item.slug] || {players: 0, ship: 0}
            });
    let types = TYPES.concat([...new Set(items.map(i => i.type).filter(t => t && !TYPES.includes(t)))]);
    return {items: items, pools: Object.keys(pools), types: types, races: races.list().map(r => ({slug: r.slug, name: r.name}))};
}

const find = function (pools, slug) {
    for (let pool in pools) {
        let at = pools[pool].findIndex(i => i.slug === slug);
        if (at >= 0)
            return {pool: pool, index: at, item: pools[pool][at]};
    }
    return null;
}

// Retire un objet de sa catégorie ; une catégorie vidée par l'éditeur disparaît
const dropFrom = function (pools, pool, index) {
    pools[pool].splice(index, 1);
    if (!pools[pool].length && pool !== STARTER)
        delete pools[pool];
}

// Fichier image utilisé par un autre objet que celui-ci ?
const imageShared = (pools, file, slug) => Object.values(pools).flat().some(i => i.image === file && i.slug !== slug);

// Recopie l'objet dans la partie en cours (ou l'y ajoute, sans exemplaire)
const syncDB = async function (item, pool, oldSlug) {
    let data = {slug: item.slug, name: item.name, desc: item.desc, pool: pool, race: item.race || '', image: imageUrl(item.image)};
    let row = await DB.tables.items.findOne({raw: true, where: {slug: oldSlug || item.slug}});
    if (row)
        await DB.tables.items.update(data, {where: {id: row.id}});
    else
        await DB.tables.items.create(Object.assign({owners: '', quantity: 0}, data));
}

// Création ou modification. Renvoie {item} ou {error}
const save = async function (data) {
    let pools = read();
    let name = String(data.name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
    if (!name)
        return {error: 'Donne un nom à l\'objet.'};
    let pool = slugify(data.pool || '', '_').slice(0, 30);
    if (!pool)
        return {error: 'Choisis une catégorie.'};
    let type = slugify(data.type || '', '_').slice(0, 30);
    let race = pool === STARTER ? String(data.race || '') : '';
    if (pool === STARTER && !race)
        return {error: 'Un objet de départ appartient à une race : choisis-la.'};

    let existing = data.slug ? find(pools, String(data.slug)) : null;
    if (data.slug && !existing)
        return {error: 'Cet objet n\'existe plus : recharge la page.'};
    let slug = existing ? existing.item.slug : slugify(name);
    if (!slug)
        return {error: 'Ce nom ne contient aucune lettre utilisable.'};
    if (!existing && (find(pools, slug) || await DB.tables.items.findOne({raw: true, where: {slug: slug}})))
        return {error: 'Un objet porte déjà ce nom.'};
    let other = Object.values(pools).flat().find(i => i.slug !== slug && i.name.toLowerCase() === name.toLowerCase());
    if (other)
        return {error: 'Un objet porte déjà ce nom.'};

    let item = {
        name: name,
        slug: slug
    };
    if (type)
        item.type = type;
    item.desc = String(data.desc || '').replace(/\r/g, '').trim().slice(0, MAX_DESC);
    if (race)
        item.race = race;
    item.image = existing ? (existing.item.image || '') : '';

    // Image envoyée par l'éditeur : un PNG déjà redimensionné par le navigateur
    if (data.image && /^data:image\/png;base64,/.test(data.image)) {
        let buffer = Buffer.from(data.image.split(',')[1], 'base64');
        if (buffer.length > 3 * 1024 * 1024)
            return {error: 'Image trop lourde (3 Mo au plus).'};
        fs.writeFileSync(path.join(IMAGE_DIR, slug + '.png'), buffer);
        item.image = slug + '.png';
    }
    else if (data.removeImage && item.image) {
        if (item.image === slug + '.png' && !imageShared(pools, item.image, slug))
            try { fs.unlinkSync(path.join(IMAGE_DIR, item.image)); } catch (e) {}
        item.image = '';
    }

    // Même place dans la liste, sauf changement de catégorie (à la fin de la nouvelle)
    if (existing && existing.pool === pool)
        pools[pool][existing.index] = item;
    else {
        if (existing)
            dropFrom(pools, existing.pool, existing.index);
        (pools[pool] = pools[pool] || []).push(item);
    }
    write(pools);
    await syncDB(item, pool);
    return {item: (await list()).items.find(i => i.slug === slug)};
}

// Suppression du catalogue. Les exemplaires déjà possédés restent jusqu'à la prochaine partie
const remove = async function (slug) {
    let pools = read();
    let found = find(pools, String(slug));
    if (!found)
        return {error: 'Cet objet n\'existe plus.'};
    dropFrom(pools, found.pool, found.index);
    write(pools);
    let file = found.item.image;
    if (file && file === found.item.slug + '.png' && !imageShared(pools, file, found.item.slug))
        try { fs.unlinkSync(path.join(IMAGE_DIR, file)); } catch (e) {}

    let row = await DB.tables.items.findOne({raw: true, where: {slug: found.item.slug}});
    let kept = row && (ownersOf(row).length || row.quantity > 0);
    if (row && !kept)
        await DB.tables.items.destroy({where: {id: row.id}});
    return {ok: true, kept: !!kept};
}

module.exports = {list, save, remove, STARTER, TYPES};
