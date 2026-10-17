// Éditeur d'objets (/items) : création, modification et suppression des objets
// du catalogue (src/config/items.json, via src/controllers/itemsEditor.js).
(function () {
    const STARTER = 'starter';
    const NEW_POOL = '__new__';
    const POOL_NAMES = {starter: 'Départ', electronique: 'Électronique'};
    const $ = (id) => document.getElementById(id);
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
    const NEW_TYPE = '__new__';
    const TYPE_INFO = {
        arme: ['Arme', 'fa-crosshairs'], armure: ['Armure', 'fa-shield-alt'], munition: ['Munition', 'fa-bullseye'],
        consommable: ['Consommable', 'fa-utensils'], ressource: ['Ressource', 'fa-cubes'], outil: ['Outil', 'fa-wrench'],
        gadget: ['Gadget', 'fa-microchip'], divers: ['Divers', 'fa-box']
    };
    const typeName = (t) => TYPE_INFO[t] ? TYPE_INFO[t][0] : (t.charAt(0).toUpperCase() + t.slice(1)).replace(/_/g, ' ');
    const typeIcon = (t) => '<i class="fas ' + (TYPE_INFO[t] ? TYPE_INFO[t][1] : 'fa-tag') + '" aria-hidden="true"></i>';
    const poolName = (p) => POOL_NAMES[p] || (p.charAt(0).toUpperCase() + p.slice(1)).replace(/_/g, ' ');
    const slugify = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    let catalog = CATALOG;
    let filter = 'all';
    let typeFilter = 'all';
    let type = '';            // type choisi dans le formulaire ('' : aucun, NEW_TYPE : nouveau)
    let editing = null;       // objet affiché (null : nouvel objet)
    let image = null;         // nouvelle image (data URL PNG) à envoyer
    let removeImage = false;
    let saved = '';           // état du formulaire au dernier enregistrement
    let busy = false;
    // Images remplacées pendant la session : on force le rechargement
    let bust = {};

    const raceName = (slug) => {
        let r = catalog.races.find(r => r.slug === slug);
        return r ? r.name : slug;
    };
    const imgSrc = (item) => item.image ? item.image + (bust[item.slug] ? '?v=' + bust[item.slug] : '') : '';
    const thumb = (src, name) => src
        ? '<img src="' + esc(src) + '" alt="">'
        : '<span class="ie-noimg">' + esc((name || '?').charAt(0)) + '</span>';

    let toastTimer;
    function toast(text, error) {
        let t = $('ie-toast');
        t.textContent = text;
        t.className = 'ie-toast show' + (error ? ' error' : '');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
    }

    function confirmDialog(title, text, ok) {
        let dialog = $('ie-confirm');
        $('ie-confirm-title').textContent = title;
        $('ie-confirm-text').textContent = text;
        $('ie-confirm-ok').textContent = ok;
        dialog.returnValue = '';
        dialog.showModal();
        return new Promise(r => dialog.addEventListener('close', () => r(dialog.returnValue === 'ok'), {once: true}));
    }

    /* ---------- Liste ---------- */

    function renderFilters() {
        let counts = {};
        catalog.items.forEach(i => counts[i.pool] = (counts[i.pool] || 0) + 1);
        let tabs = [['all', 'Tous', catalog.items.length]].concat(catalog.pools.map(p => [p, poolName(p), counts[p] || 0]));
        $('ie-filters').innerHTML = tabs.map(([key, label, n]) =>
            '<button type="button" role="tab" data-pool="' + esc(key) + '" aria-selected="' + (filter === key) + '">'
            + esc(label) + ' <small>' + n + '</small></button>').join('');
        let byType = {};
        catalog.items.forEach(i => byType[i.type] = (byType[i.type] || 0) + 1);
        let types = [['all', 'Tous', catalog.items.length]].concat(catalog.types.map(t => [t, typeName(t), byType[t] || 0]));
        if (byType[''])
            types.push(['', 'Sans type', byType['']]);
        $('ie-type-filters').innerHTML = types.map(([key, label, n]) =>
            '<button type="button" role="tab" data-type="' + esc(key) + '" aria-selected="' + (typeFilter === key) + '">'
            + (key !== 'all' && key !== '' ? typeIcon(key) + ' ' : '') + esc(label) + ' <small>' + n + '</small></button>').join('');
    }

    function renderList() {
        let q = slugify($('ie-search').value);
        let shown = catalog.items.filter(i => (filter === 'all' || i.pool === filter)
            && (typeFilter === 'all' || i.type === typeFilter)
            && (!q || slugify(i.name + ' ' + i.desc + ' ' + raceName(i.race) + ' ' + (i.type ? typeName(i.type) : '')).includes(q)));
        let box = $('ie-list');
        box.innerHTML = '';
        let pools = filter === 'all' ? catalog.pools : [filter];
        for (let pool of pools) {
            let items = shown.filter(i => i.pool === pool);
            if (!items.length && (q || filter === 'all' || typeFilter !== 'all'))
                continue;
            let group = document.createElement('section');
            group.className = 'ie-group';
            group.innerHTML = '<h2>' + esc(poolName(pool)) + '</h2>';
            if (!items.length)
                group.innerHTML += '<p class="ie-none">Aucun objet dans cette catégorie.</p>';
            for (let item of items) {
                let b = document.createElement('button');
                b.type = 'button';
                b.className = 'ie-item' + (editing && editing.slug === item.slug ? ' selected' : '');
                b.dataset.slug = item.slug;
                b.innerHTML = '<span class="ie-thumb">' + thumb(imgSrc(item), item.name) + '</span>'
                    + '<span class="ie-item-body"><span class="ie-item-name">' + esc(item.name) + '</span>'
                    + '<span class="ie-tags">'
                    + (item.type ? '<span class="ie-tag ie-tag-type">' + typeIcon(item.type) + ' ' + esc(typeName(item.type)) + '</span>' : '')
                    + (item.pool === STARTER ? '<span class="ie-tag">' + esc(raceName(item.race)) + '</span>' : '')
                    + '</span></span>'
                    + (editing && editing.slug === item.slug && isDirty() ? '<span class="ie-dot" title="Modifications non enregistrées"></span>' : '');
                b.addEventListener('click', () => tryOpen(item));
                group.append(b);
            }
            box.append(group);
        }
        if (!box.children.length)
            box.innerHTML = '<p class="ie-none">Aucun objet ne correspond.</p>';
    }

    /* ---------- Formulaire ---------- */

    function fillPools(selected) {
        let pools = catalog.pools.slice();
        if (selected && selected !== NEW_POOL && !pools.includes(selected))
            pools.push(selected);
        $('ie-pool').innerHTML = pools.map(p => '<option value="' + esc(p) + '">' + esc(poolName(p)) + '</option>').join('')
            + '<option value="' + NEW_POOL + '">+ Nouvelle catégorie…</option>';
        $('ie-pool').value = selected;
    }

    function fillRaces(selected) {
        let races = catalog.races.slice();
        if (selected && !races.some(r => r.slug === selected))
            races.push({slug: selected, name: selected});
        $('ie-race').innerHTML = '<option value="">Choisir une race…</option>'
            + races.map(r => '<option value="' + esc(r.slug) + '">' + esc(r.name) + '</option>').join('');
        $('ie-race').value = selected || '';
    }

    function renderTypes() {
        let types = catalog.types.slice();
        if (type && type !== NEW_TYPE && !types.includes(type))
            types.push(type);
        $('ie-type').innerHTML = types.map(t => '<button type="button" role="radio" data-type="' + esc(t) + '" aria-checked="' + (type === t) + '">'
            + typeIcon(t) + ' ' + esc(typeName(t)) + '</button>').join('')
            + '<button type="button" role="radio" class="ie-type-new" data-type="' + NEW_TYPE + '" aria-checked="' + (type === NEW_TYPE) + '">'
            + '<i class="fas fa-plus" aria-hidden="true"></i> Nouveau type</button>';
        $('ie-new-type-box').hidden = type !== NEW_TYPE;
    }

    function currentType() {
        return type === NEW_TYPE ? slugify($('ie-new-type').value).replace(/-/g, '_') : type;
    }

    function currentPool() {
        let p = $('ie-pool').value;
        return p === NEW_POOL ? slugify($('ie-new-pool').value).replace(/-/g, '_') : p;
    }

    function formState() {
        return JSON.stringify([$('ie-name').value.trim(), currentPool(), currentType(), $('ie-race').value, $('ie-desc').value.trim(), image, removeImage]);
    }

    const isDirty = () => formState() !== saved;

    function renderStatus() {
        let dirty = isDirty();
        let s = $('ie-status');
        s.textContent = dirty ? (editing ? 'Modifications non enregistrées' : 'Nouvel objet non enregistré') : 'Tout est enregistré';
        s.classList.toggle('is-dirty', dirty);
        $('ie-save').classList.toggle('pulse', dirty);
        let dot = document.querySelector('.ie-item.selected .ie-dot');
        if (!!dot !== (dirty && !!editing))
            renderList();
    }

    function currentImage() {
        if (image)
            return image;
        if (removeImage || !editing)
            return '';
        return imgSrc(editing);
    }

    function renderImage() {
        let src = currentImage();
        $('ie-image-preview').hidden = !src;
        if (src)
            $('ie-image-preview').src = src;
        $('ie-image-empty').hidden = !!src;
        $('ie-image').classList.toggle('has-image', !!src);
        $('ie-image-remove').hidden = !src;
    }

    function renderPool() {
        let pool = $('ie-pool').value;
        $('ie-new-pool-field').hidden = pool !== NEW_POOL;
        $('ie-race-field').hidden = pool !== STARTER;
        $('ie-pool-explain').textContent = pool === STARTER
            ? ($('ie-race').value ? 'Donné au début de la partie à chaque joueur ' + raceName($('ie-race').value) + '.' : 'Donné au début de la partie aux joueurs de la race choisie.')
            : 'Peut être trouvé en butin : après un combat, ou dans les choix des cartes de lieu.';
    }

    function renderPreview() {
        let name = $('ie-name').value.trim() || 'Nom de l\'objet';
        let src = currentImage();
        $('ie-preview-img').innerHTML = thumb(src, name);
        $('ie-preview-name').textContent = name;
        let t = currentType();
        $('ie-preview-type').hidden = !t;
        $('ie-preview-type').innerHTML = t ? typeIcon(t) + ' ' + esc(typeName(t)) : '';
        $('ie-preview-desc').textContent = $('ie-desc').value.trim() || 'Pas encore de description.';
        $('ie-preview-desc').classList.toggle('is-empty', !$('ie-desc').value.trim());
        $('ie-preview-chip').innerHTML = (src ? '<img src="' + esc(src) + '" alt="">' : '<b>' + esc(name.charAt(0)) + '</b>') + esc(name);
        $('ie-desc-count').textContent = $('ie-desc').value.length + ' / 600';
        let slug = editing ? editing.slug : slugify($('ie-name').value);
        $('ie-slug').textContent = slug ? 'id : ' + slug : '';
        $('ie-current').textContent = editing ? '— ' + editing.name : '';
    }

    function renderUsage() {
        let box = $('ie-usage');
        let u = editing && editing.used;
        if (!u || (!u.players && !u.ship)) {
            box.hidden = true;
            return;
        }
        let parts = [];
        if (u.players)
            parts.push(u.players + (u.players > 1 ? ' exemplaires chez les joueurs' : ' exemplaire chez un joueur'));
        if (u.ship)
            parts.push(u.ship + ' dans le vaisseau');
        box.hidden = false;
        box.innerHTML = '<i class="fas fa-box-open"></i> Partie en cours : ' + esc(parts.join(', ')) + '.';
    }

    function refresh() {
        renderPool();
        renderTypes();
        renderImage();
        renderPreview();
        renderStatus();
    }

    // Ouvre un objet (null : nouvel objet), éventuellement prérempli
    function open(item, prefill) {
        editing = item;
        image = null;
        removeImage = false;
        let src = item || prefill || {};
        $('ie-name').value = src.name || '';
        $('ie-desc').value = src.desc || '';
        let pool = src.pool || (filter !== 'all' ? filter : catalog.pools.find(p => p !== STARTER) || STARTER);
        fillPools(pool);
        fillRaces(src.race || '');
        $('ie-new-pool').value = '';
        type = src.type || (!item && !prefill && typeFilter !== 'all' ? typeFilter : '');
        $('ie-new-type').value = '';
        if (prefill && prefill.imageData)
            image = prefill.imageData;
        $('ie-form-title').textContent = item ? 'Modifier l\'objet' : 'Nouvel objet';
        $('ie-submit').textContent = item ? 'Enregistrer' : 'Créer l\'objet';
        $('ie-delete').hidden = !item;
        $('ie-duplicate').hidden = !item;
        $('ie-error').textContent = '';
        saved = prefill ? '' : formState();
        renderUsage();
        refresh();
        renderList();
        let sel = document.querySelector('.ie-item.selected');
        if (sel)
            sel.scrollIntoView({block: 'nearest'});
    }

    async function tryOpen(item) {
        if (editing && item && editing.slug === item.slug)
            return;
        if (isDirty() && !(await confirmDialog('Abandonner les modifications ?',
            'Les changements de « ' + ($('ie-name').value.trim() || 'nouvel objet') + ' » ne sont pas enregistrés.', 'Abandonner')))
            return;
        open(item);
    }

    async function reload() {
        catalog = await (await fetch('/api/items/catalog')).json();
        renderFilters();
    }

    async function save() {
        if (busy)
            return;
        let name = $('ie-name').value.trim();
        $('ie-error').textContent = '';
        if (!name) {
            $('ie-error').textContent = 'Donne un nom à l\'objet.';
            return $('ie-name').focus();
        }
        if (!currentPool()) {
            $('ie-error').textContent = 'Donne un nom à la nouvelle catégorie.';
            return $('ie-new-pool').focus();
        }
        if (type === NEW_TYPE && !currentType()) {
            $('ie-error').textContent = 'Donne un nom au nouveau type, ou choisis-en un.';
            return $('ie-new-type').focus();
        }
        if (currentPool() === STARTER && !$('ie-race').value) {
            $('ie-error').textContent = 'Un objet de départ appartient à une race : choisis-la.';
            return $('ie-race').focus();
        }
        busy = true;
        $('ie-submit').disabled = $('ie-save').disabled = true;
        try {
            let res = await fetch('/api/items/catalog', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    slug: editing ? editing.slug : undefined,
                    name: name,
                    pool: currentPool(),
                    type: currentType(),
                    race: $('ie-race').value,
                    desc: $('ie-desc').value,
                    image: image || undefined,
                    removeImage: removeImage
                })
            });
            let out = await res.json();
            if (out.error) {
                $('ie-error').textContent = out.error;
                return;
            }
            if (image)
                bust[out.item.slug] = Date.now();
            let created = !editing;
            await reload();
            filter = filter === 'all' || filter === out.item.pool ? filter : out.item.pool;
            typeFilter = typeFilter === 'all' || typeFilter === out.item.type ? typeFilter : 'all';
            renderFilters();
            open(catalog.items.find(i => i.slug === out.item.slug));
            toast(created ? 'Objet « ' + out.item.name + ' » créé' : 'Objet « ' + out.item.name + ' » enregistré');
        }
        catch (err) {
            $('ie-error').textContent = 'Enregistrement impossible, réessaie.';
        }
        finally {
            busy = false;
            $('ie-submit').disabled = $('ie-save').disabled = false;
        }
    }

    /* ---------- Image ---------- */

    // Recadrée en carré et réduite par le navigateur (256 px, PNG) avant l'envoi
    function loadImage(file) {
        if (!file)
            return;
        if (!/^image\//.test(file.type))
            return toast('Ce fichier n\'est pas une image', true);
        let img = new Image();
        img.onload = () => {
            let size = 256, c = document.createElement('canvas');
            c.width = c.height = size;
            let k = Math.min(size / img.width, size / img.height);
            let w = img.width * k, h = img.height * k;
            c.getContext('2d').drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
            image = c.toDataURL('image/png');
            removeImage = false;
            URL.revokeObjectURL(img.src);
            refresh();
        };
        img.onerror = () => toast('Cette image ne peut pas être lue', true);
        img.src = URL.createObjectURL(file);
    }

    $('ie-image-input').addEventListener('change', (e) => {
        loadImage(e.target.files[0]);
        e.target.value = '';
    });
    let drop = $('ie-image');
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => {
        e.preventDefault();
        drop.classList.add('is-drop');
    }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove('is-drop')));
    drop.addEventListener('drop', (e) => {
        e.preventDefault();
        loadImage(e.dataTransfer.files[0]);
    });
    $('ie-image-remove').addEventListener('click', () => {
        image = null;
        removeImage = !!(editing && editing.image);
        refresh();
    });

    /* ---------- Événements ---------- */

    $('ie-filters').addEventListener('click', (e) => {
        let b = e.target.closest('[data-pool]');
        if (!b)
            return;
        filter = b.dataset.pool;
        renderFilters();
        renderList();
    });
    $('ie-type-filters').addEventListener('click', (e) => {
        let b = e.target.closest('[data-type]');
        if (!b)
            return;
        typeFilter = b.dataset.type;
        renderFilters();
        renderList();
    });
    $('ie-type').addEventListener('click', (e) => {
        let b = e.target.closest('[data-type]');
        if (!b)
            return;
        // Un second clic sur le type choisi le retire
        type = type === b.dataset.type ? '' : b.dataset.type;
        refresh();
        if (type === NEW_TYPE)
            $('ie-new-type').focus();
    });
    $('ie-search').addEventListener('input', renderList);
    ['ie-name', 'ie-desc', 'ie-new-pool', 'ie-new-type'].forEach(id => $(id).addEventListener('input', refresh));
    ['ie-pool', 'ie-race'].forEach(id => $(id).addEventListener('change', () => {
        refresh();
        if (id === 'ie-pool' && $('ie-pool').value === NEW_POOL)
            $('ie-new-pool').focus();
    }));
    $('ie-form').addEventListener('submit', (e) => {
        e.preventDefault();
        save();
    });
    $('ie-save').addEventListener('click', save);
    $('ie-new').addEventListener('click', async () => {
        if (isDirty() && !(await confirmDialog('Abandonner les modifications ?',
            'Les changements de « ' + ($('ie-name').value.trim() || 'nouvel objet') + ' » ne sont pas enregistrés.', 'Abandonner')))
            return;
        open(null);
        $('ie-name').focus();
    });
    $('ie-duplicate').addEventListener('click', () => {
        let src = editing;
        open(null, {name: src.name + ' (copie)', desc: $('ie-desc').value, pool: currentPool() || src.pool, type: currentType(), race: $('ie-race').value});
        $('ie-name').focus();
        $('ie-name').select();
    });
    $('ie-delete').addEventListener('click', async () => {
        let item = editing;
        let held = item.used && (item.used.players || item.used.ship);
        let ok = await confirmDialog('Supprimer « ' + item.name + ' » ?',
            'L\'objet disparaît du catalogue : il ne sera plus proposé en butin'
            + (item.pool === STARTER ? ' ni donné au début de la partie' : '') + '.'
            + (held ? ' Les exemplaires de la partie en cours restent jusqu\'à la prochaine partie.' : ''), 'Supprimer');
        if (!ok)
            return;
        let res = await fetch('/api/items/catalog/' + encodeURIComponent(item.slug), {method: 'DELETE'});
        let out = await res.json();
        if (out.error)
            return toast(out.error, true);
        await reload();
        if (filter !== 'all' && !catalog.pools.includes(filter))
            filter = 'all';
        if (typeFilter !== 'all' && typeFilter !== '' && !catalog.types.includes(typeFilter))
            typeFilter = 'all';
        renderFilters();
        open(null);
        toast('Objet « ' + item.name + ' » supprimé');
    });

    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
    $('ie-help-btn').addEventListener('click', () => $('ie-help').showModal());

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            if (!document.querySelector('dialog[open]'))
                save();
        }
    });
    // Échap : menu du jeu (sauf pendant la saisie ou dans une boîte de dialogue)
    document.addEventListener('keyup', (e) => {
        let typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
        if (e.key === 'Escape' && !typing && !document.querySelector('dialog[open]') && $('navBtn'))
            $('navBtn').click();
    });
    window.addEventListener('beforeunload', (e) => {
        if (isDirty()) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    renderFilters();
    open(null);
})();
