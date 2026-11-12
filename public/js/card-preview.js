// Preview of a place's cards in the editor (/buildCard).
// Two modes:
//  - Play: the story as it is in the editor, even unsaved,
//    as in a game (typed text, timer, shuffled choices, loot, results);
//  - Edit: the card and its choices are edited directly, changes
//    go into the editor blocks (to be saved as usual).
// Navigation: back / next, trail of played cards, "Aller à", markers, shortcuts.
//
// The editor opens the test with CardPreview.open(provider, fromId). provider()
// returns the state of the place at that moment (re-read at each step):
//   {title, startId, cards, goTo, actions}
//   cards   : Map id → {id, num, desc, mjreveal, timer, shuffle, marker,
//                       choices: [{id, value, mjreveal, loot, reveal, revealId, next, roll}]}
//             roll: null, or {stat, success, failure} for a choice with a roll, each
//             follow-up being {reveal, revealId, next} (the choice's reveal and next set to null)
//             outcomes: null, or [{weight, reveal, revealId, next}] (random outcomes)
//   goTo    : called with a block id to go to it in the editor
//   actions : edit(id, field, value), addChoice(cardId), addNext(choiceId, output), addReveal(choiceId, output)
//             (return the id of the created block; output: 'output_2' for the "failure" follow-up of a roll)
window.CardPreview = (function () {
    const TIMER_SECONDS = 30;          // as in game (card.js)
    const STOP_TOKEN = '{....}';       // pause "...." then the text starts over
    const CHAR_DELAY = 21.7;
    const FAST_FACTOR = 15, FAST_CHARS = 5;
    const MAX_CHOICES = 3;
    const END_CHOICE = 'Continuer votre chemin';
    const DEFAULT_MARKER = 'À revoir';

    const $ = (id) => document.getElementById(id);
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const short = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
    const suiteOk = (x) => !!x && (x.reveal != null || x.next != null);
    const hasNext = (c) => c.outcomes ? c.outcomes.every(suiteOk) : c.roll ? suiteOk(c.roll.success) && suiteOk(c.roll.failure) : suiteOk(c);
    const ISSUES = {success: 'réussite', failure: 'échec'};
    // Outcome of a step: 'success' / 'failure' (roll) or 'o0', 'o1'… (random outcome)
    const outcomeIndex = (issue) => /^o\d+$/.test(issue || '') ? parseInt(issue.slice(1)) : -1;
    const issueName = (issue) => ISSUES[issue] || 'issue ' + (outcomeIndex(issue) + 1);
    const issueOutput = (issue) => issue === 'failure' ? 'output_2' : 'output_' + (Math.max(outcomeIndex(issue), 0) + 1);
    const chances = (list) => {
        let total = list.reduce((a, o) => a + o.weight, 0);
        return list.map(o => total > 0 ? Math.round(100 * o.weight / total) : Math.round(100 / list.length));
    };
    // Weighted draw, as in game (src/models/card.js, drawOutcome)
    function drawOutcome(list) {
        let total = list.reduce((a, o) => a + o.weight, 0);
        if (!(total > 0))
            return Math.floor(Math.random() * list.length);
        let r = Math.random() * total;
        for (let i = 0; i < list.length; i++)
            if ((r -= list[i].weight) < 0)
                return i;
        return list.length - 1;
    }
    const ROLL_TITLES = {combat: 'Jet de combat', pilotage: 'Jet de pilotage', engineering: 'Jet d\'ingénierie', survival: 'Jet de survie', recon: 'Jet de reconnaissance'};
    const rollLabel = (roll) => ROLL_TITLES[roll.stat] || 'Jet';

    let provider = null, story = null, fromId = null;
    // Steps: {type: 'card', id, order} or {type: 'reveal', cardId, choiceId, issue}
    // (issue: 'success' / 'failure' for the result of a choice with a roll)
    let path = [], ahead = [];
    let mode = 'play';
    let run = 0;            // changes on each new display: stops the current typing and timer
    let fast = false, instant = false, writing = false;
    let timerHandle = null;
    let timerPaused = false;    // during a roll: the timer waits for the result

    const dialog = () => $('cp-dialog');
    const step = () => path[path.length - 1];
    const cardOf = (s) => s && story.cards.get(s.type === 'card' ? s.id : s.cardId);
    const choiceOf = (s) => { let card = cardOf(s); return card && card.choices.find(c => c.id === s.choiceId); };
    // Follow-up shown by a "result" step: the choice's, or the roll's
    const suiteOf = (choice, issue) => choice && (outcomeIndex(issue) >= 0 ? (choice.outcomes || [])[outcomeIndex(issue)]
        : issue && choice.roll ? choice.roll[issue] : choice);

    /* ---------- Text variables: [article_type_number] ---------- */

    // Same rule as the game (src/models/card.js, getRandomVar): [le_race_1] becomes
    // "le Fnek", a capital at the start gives a capital, the same number gives
    // the same value within a text, two different numbers give different values
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

    // Why a variable won't work in game ('' if it is fine)
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
                return '‹' + v.type + '›';      // game setting, only known in game
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

    // Draw kept per step: going back to a card doesn't re-roll its variables
    function shown(s, text) {
        s.cache = s.cache || {};
        if (!(text in s.cache))
            s.cache[text] = resolveVars(text, s.picks = s.picks || {});
        return s.cache[text];
    }

    /* ---------- Text typed as in game ---------- */

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
                // Instant text: only what follows the last pause stays shown, as at the end of typing
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

    /* ---------- Timer ---------- */

    function stopTimer() {
        clearInterval(timerHandle);
        timerHandle = null;
        timerPaused = false;
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
            if (timerPaused)
                return;
            left--;
            el.querySelector('span').textContent = Math.max(left, 0);
            el.classList.toggle('is-low', left <= 5);
            if (left <= 0) {
                stopTimer();
                onEnd();
            }
        }, 1000);
    }

    /* ---------- Small display pieces ---------- */

    // Loot entries: a name, or {name, qty} for several copies
    function lootHtml(names) {
        return names.map(entry => {
            let obj = entry && typeof entry === 'object';
            let name = String(obj ? entry.name : entry), qty = obj && entry.qty > 1 ? entry.qty : 1;
            let known = (window.LOOT_ITEMS || []).find(it => it.name.toLowerCase() === name.toLowerCase());
            return '<span class="cp-loot-chip' + (known ? '' : ' is-custom') + '">'
                + (known && known.image ? '<img src="' + esc(known.image) + '" alt="">' : '<b>' + esc(name.charAt(0)) + '</b>')
                + esc(name) + (qty > 1 ? ' ×' + qty : '') + '</span>';
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

    const suiteLabel = (x) => !x ? 'Aucune suite' : x.reveal != null ? 'Résultat' : x.next != null ? 'Carte n° ' + story.cards.get(x.next).num : 'Aucune suite';
    const afterLabel = (c) => c.outcomes ? 'Au hasard : ' + chances(c.outcomes).map((pct, k) => (k + 1) + ' (' + pct + ' %) → ' + suiteLabel(c.outcomes[k])).join(', ')
        : c.roll ? rollLabel(c.roll) + ' : réussite → ' + suiteLabel(c.roll.success) + ', échec → ' + suiteLabel(c.roll.failure) : suiteLabel(c);

    // Trail of steps, "Aller à" list, back / next buttons, marker
    function renderNav() {
        $('cp-path').innerHTML = path.map((s, i) => {
            let card = cardOf(s);
            let label = s.type === 'reveal' ? 'Résultat' + (s.issue ? ' (' + issueName(s.issue) + ')' : '') : 'n° ' + (card ? card.num : '?');
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

    // GM panel: card info (editable in Edit mode), choice follow-ups, markers
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
            let how = !s.issue ? '' : outcomeIndex(s.issue) >= 0 ? ' (issue ' + (outcomeIndex(s.issue) + 1) + ' sur ' + ((choice && choice.outcomes) || []).length + ', tirée au hasard)'
                : ' (jet ' + (s.issue === 'success' ? 'réussi' : 'raté') + ')';
            html += '<p class="cp-mj-line"><b>Résultat</b>' + how + ' du choix « ' + esc(short(choice && choice.value, 40)) + ' »</p>'
                + '<p class="cp-mj-hint">En jeu, la partie reprend ensuite avec la carte suivante du deck.</p>';
        }
        html += varsHtml(card, order);
        html += '<h3 class="cp-mj-sub"><i class="fas fa-bookmark"></i> Marqueurs</h3><div id="cp-markers">' + markersHtml() + '</div>';
        $('cp-mj').innerHTML = html;
    }

    // Step variables: sample value (Edit mode) or drawn value (Play mode)
    function varsHtml(card, order) {
        let s = step();
        let texts = s.type === 'reveal' ? [(suiteOf(choiceOf(s), s.issue) || {}).reveal]
            : [card.desc, card.mjreveal].concat(order.flatMap(c => [c.value, c.mjreveal]));
        let found = [...new Set(texts.join(' ').match(VAR_RE) || [])];
        if (mode === 'play')
            texts.forEach(t => shown(s, t || ''));     // values drawn in the texts themselves
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

    /* ---------- Displaying a step ---------- */

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
            // Order of the choices drawn once per step (like a draw in game), kept when coming back to it
            s.order = card.choices.map(c => c.id);
            if (card.shuffle && mode === 'play')
                shuffle(s.order);
        }
        renderNav();
        if (!card || (s.type === 'reveal' && (suiteOf(choiceOf(s), s.issue) || {}).reveal == null)) {
            $('cp-text').innerText = '';
            $('cp-edit').hidden = true;
            renderMj(null, []);
            return setEnd('is-warn', '<i class="fas fa-exclamation-triangle"></i> Ce bloc n\'existe plus dans l\'éditeur.');
        }
        // Choices in the drawn order, then those added since
        let order = s.type === 'card' ? s.order.map(id => card.choices.find(c => c.id === id)).filter(Boolean)
            .concat(card.choices.filter(c => !s.order.includes(c.id))) : [];
        renderMj(card, order);
        if (s.type === 'reveal')
            return renderReveal(card, choiceOf(s), suiteOf(choiceOf(s), s.issue), token, animate);
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
                // As in game: only the last choice of the card remains
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

    async function renderReveal(card, choice, suite, token, animate) {
        $('cp-card-num').textContent = 'Résultat' + (step().issue ? ' (' + issueName(step().issue) + ')' : '');
        if (mode === 'edit') {
            showEditor(suite.revealId, 'reveal', suite.reveal, 'Ce qui arrive à la fin de ce choix…');
            showLoot(choice.loot);
            return setEnd('is-done', '<i class="fas fa-flag-checkered"></i> Fin de cette branche du lieu.');
        }
        $('cp-edit').hidden = true;
        $('cp-text').hidden = false;
        if (animate) {
            if (!(await write(shown(step(), suite.reveal) || '(résultat sans texte)', token)))
                return;
        }
        else
            $('cp-text').innerText = lastPart(shown(step(), suite.reveal) || '(résultat sans texte)');
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

    // Large text field in place of the card text
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
            // Follow-up (or, for a roll, "success" and "failure" follow-ups): go there, or create it
            let suiteHtml = (x, issue) => {
                let tag = issue ? ' data-issue="' + issue + '"' : '';
                let label = !issue ? '' : outcomeIndex(issue) >= 0
                    ? '<b class="cp-issue is-outcome">Issue ' + (outcomeIndex(issue) + 1) + ' · ' + chances(c.outcomes)[outcomeIndex(issue)] + ' %</b> '
                    : '<b class="cp-issue is-' + issue + '">' + (issue === 'success' ? 'Réussite' : 'Échec') + '</b> ';
                return suiteOk(x)
                    ? '<button type="button" class="cp-go" data-go="' + i + '"' + tag + ' title="Aller à cette suite">' + label + suiteLabel(x) + ' <i class="fas fa-arrow-right"></i></button>'
                    : '<span class="cp-go-new">' + label + '<button type="button" data-create="next" data-choice="' + esc(c.id) + '"' + tag + '><i class="fas fa-plus"></i> Carte suivante</button>'
                        + '<button type="button" data-create="reveal" data-choice="' + esc(c.id) + '"' + tag + '><i class="fas fa-plus"></i> Résultat</button></span>';
            };
            row.innerHTML = '<kbd>' + (i + 1) + '</kbd>'
                + '<input type="text" maxlength="200" data-edit="' + esc(c.id) + '" data-field="choice" placeholder="Texte du choix" value="' + esc(c.value) + '">'
                + (c.outcomes ? '<span class="cp-roll-suites">' + c.outcomes.map((o, k) => suiteHtml(o, 'o' + k)).join('') + '</span>'
                    : c.roll ? '<span class="cp-roll-suites">' + suiteHtml(c.roll.success, 'success') + suiteHtml(c.roll.failure, 'failure') + '</span>' : suiteHtml(c));
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

    /* ---------- Moving around ---------- */

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
        if (choice.roll) {
            // As in game: timer paused, the GM says whether the roll succeeded
            timerPaused = true;
            await hideChoices();
            if (token === run)
                askRoll(card, choice, token);
            return;
        }
        stopTimer();
        token = ++run;
        await hideChoices();
        if (token !== run)
            return;
        if (choice.outcomes) {
            // Outcome drawn at random according to the weights, as in game
            let k = drawOutcome(choice.outcomes);
            return follow(card, choice, 'o' + k, choice.outcomes[k], token);
        }
        follow(card, choice, null, choice, token);
    }

    // Follow-up of a choice, or of its roll result (outcome)
    async function follow(card, choice, issue, suite, token) {
        if (suite.reveal != null)
            return go({type: 'reveal', cardId: card.id, choiceId: choice.id, issue: issue}, true);
        showLoot(choice.loot);
        if (choice.loot.length && !instant)
            await sleep(1200);
        if (token === run)
            go({type: 'card', id: suite.next}, true);
    }

    function askRoll(card, choice, token) {
        let box = $('cp-choices');
        box.innerHTML = '<div class="cp-roll"><b><i class="fas fa-dice-d20"></i> ' + rollLabel(choice.roll) + '</b>'
            + '<span>« ' + esc(short(shown(step(), choice.value), 60)) + ' » : chrono en pause, le MJ valide le résultat.</span>'
            + '<span class="cp-roll-btns">'
            + '<button type="button" class="cp-choice is-success" data-key="1" data-roll="success"><kbd>1</kbd><span>Réussi</span><small>' + suiteLabel(choice.roll.success) + '</small></button>'
            + '<button type="button" class="cp-choice is-failure" data-key="2" data-roll="failure"><kbd>2</kbd><span>Raté</span><small>' + suiteLabel(choice.roll.failure) + '</small></button>'
            + '<button type="button" class="cp-choice is-cancel" data-key="3" data-roll="cancel"><kbd>3</kbd><span>Annuler</span></button>'
            + '</span></div>';
        box.querySelectorAll('[data-roll]').forEach(btn => btn.addEventListener('click', async () => {
            if (token !== run)
                return;
            let issue = btn.dataset.roll;
            if (issue === 'cancel') {
                timerPaused = false;
                return playChoices(cardOrder(card), card, token);
            }
            stopTimer();
            token = ++run;
            await hideChoices();
            if (token === run)
                follow(card, choice, issue, choice.roll[issue], token);
        }));
    }

    // Card choices in the order drawn for the step
    function cardOrder(card) {
        let s = step();
        return (s.order || card.choices.map(c => c.id)).map(id => card.choices.find(c => c.id === id)).filter(Boolean);
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

    /* ---------- Inserting a variable (Edit mode) ---------- */

    let lastField = null;       // last text field used: the variable is inserted there

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
        // Updates the GM panel's variable list without touching the fields
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

    /* ---------- Opening and controls ---------- */

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
            let suite = s && s.type === 'reveal' && suiteOf(choiceOf(s), s.issue);
            close();
            if (story && s)
                story.goTo(suite ? suite.revealId : s.id);
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
        // Click on the card while typing: the text speeds up (as in game)
        $('cp-card').addEventListener('click', () => { if (writing) fast = true; });

        // Edits: each keystroke goes into the editor block
        d.addEventListener('input', (e) => {
            let f = e.target.closest('[data-edit]');
            if (!f || !story)
                return;
            let value = f.value;
            if (f.dataset.field === 'marker' && !value.trim())
                return;     // an empty marker is removed with the "Marquée" button
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
                let issue = goBtn.dataset.issue || null;
                let suite = suiteOf(c, issue);
                if (suite && suite.reveal != null)
                    return go({type: 'reveal', cardId: card.id, choiceId: c.id, issue: issue}, false);
                if (suite && suite.next != null)
                    return go({type: 'card', id: suite.next}, false);
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
                let issue = create.dataset.issue || null;
                let output = issueOutput(issue);
                if (create.dataset.create === 'next') {
                    let id = story.actions.addNext(choiceId, output);
                    if (id != null) {
                        story = provider();
                        go({type: 'card', id: String(id)}, false);
                        $('cp-edit').focus();
                    }
                }
                else if (story.actions.addReveal(choiceId, output) != null) {
                    story = provider();
                    go({type: 'reveal', cardId: card.id, choiceId: choiceId, issue: issue}, false);
                    $('cp-edit').focus();
                }
            }
        });

        // Shortcuts (outside input fields): ← → to go back / forward, 1 to 3 for the choices, M to mark
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
