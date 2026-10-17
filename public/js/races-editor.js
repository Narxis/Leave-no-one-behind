// Éditeur de races (/races) : création, modification et suppression des races
// customs (src/controllers/races.js). Les races de base se consultent seulement.
(function () {
    const STATS = [['combat', 'Combat'], ['pilotage', 'Pilotage'], ['engineering', 'Ingénierie'],
        ['survival', 'Survie'], ['recon', 'Reconnaissance']];
    // Somme des bonus de chaque race de base : repère d'équilibre
    const BASE_TOTAL = 3;
    const $ = (id) => document.getElementById(id);
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
    // Description enregistrée en HTML échappé : on la remet en texte pour l'éditer
    const unescape = (t) => {
        let d = document.createElement('textarea');
        d.innerHTML = t || '';
        return d.value;
    };

    let races = RACES;
    let editing = null;     // race affichée dans le formulaire (null : nouvelle)
    let stats = {};
    let feminine = false;
    let image = null;       // nouvelle image (data URL PNG) à envoyer

    // Valeur moyenne de la stat finale : 50 + meilleur/pire de |mod|+1 dés de 50 (comme /persos)
    function average(mod) {
        let k = Math.abs(mod) + 1, sum = 0;
        for (let v = 1; v <= 50; v++)
            sum += v * (mod >= 0 ? Math.pow(v / 50, k) - Math.pow((v - 1) / 50, k)
                : Math.pow((51 - v) / 50, k) - Math.pow((50 - v) / 50, k));
        return Math.round(50 + sum);
    }
    const signed = (m) => m > 0 ? '+' + m : String(m);

    // Mêmes formes que le serveur (races.grammar), pour l'aperçu
    function grammar(name, plural, fem) {
        let vowel = /^[aeiouyhâàéèêëîïôöûü]/i.test(name);
        return [
            (fem ? 'une ' : 'un ') + name,
            vowel ? "l'" + name : (fem ? 'la ' : 'le ') + name,
            'des ' + plural,
            vowel ? "à l'" + name : (fem ? 'à la ' : 'au ') + name
        ];
    }

    let toastTimer;
    function toast(text, error) {
        let t = $('re-toast');
        t.textContent = text;
        t.className = 're-toast show' + (error ? ' error' : '');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
    }

    /* ---------- Liste ---------- */

    function card(race) {
        let b = document.createElement('button');
        b.type = 'button';
        b.className = 're-card' + (editing && editing.slug === race.slug ? ' selected' : '');
        b.innerHTML = '<img src="' + esc(race.image) + '" alt="" onerror="this.onerror=null;this.src=\'/img/races/wat.png\'">'
            + '<span class="re-card-body"><span class="re-card-name">' + esc(race.name) + '</span>'
            + '<span class="re-card-mods">' + STATS.map(([key, label]) => {
                let m = race.stats[key] || 0;
                return '<span class="re-mod mod-' + (m < 0 ? 'm' + -m : m) + '" title="' + label + ' ' + signed(m) + '">' + label.slice(0, 3) + ' ' + signed(m) + '</span>';
            }).join('') + '</span></span>';
        b.addEventListener('click', () => open(race));
        return b;
    }

    function renderList() {
        let custom = races.filter(r => r.custom), base = races.filter(r => !r.custom);
        $('re-custom').innerHTML = '';
        if (!custom.length)
            $('re-custom').innerHTML = '<p class="re-empty">Aucune race custom pour l\'instant. Clique sur « Nouvelle race » pour en créer une.</p>';
        custom.forEach(r => $('re-custom').append(card(r)));
        $('re-base').innerHTML = '';
        base.forEach(r => $('re-base').append(card(r)));
        $('re-count').textContent = races.length + ' / ' + MAX_RACES + ' races (limite du menu Discord)';
        $('re-new').disabled = races.length >= MAX_RACES;
    }

    /* ---------- Formulaire ---------- */

    function renderStats(readonly) {
        let box = $('re-stats');
        box.innerHTML = '';
        for (let [key, label] of STATS) {
            let row = document.createElement('div');
            row.className = 're-stat';
            row.innerHTML = '<span class="re-stat-label">' + label + '</span>'
                + '<div class="re-seg re-seg-mod" role="radiogroup" aria-label="' + label + '">'
                + [-2, -1, 0, 1, 2].map(m => '<button type="button" role="radio" data-mod="' + m + '" class="mod-' + (m < 0 ? 'm' + -m : m) + '"'
                    + (stats[key] === m ? ' aria-checked="true"' : ' aria-checked="false"') + (readonly ? ' disabled' : '') + '>' + signed(m) + '</button>').join('')
                + '</div><span class="re-stat-avg" title="Valeur moyenne de la stat">≈ ' + average(stats[key]) + '</span>';
            row.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
                stats[key] = parseInt(btn.dataset.mod);
                renderStats(false);
            }));
            box.append(row);
        }
        let total = STATS.reduce((s, [key]) => s + stats[key], 0);
        let balance = $('re-balance');
        balance.textContent = 'Total des bonus : ' + signed(total)
            + (total === BASE_TOTAL ? ', comme toutes les races de base.' : ' (les races de base sont toutes à ' + signed(BASE_TOTAL) + ' : ' + (total > BASE_TOTAL ? 'celle-ci est plus forte).' : 'celle-ci est plus faible).'));
        balance.classList.toggle('off', total !== BASE_TOTAL);
    }

    function renderGrammar() {
        let name = $('re-name').value.trim() || 'Zorglub';
        let plural = $('re-plural').value.trim() || name + 's';
        $('re-plural').placeholder = name + 's';
        $('re-grammar').textContent = 'Dans les cartes : ' + grammar(name, plural, feminine).join(' · ');
        $('re-gender').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', (b.dataset.value === 'f') === feminine));
    }

    function renderCounter() {
        $('re-desc-count').textContent = $('re-desc').value.length + ' / 600';
    }

    // Ouvre une race (null : nouvelle). Une race de base est affichée en lecture seule
    function open(race, prefill) {
        editing = race;
        let readonly = !!(race && !race.custom);
        let src = race || prefill || null;
        stats = Object.fromEntries(STATS.map(([key]) => [key, src ? (src.stats[key] || 0) : 0]));
        feminine = !!(src && src.feminine);
        image = null;
        $('re-name').value = race ? race.name : '';
        $('re-plural').value = race && race.custom ? (race.plural || '') : '';
        $('re-desc').value = src ? unescape(src.desc) : '';
        $('re-incards').checked = !(race && race.inCards === false);
        $('re-image-preview').src = race ? race.image : '/img/races/wat.png';
        $('re-form-title').textContent = !race ? 'Nouvelle race' : (readonly ? race.name : 'Modifier ' + race.name);
        $('re-readonly').hidden = !readonly;
        $('re-form').classList.toggle('is-readonly', readonly);
        $('re-form').querySelectorAll('input, textarea, #re-gender button').forEach(f => f.disabled = readonly);
        $('re-save').hidden = readonly;
        $('re-save').textContent = race ? 'Enregistrer' : 'Créer la race';
        $('re-delete').hidden = !(race && race.custom);
        $('re-error').textContent = '';
        renderStats(readonly);
        renderGrammar();
        renderCounter();
        renderList();
    }

    $('re-new').addEventListener('click', () => {
        open(null);
        $('re-name').focus();
    });
    $('re-copy').addEventListener('click', () => {
        let base = editing;
        open(null, {stats: base.stats, desc: '', feminine: false});
        $('re-name').focus();
    });
    $('re-name').addEventListener('input', renderGrammar);
    $('re-plural').addEventListener('input', renderGrammar);
    $('re-desc').addEventListener('input', renderCounter);
    $('re-gender').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        feminine = b.dataset.value === 'f';
        renderGrammar();
    }));

    // Image : recadrée et réduite par le navigateur (256 px, PNG) avant l'envoi
    $('re-image-input').addEventListener('change', (e) => {
        let file = e.target.files[0];
        e.target.value = '';
        if (!file)
            return;
        let img = new Image();
        img.onload = () => {
            let size = 256, c = document.createElement('canvas');
            c.width = c.height = size;
            let k = Math.min(size / img.width, size / img.height);
            let w = img.width * k, h = img.height * k;
            c.getContext('2d').drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
            image = c.toDataURL('image/png');
            $('re-image-preview').src = image;
            URL.revokeObjectURL(img.src);
        };
        img.onerror = () => toast('Cette image ne peut pas être lue', true);
        img.src = URL.createObjectURL(file);
    });

    async function reload() {
        races = await (await fetch('/api/races')).json();
    }

    $('re-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (editing && !editing.custom)
            return;
        let name = $('re-name').value.trim();
        if (!name) {
            $('re-error').textContent = 'Donne un nom à la race.';
            return $('re-name').focus();
        }
        $('re-save').disabled = true;
        try {
            let res = await fetch('/api/races', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    slug: editing ? editing.slug : undefined,
                    name: name,
                    plural: $('re-plural').value.trim(),
                    feminine: feminine,
                    inCards: $('re-incards').checked,
                    stats: stats,
                    desc: $('re-desc').value,
                    image: image || undefined
                })
            });
            let out = await res.json();
            if (out.error) {
                $('re-error').textContent = out.error;
                return;
            }
            await reload();
            toast(editing ? 'Race « ' + out.race.name + ' » enregistrée' : 'Race « ' + out.race.name + ' » créée');
            open(races.find(r => r.slug === out.race.slug));
        }
        catch (err) {
            $('re-error').textContent = 'Enregistrement impossible, réessaie.';
        }
        finally {
            $('re-save').disabled = false;
        }
    });

    $('re-delete').addEventListener('click', async () => {
        let race = editing;
        let dialog = $('re-confirm');
        $('re-confirm-title').textContent = 'Supprimer « ' + race.name + ' » ?';
        $('re-confirm-text').textContent = 'La race disparaîtra du menu de création Discord, des fiches et des textes des cartes à venir. Son image est supprimée aussi.';
        dialog.returnValue = '';
        dialog.showModal();
        let ok = await new Promise(r => dialog.addEventListener('close', () => r(dialog.returnValue === 'ok'), {once: true}));
        if (!ok)
            return;
        let res = await fetch('/api/races/' + encodeURIComponent(race.slug), {method: 'DELETE'});
        let out = await res.json();
        if (out.error)
            return toast(out.error, true);
        await reload();
        toast('Race « ' + race.name + ' » supprimée');
        open(null);
    });

    // Échap : menu du jeu (sauf pendant la saisie ou dans une boîte de dialogue)
    document.addEventListener('keyup', (e) => {
        let typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
        if (e.key === 'Escape' && !typing && !document.querySelector('dialog[open]') && $('navBtn'))
            $('navBtn').click();
    });

    open(null);
})();
