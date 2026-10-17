// Prévisualisation des cartes d'un lieu dans l'éditeur (/buildCard).
// Deux modes :
//  - Jouer : l'histoire telle qu'elle est dans l'éditeur, même non enregistrée,
//    comme en partie (texte tapé, chrono, choix mélangés, butin, résultats) ;
//  - Éditer : la carte et ses choix se modifient directement, les changements
//    vont dans les blocs de l'éditeur (à enregistrer comme d'habitude).
// Navigation : retour / suivant, fil des cartes jouées, « Aller à », marqueurs, raccourcis.
//
// L'éditeur ouvre le test avec CardPreview.open(provider, fromId). provider()
// renvoie l'état du lieu à cet instant (relu à chaque étape) :
//   {title, startId, cards, goTo, actions}
//   cards   : Map id → {id, num, desc, mjreveal, timer, shuffle, marker,
//                       choices: [{id, value, mjreveal, loot, reveal, revealId, next}]}
//   goTo    : appelé avec l'id d'un bloc pour y aller dans l'éditeur
//   actions : edit(id, champ, valeur), addChoice(carteId), addNext(choixId), addReveal(choixId)
//             (renvoient l'id du bloc créé)
window.CardPreview = (function () {
    const TIMER_SECONDS = 30;          // comme en jeu (card.js)
    const STOP_TOKEN = '{....}';       // pause « .... » puis le texte repart à zéro
    const CHAR_DELAY = 21.7;
    const FAST_FACTOR = 15, FAST_CHARS = 5;
    const MAX_CHOICES = 3;
    const END_CHOICE = 'Continuer votre chemin';
    const DEFAULT_MARKER = 'À revoir';

    const $ = (id) => document.getElementById(id);
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const short = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
    const hasNext = (c) => c.reveal != null || c.next != null;

    let provider = null, story = null, fromId = null;
    // Étapes : {type: 'card', id, order} ou {type: 'reveal', cardId, choiceId}
    let path = [], ahead = [];
    let mode = 'play';
    let run = 0;            // change à chaque nouvel affichage : stoppe l'écriture et le chrono en cours
    let fast = false, instant = false, writing = false;
    let timerHandle = null;

    const dialog = () => $('cp-dialog');
    const step = () => path[path.length - 1];
    const cardOf = (s) => s && story.cards.get(s.type === 'card' ? s.id : s.cardId);
    const choiceOf = (s) => { let card = cardOf(s); return card && card.choices.find(c => c.id === s.choiceId); };

    /* ---------- Variables de texte : [article_type_numéro] ---------- */

    // Même règle que le jeu (src/models/card.js, getRandomVar) : [le_race_1] devient
    // « le Fnek », une majuscule au début donne une majuscule, le même numéro donne
    // la même valeur dans un même texte, deux numéros différents des valeurs différentes
    const VAR_RE = /\[[^\]]+\]/g;
    const VAR_TYPES = {
        'race': 'Race',
        'module': 'Module (tous)',
        'module-main': 'Module principal',
        'module-h': 'Module sans cryopods',
        'module-bdd': 'Module sans bases de données',
        'module-h-bdd': 'Module sans cryopods ni bases de données',
        'stats': 'Compétence',
        'pub': 'Nom de pub',
        'objet': 'Objet',
        'livre': 'Livre',
        'film': 'Film',
        'boisson': 'Boisson',
        'bouteille': 'Bouteille',
        'lieu': 'Lieu',
        'pnj': 'Personnage (métier)',
        'personnage': 'Personnage connu',
        'organisation': 'Organisation',
        'bande': 'Groupe hostile',
        'systeme': 'Système stellaire'
    };
    const varsOf = () => (window.lang && window.lang.card_vars) || {};
    const parseVar = (token) => {
        let parts = token.slice(1, -1).split('_');
        let article = parts[0] || '';
        return {article: article.toLowerCase(), upper: article.charAt(0) !== article.charAt(0).toLowerCase(), type: parts[1], id: parts[2]};
    };
    const articlesOf = (type) => { let first = Object.values(varsOf()[type] || {})[0]; return first && typeof first === 'object' ? Object.keys(first) : []; };

    // Pourquoi une variable ne marchera pas en jeu ('' si elle est bonne)
    function varProblem(token) {
        let v = parseVar(token);
        if (v.article === 'conf')
            return '';
        if (!v.type || !varsOf()[v.type])
            return 'type « ' + (v.type || '?') + ' » inconnu';
        if (!articlesOf(v.type).includes(v.article))
            return 'article « ' + v.article + ' » inconnu pour ce type';
        return '';
    }

    function resolveVars(text, picks) {
        let vars = varsOf(), picked = {};
        return String(text || '').replace(VAR_RE, (token) => {
            let v = parseVar(token);
            if (v.article === 'conf')
                return '‹' + v.type + '›';      // réglage de la partie, connu seulement en jeu
            if (varProblem(token))
                return token;
            let mine = picked[v.type] = picked[v.type] || {};
            if (mine[v.id] == null) {
                let taken = Object.values(mine);
                let pool = Object.keys(vars[v.type]).filter(k => !taken.includes(k));
                if (!pool.length)
                    pool = Object.keys(vars[v.type]);
                mine[v.id] = pool[Math.floor(Math.random() * pool.length)];
            }
            let out = vars[v.type][mine[v.id]][v.article];
            out = v.upper ? out.charAt(0).toUpperCase() + out.slice(1) : out;
            if (picks && !(token in picks))
                picks[token] = out;
            return out;
        });
    }

    // Tirage gardé par étape : revenir sur une carte ne relance pas ses variables
    function shown(s, text) {
        s.cache = s.cache || {};
        if (!(text in s.cache))
            s.cache[text] = resolveVars(text, s.picks = s.picks || {});
        return s.cache[text];
    }

    /* ---------- Texte tapé comme en jeu ---------- */

    async function write(text, token) {
        let box = $('cp-text');
        let shown = '';
        text = String(text || '').split(STOP_TOKEN).join('‡');
        fast = false;
        writing = true;
        box.classList.add('is-writing');
        let pause = (ms) => sleep(fast ? ms / FAST_FACTOR : ms);
        for (let i = 0; i <= text.length; i++) {
            if (token !== run)
                return false;
            if (instant) {
                // Texte instantané : seul ce qui suit la dernière pause reste affiché, comme à la fin de l'écriture
                let parts = text.split('‡');
                shown = parts[parts.length - 1];
                break;
            }
            box.innerText = shown;
            let c = text.charAt(i);
            if (c === '‡') {
                for (let j = 0; j < 4; j++) {
                    await pause(400);
                    if (token !== run)
                        return false;
                    shown += '.';
                    box.innerText = shown;
                }
                shown = '';
                await pause(500);
            }
            else
                shown += c;
            if (!fast || i % FAST_CHARS === 0)
                await pause(CHAR_DELAY);
        }
        if (token !== run)
            return false;
        box.innerText = shown;
        writing = false;
        box.classList.remove('is-writing');
        return true;
    }

    /* ---------- Chrono ---------- */

    function stopTimer() {
        clearInterval(timerHandle);
        timerHandle = null;
        $('cp-timer').hidden = true;
    }

    function startTimer(token, onEnd) {
        let left = TIMER_SECONDS;
        let el = $('cp-timer');
        el.hidden = false;
        el.classList.remove('is-low');
        el.querySelector('span').textContent = left;
        timerHandle = setInterval(() => {
            if (token !== run)
                return stopTimer();
            left--;
            el.querySelector('span').textContent = Math.max(left, 0);
            el.classList.toggle('is-low', left <= 5);
            if (left <= 0) {
                stopTimer();
                onEnd();
            }
        }, 1000);
    }

    /* ---------- Petits morceaux d'affichage ---------- */

    function lootHtml(names) {
        return names.map(name => {
            let known = (window.LOOT_ITEMS || []).find(it => it.name.toLowerCase() === String(name).toLowerCase());
            return '<span class="cp-loot-chip' + (known ? '' : ' is-custom') + '">'
                + (known && known.image ? '<img src="' + esc(known.image) + '" alt="">' : '<b>' + esc(String(name).charAt(0)) + '</b>')
                + esc(name) + '</span>';
        }).join('');
    }

    function showLoot(names) {
        let box = $('cp-loot');
        box.hidden = !names.length;
        box.innerHTML = names.length ? '<span class="cp-loot-title"><i class="fas fa-gem"></i> Butin obtenu</span>' + lootHtml(names) : '';
    }

    function setEnd(kind, html) {
        let box = $('cp-end');
        box.hidden = !kind;
        if (!kind)
            return;
        box.className = 'cp-end ' + kind;
        box.innerHTML = html;
    }

    const afterLabel = (c) => c.reveal != null ? 'Résultat' : c.next != null ? 'Carte n° ' + story.cards.get(c.next).num : 'Aucune suite';

    // Fil des étapes, liste « Aller à », boutons retour / suivant, marqueur
    function renderNav() {
        $('cp-path').innerHTML = path.map((s, i) => {
            let card = cardOf(s);
            let label = s.type === 'reveal' ? 'Résultat' : 'n° ' + (card ? card.num : '?');
            return '<button type="button" data-step="' + i + '"' + (i === path.length - 1 ? ' aria-current="step"' : '')
                + (card && card.marker && s.type === 'card' ? ' class="is-marked" title="' + esc(card.marker) + '"' : '') + '>' + label + '</button>';
        }).join('<i class="fas fa-angle-right"></i>');
        $('cp-back').disabled = path.length < 2;
        $('cp-forward').disabled = !ahead.length;

        let jump = $('cp-jump');
        let cards = [...story.cards.values()].sort((a, b) => a.num - b.num);
        jump.innerHTML = '<option value="">Aller à…</option>' + cards.map(c =>
            '<option value="' + esc(c.id) + '">' + (c.marker ? '★ ' : '') + 'n° ' + c.num + ' — ' + esc(short(c.desc, 40) || '(sans texte)') + '</option>').join('');

        let card = cardOf(step());
        let mark = $('cp-mark');
        mark.hidden = !card || step().type !== 'card';
        if (card) {
            mark.classList.toggle('is-on', !!card.marker);
            mark.setAttribute('aria-pressed', !!card.marker);
            mark.querySelector('span').textContent = card.marker ? 'Marquée' : 'Marquer';
        }
        let modeBtns = document.querySelectorAll('[data-mode]');
        modeBtns.forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === mode));
        dialog().classList.toggle('is-editing', mode === 'edit');
    }

    // Panneau MJ : infos de la carte (modifiables en mode Éditer), suite des choix, marqueurs
    function renderMj(card, order) {
        let html = '';
        let edit = mode === 'edit';
        let s = step();
        if (card && s.type === 'card') {
            html += '<p class="cp-mj-line"><b>Carte n° ' + card.num + '</b>'
                + (!edit && card.timer ? ' <span class="cp-tag"><i class="fas fa-stopwatch"></i> Chrono ' + TIMER_SECONDS + ' s</span>' : '')
                + (!edit && card.shuffle ? ' <span class="cp-tag"><i class="fas fa-random"></i> Choix mélangés</span>' : '') + '</p>';
            if (edit) {
                html += '<label class="cp-field">Infos MJ<textarea rows="2" data-edit="' + esc(card.id) + '" data-field="mjreveal" placeholder="facultatif">' + esc(card.mjreveal) + '</textarea></label>'
                    + '<div class="cp-checks">'
                    + '<label class="cp-switch"><input type="checkbox" data-flag="timer"' + (card.timer ? ' checked' : '') + '> Chrono</label>'
                    + '<label class="cp-switch"><input type="checkbox" data-flag="shuffle"' + (card.shuffle ? ' checked' : '') + '> Choix mélangés</label></div>';
            }
            else {
                html += card.mjreveal ? '<p class="cp-mj-note">' + esc(shown(s, card.mjreveal)) + '</p>' : '<p class="cp-mj-empty">Pas d\'infos MJ sur cette carte.</p>';
                if (card.timer)
                    html += '<p class="cp-mj-hint">Au bout du chrono, seul le dernier choix de la carte reste proposé.</p>';
            }
            if (card.marker)
                html += '<label class="cp-field cp-marker-field"><span><i class="fas fa-bookmark"></i> Note du marqueur</span>'
                    + '<input type="text" maxlength="80" data-edit="' + esc(card.id) + '" data-field="marker" value="' + esc(card.marker) + '"></label>';
            html += '<ol class="cp-mj-choices">';
            for (let c of order) {
                html += '<li><span class="cp-mj-choice">' + esc((edit ? c.value : shown(s, c.value)) || '(sans texte)') + '</span>'
                    + '<span class="cp-mj-after' + (hasNext(c) ? '' : ' is-missing') + '"><i class="fas fa-long-arrow-alt-right"></i> ' + afterLabel(c) + '</span>'
                    + (edit ? '<input type="text" class="cp-mj-input" data-edit="' + esc(c.id) + '" data-field="mjreveal" placeholder="Infos MJ du choix (facultatif)" value="' + esc(c.mjreveal) + '">'
                        : (c.mjreveal ? '<span class="cp-mj-note">' + esc(shown(s, c.mjreveal)) + '</span>' : ''))
                    + (c.loot.length ? '<span class="cp-mj-loot">' + lootHtml(c.loot) + '</span>' : '')
                    + '</li>';
            }
            html += '</ol>';
            if (edit && order.some(c => c.loot.length))
                html += '<p class="cp-mj-hint">Le butin se modifie dans le bloc du choix.</p>';
        }
        else if (s && s.type === 'reveal') {
            let choice = choiceOf(s);
            html += '<p class="cp-mj-line"><b>Résultat</b> du choix « ' + esc(short(choice && choice.value, 40)) + ' »</p>'
                + '<p class="cp-mj-hint">En jeu, la partie reprend ensuite avec la carte suivante du deck.</p>';
        }
        html += varsHtml(card, order);
        html += '<h3 class="cp-mj-sub"><i class="fas fa-bookmark"></i> Marqueurs</h3><div id="cp-markers">' + markersHtml() + '</div>';
        $('cp-mj').innerHTML = html;
    }

    // Variables de l'étape : exemple de valeur (mode Éditer) ou valeur tirée (mode Jouer)
    function varsHtml(card, order) {
        let s = step();
        let texts = s.type === 'reveal' ? [(choiceOf(s) || {}).reveal]
            : [card.desc, card.mjreveal].concat(order.flatMap(c => [c.value, c.mjreveal]));
        let found = [...new Set(texts.join(' ').match(VAR_RE) || [])];
        if (mode === 'play')
            texts.forEach(t => shown(s, t || ''));     // valeurs tirées dans les textes eux-mêmes
        if (!found.length)
            return mode === 'edit' ? '<h3 class="cp-mj-sub"><i class="fas fa-dice"></i> Variables</h3><p class="cp-mj-empty">Aucune variable. Le bouton « Variable » en insère une là où se trouve le curseur.</p>' : '';
        return '<h3 class="cp-mj-sub"><i class="fas fa-dice"></i> Variables</h3><ul class="cp-vars">' + found.map(token => {
            let problem = varProblem(token);
            let value = problem ? '' : (mode === 'play' ? (s.picks || {})[token] : resolveVars(token));
            return '<li' + (problem ? ' class="is-bad"' : '') + '><code>' + esc(token) + '</code> '
                + (problem ? '<span>' + esc(problem) + ', restera tel quel en jeu</span>' : '<span>→ ' + esc(value) + (mode === 'edit' ? ' <small>(exemple)</small>' : '') + '</span>') + '</li>';
        }).join('') + '</ul>';
    }

    function markersHtml() {
        let marked = [...story.cards.values()].filter(c => c.marker).sort((a, b) => a.num - b.num);
        return marked.length ? '<ul class="cp-markers">' + marked.map(c =>
            '<li><button type="button" data-jump="' + esc(c.id) + '"><b>n° ' + c.num + '</b> ' + esc(c.marker) + '</button></li>').join('') + '</ul>'
            : '<p class="cp-mj-empty">Aucune carte marquée. « Marquer » (ou la touche M) en garde une pour y revenir.</p>';
    }

    /* ---------- Affichage d'une étape ---------- */

    async function render(animate) {
        let token = ++run;
        $('cp-var').hidden = true;
        story = provider();
        stopTimer();
        setEnd(null);
        showLoot([]);
        $('cp-choices').innerHTML = '';
        let s = step();
        let card = cardOf(s);
        if (s.type === 'card' && card && !s.order) {
            // Ordre des choix tiré une fois par étape (comme un tirage en jeu), gardé si on revient dessus
            s.order = card.choices.map(c => c.id);
            if (card.shuffle && mode === 'play')
                shuffle(s.order);
        }
        renderNav();
        if (!card || (s.type === 'reveal' && !choiceOf(s))) {
            $('cp-text').innerText = '';
            $('cp-edit').hidden = true;
            renderMj(null, []);
            return setEnd('is-warn', '<i class="fas fa-exclamation-triangle"></i> Ce bloc n\'existe plus dans l\'éditeur.');
        }
        // Choix dans l'ordre tiré, puis ceux ajoutés depuis
        let order = s.type === 'card' ? s.order.map(id => card.choices.find(c => c.id === id)).filter(Boolean)
            .concat(card.choices.filter(c => !s.order.includes(c.id))) : [];
        renderMj(card, order);
        if (s.type === 'reveal')
            return renderReveal(card, choiceOf(s), token, animate);
        $('cp-card-num').textContent = 'Carte n° ' + card.num + (card.marker ? ' ★' : '');
        if (mode === 'edit')
            return renderCardEdit(card, order);
        $('cp-edit').hidden = true;
        $('cp-text').hidden = false;
        if (animate) {
            if (!(await write(shown(s, card.desc) || '(carte sans texte)', token)))
                return;
        }
        else
            $('cp-text').innerText = lastPart(shown(s, card.desc) || '(carte sans texte)');
        if (!order.length)
            return setEnd('is-warn', '<i class="fas fa-exclamation-triangle"></i> Cette carte ne propose aucun choix : en jeu, l\'histoire resterait bloquée ici.'
                + ' <button type="button" class="cp-link" data-mode-switch="edit">Ajouter un choix</button>');
        playChoices(order, card, token);
        if (card.timer && animate && !$('cp-no-timer').checked)
            startTimer(token, async () => {
                // Comme en jeu : il ne reste que le dernier choix de la carte
                await hideChoices();
                if (token === run)
                    playChoices(card.choices.slice(-1), card, token);
            });
    }

    const lastPart = (t) => { let parts = String(t).split(STOP_TOKEN); return parts[parts.length - 1]; };

    function playChoices(list, card, token) {
        let box = $('cp-choices');
        box.innerHTML = '';
        list.forEach((c, i) => {
            let btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cp-choice' + (hasNext(c) ? '' : ' is-missing');
            btn.dataset.key = i + 1;
            btn.innerHTML = '<kbd>' + (i + 1) + '</kbd><span>' + esc(shown(step(), c.value) || '(choix sans texte)') + '</span>'
                + (hasNext(c) ? '' : '<small>pas encore de suite</small>');
            btn.style.animationDelay = (i * 90) + 'ms';
            btn.addEventListener('click', () => choose(card, c, token));
            box.append(btn);
        });
    }

    async function renderReveal(card, choice, token, animate) {
        $('cp-card-num').textContent = 'Résultat';
        if (mode === 'edit') {
            showEditor(choice.revealId, 'reveal', choice.reveal, 'Ce qui arrive à la fin de ce choix…');
            showLoot(choice.loot);
            return setEnd('is-done', '<i class="fas fa-flag-checkered"></i> Fin de cette branche du lieu.');
        }
        $('cp-edit').hidden = true;
        $('cp-text').hidden = false;
        if (animate) {
            if (!(await write(shown(step(), choice.reveal) || '(résultat sans texte)', token)))
                return;
        }
        else
            $('cp-text').innerText = lastPart(shown(step(), choice.reveal) || '(résultat sans texte)');
        showLoot(choice.loot);
        let btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cp-choice';
        btn.dataset.key = 1;
        btn.innerHTML = '<kbd>1</kbd><span>' + END_CHOICE + '</span>';
        btn.addEventListener('click', () => {
            $('cp-choices').innerHTML = '';
            setEnd('is-done', '<i class="fas fa-flag-checkered"></i> Fin du lieu. En jeu, la partie reprendrait avec la carte suivante du deck.'
                + ' <button type="button" class="cp-link" data-restart>Rejouer depuis le début</button>');
        });
        $('cp-choices').append(btn);
    }

    // Grand champ de texte à la place du texte de la carte
    function showEditor(id, field, value, placeholder) {
        let area = $('cp-edit');
        $('cp-text').hidden = true;
        area.hidden = false;
        area.dataset.edit = id;
        area.dataset.field = field;
        area.placeholder = placeholder;
        if (document.activeElement !== area || area.value !== value)
            area.value = value;
    }

    function renderCardEdit(card, order) {
        showEditor(card.id, 'desc', card.desc, 'Ce que découvrent les joueurs… ({....} pour une pause)');
        let box = $('cp-choices');
        order.forEach((c, i) => {
            let row = document.createElement('div');
            row.className = 'cp-choice is-edit' + (hasNext(c) ? '' : ' is-missing');
            row.innerHTML = '<kbd>' + (i + 1) + '</kbd>'
                + '<input type="text" maxlength="200" data-edit="' + esc(c.id) + '" data-field="choice" placeholder="Texte du choix" value="' + esc(c.value) + '">'
                + (hasNext(c)
                    ? '<button type="button" class="cp-go" data-go="' + i + '" title="Aller à la suite de ce choix">' + afterLabel(c) + ' <i class="fas fa-arrow-right"></i></button>'
                    : '<span class="cp-go-new"><button type="button" data-create="next" data-choice="' + esc(c.id) + '"><i class="fas fa-plus"></i> Carte suivante</button>'
                        + '<button type="button" data-create="reveal" data-choice="' + esc(c.id) + '"><i class="fas fa-plus"></i> Résultat</button></span>');
            row.dataset.key = i + 1;
            box.append(row);
        });
        if (card.choices.length < MAX_CHOICES) {
            let add = document.createElement('button');
            add.type = 'button';
            add.className = 'cp-add-choice';
            add.dataset.create = 'choice';
            add.innerHTML = '<i class="fas fa-plus"></i> Ajouter un choix';
            box.append(add);
        }
    }

    async function hideChoices() {
        let list = $('cp-choices').querySelectorAll('.cp-choice');
        list.forEach((b, i) => setTimeout(() => b.classList.add('is-leaving'), i * 50));
        await sleep(instant ? 0 : 350 + list.length * 50);
    }

    /* ---------- Déplacements ---------- */

    function go(next, animate) {
        path.push(next);
        ahead = [];
        render(animate);
    }

    async function choose(card, choice, token) {
        if (token !== run)
            return;
        if (!hasNext(choice))
            return setEnd('is-warn', '<i class="fas fa-exclamation-triangle"></i> Ce choix n\'a pas encore de suite.'
                + ' <button type="button" class="cp-link" data-mode-switch="edit">La créer ici</button>');
        stopTimer();
        token = ++run;
        await hideChoices();
        if (token !== run)
            return;
        if (choice.reveal != null)
            return go({type: 'reveal', cardId: card.id, choiceId: choice.id}, true);
        showLoot(choice.loot);
        if (choice.loot.length && !instant)
            await sleep(1200);
        if (token === run)
            go({type: 'card', id: choice.next}, true);
    }

    function back() {
        if (path.length < 2)
            return;
        ahead.push(path.pop());
        render(false);
    }

    function forward() {
        if (!ahead.length)
            return;
        path.push(ahead.pop());
        render(false);
    }

    function jumpTo(id) {
        if (!story.cards.has(id))
            return;
        go({type: 'card', id: id}, mode === 'play');
    }

    function setMode(next) {
        if (mode === next)
            return;
        mode = next;
        let s = step();
        if (s && s.type === 'card')
            delete s.order;
        render(false);
    }

    function toggleMarker() {
        let card = cardOf(step());
        if (!card || step().type !== 'card')
            return;
        story.actions.edit(card.id, 'marker', card.marker ? '' : DEFAULT_MARKER);
        render(false);
        if (!card.marker) {
            let field = $('cp-mj').querySelector('[data-field="marker"]');
            if (field) {
                field.focus();
                field.select();
            }
        }
    }

    function shuffle(list) {
        for (let i = list.length - 1; i > 0; i--) {
            let j = Math.floor(Math.random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    }

    /* ---------- Insertion d'une variable (mode Éditer) ---------- */

    let lastField = null;       // dernier champ de texte utilisé : la variable y est insérée

    function varToken() {
        let type = $('cp-var-type').value, article = $('cp-var-article').value;
        if ($('cp-var-upper').checked)
            article = article.charAt(0).toUpperCase() + article.slice(1);
        return '[' + article + '_' + type + '_' + $('cp-var-id').value + ']';
    }

    function refreshVarForm(typeChanged) {
        let type = $('cp-var-type').value;
        if (typeChanged) {
            let first = Object.values(varsOf()[type] || {})[0] || {};
            let current = $('cp-var-article').value;
            $('cp-var-article').innerHTML = articlesOf(type).map(a =>
                '<option value="' + esc(a) + '"' + (a === current ? ' selected' : '') + '>' + esc(a) + ' — ' + esc(first[a]) + '</option>').join('');
        }
        let token = varToken();
        $('cp-var-code').textContent = token;
        $('cp-var-example').textContent = resolveVars(token);
    }

    function openVarForm() {
        let box = $('cp-var');
        if (!box.hidden)
            return (box.hidden = true);
        if (!$('cp-var-type').options.length)
            $('cp-var-type').innerHTML = Object.keys(VAR_TYPES).filter(t => varsOf()[t]).map(t =>
                '<option value="' + t + '">' + VAR_TYPES[t] + ' (' + Object.keys(varsOf()[t]).length + ' au choix)</option>').join('');
        refreshVarForm(true);
        box.hidden = false;
        $('cp-var-type').focus();
    }

    function insertVar() {
        let field = lastField && lastField.isConnected && !lastField.hidden ? lastField : $('cp-edit');
        if (field.hidden)
            return;
        let token = varToken();
        let start = field.selectionStart != null ? field.selectionStart : field.value.length;
        let end = field.selectionEnd != null ? field.selectionEnd : start;
        field.value = field.value.slice(0, start) + token + field.value.slice(end);
        field.dispatchEvent(new Event('input', {bubbles: true}));
        $('cp-var').hidden = true;
        field.focus();
        field.setSelectionRange(start + token.length, start + token.length);
        // Met à jour la liste des variables du panneau MJ sans toucher aux champs
        let s = step(), card = cardOf(s);
        let box = $('cp-mj').querySelector('.cp-vars');
        let html = card ? varsHtml(card, s.type === 'card' ? card.choices : []) : '';
        let tmp = document.createElement('div');
        tmp.innerHTML = html;
        let list = tmp.querySelector('.cp-vars');
        if (box && list)
            box.replaceWith(list);
        else if (!box)
            render(false);
    }

    /* ---------- Ouverture et commandes ---------- */

    function open(getStory, from) {
        provider = getStory;
        fromId = from != null ? String(from) : null;
        story = provider();
        path = [{type: 'card', id: fromId || story.startId}];
        ahead = [];
        $('cp-title').textContent = story.title;
        if (!dialog().open)
            dialog().showModal();
        render(mode === 'play');
    }

    function close() {
        run++;
        stopTimer();
        if (dialog().open)
            dialog().close();
    }

    function init() {
        let d = dialog();
        if (!d)
            return;
        d.addEventListener('close', () => { run++; stopTimer(); });
        $('cp-close').addEventListener('click', close);
        $('cp-restart').addEventListener('click', () => { if (provider) open(provider, fromId); });
        $('cp-back').addEventListener('click', back);
        $('cp-forward').addEventListener('click', forward);
        $('cp-mark').addEventListener('click', toggleMarker);
        $('cp-jump').addEventListener('change', (e) => {
            let id = e.target.value;
            e.target.value = '';
            if (id)
                jumpTo(id);
        });
        document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
        $('cp-var-btn').addEventListener('click', openVarForm);
        $('cp-var-type').addEventListener('change', () => refreshVarForm(true));
        ['cp-var-article', 'cp-var-id', 'cp-var-upper'].forEach(id => $(id).addEventListener('change', () => refreshVarForm(false)));
        $('cp-var-insert').addEventListener('click', insertVar);
        $('cp-var-close').addEventListener('click', () => { $('cp-var').hidden = true; });
        d.addEventListener('focusin', (e) => {
            if (e.target.matches('textarea[data-edit], input[type="text"][data-edit]') && e.target.dataset.field !== 'marker')
                lastField = e.target;
        });
        $('cp-edit-block').addEventListener('click', () => {
            let s = step();
            let choice = s && s.type === 'reveal' && choiceOf(s);
            close();
            if (story && s)
                story.goTo(choice ? choice.revealId : s.id);
        });
        $('cp-path').addEventListener('click', (e) => {
            let btn = e.target.closest('[data-step]');
            if (!btn)
                return;
            let i = parseInt(btn.dataset.step);
            if (i === path.length - 1)
                return;
            ahead = ahead.concat(path.slice(i + 1).reverse());
            path = path.slice(0, i + 1);
            render(false);
        });
        $('cp-instant').addEventListener('change', (e) => {
            instant = e.target.checked;
            if (instant && writing)
                fast = true;
        });
        // Clic sur la carte pendant l'écriture : le texte s'accélère (comme en jeu)
        $('cp-card').addEventListener('click', () => { if (writing) fast = true; });

        // Modifications : chaque frappe part dans le bloc de l'éditeur
        d.addEventListener('input', (e) => {
            let f = e.target.closest('[data-edit]');
            if (!f || !story)
                return;
            let value = f.value;
            if (f.dataset.field === 'marker' && !value.trim())
                return;     // un marqueur vide se retire avec le bouton « Marquée »
            story.actions.edit(f.dataset.edit, f.dataset.field, value);
            story = provider();
            if (f.dataset.field === 'marker' || f.dataset.field === 'desc')
                renderNav();
            if (f.dataset.field === 'marker')
                $('cp-markers').innerHTML = markersHtml();
        });
        d.addEventListener('change', (e) => {
            let f = e.target.closest('[data-flag]');
            let card = cardOf(step());
            if (!f || !card)
                return;
            story.actions.edit(card.id, f.dataset.flag, f.checked ? 'on' : 'off');
            render(false);
        });

        d.addEventListener('click', (e) => {
            let t = e.target;
            let s = step();
            let card = cardOf(s);
            if (t.closest('[data-restart]'))
                return $('cp-restart').click();
            let sw = t.closest('[data-mode-switch]');
            if (sw)
                return setMode(sw.dataset.modeSwitch);
            let jump = t.closest('[data-jump]');
            if (jump)
                return jumpTo(jump.dataset.jump);
            let goBtn = t.closest('[data-go]');
            if (goBtn && card) {
                let c = card.choices.find(x => x.id === goBtn.closest('.cp-choice').querySelector('[data-edit]').dataset.edit);
                if (c && c.reveal != null)
                    return go({type: 'reveal', cardId: card.id, choiceId: c.id}, false);
                if (c && c.next != null)
                    return go({type: 'card', id: c.next}, false);
            }
            let create = t.closest('[data-create]');
            if (create && card) {
                if (create.dataset.create === 'choice') {
                    let id = story.actions.addChoice(card.id);
                    render(false);
                    let field = id != null && $('cp-choices').querySelector('[data-edit="' + CSS.escape(String(id)) + '"]');
                    if (field)
                        field.focus();
                    return;
                }
                let choiceId = create.dataset.choice;
                if (create.dataset.create === 'next') {
                    let id = story.actions.addNext(choiceId);
                    if (id != null) {
                        story = provider();
                        go({type: 'card', id: String(id)}, false);
                        $('cp-edit').focus();
                    }
                }
                else if (story.actions.addReveal(choiceId) != null) {
                    story = provider();
                    go({type: 'reveal', cardId: card.id, choiceId: choiceId}, false);
                    $('cp-edit').focus();
                }
            }
        });

        // Raccourcis (hors champs de saisie) : ← → pour reculer / avancer, 1 à 3 pour les choix, M pour marquer
        d.addEventListener('keydown', (e) => {
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey)
                return;
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                back();
            }
            else if (e.key === 'ArrowRight') {
                e.preventDefault();
                forward();
            }
            else if (e.key === 'm' || e.key === 'M')
                toggleMarker();
            else if (/^[1-3]$/.test(e.key)) {
                let target = $('cp-choices').querySelector('[data-key="' + e.key + '"]');
                if (!target)
                    return;
                let btn = target.matches('button') ? target : target.querySelector('[data-go]');
                if (btn)
                    btn.click();
            }
        });
    }

    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', init);
    else
        init();

    return {open, close};
})();
