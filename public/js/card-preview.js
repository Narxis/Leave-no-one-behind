// Prévisualisation des cartes d'un lieu dans l'éditeur (/buildCard).
// Rejoue l'histoire telle qu'elle est en ce moment dans l'éditeur, même non
// enregistrée : texte tapé comme en jeu, chrono, choix mélangés, butin, résultats.
// L'éditeur fournit l'histoire via CardPreview.open(provider, fromId) : provider()
// renvoie l'état du lieu à cet instant (relu à chaque « Recommencer ») :
//   {title, startId, cards, goTo}
//   cards   : Map id → {id, num, desc, mjreveal, timer, shuffle, choices: [{id, value, mjreveal, loot, reveal | next}]}
//   startId : carte de départ du lieu ; fromId (facultatif) la remplace
//   goTo    : appelé avec l'id d'un bloc pour y aller dans l'éditeur
window.CardPreview = (function () {
    const TIMER_SECONDS = 30;          // comme en jeu (card.js)
    const STOP_TOKEN = '{....}';       // pause « .... » puis le texte repart à zéro
    const CHAR_DELAY = 21.7;
    const FAST_FACTOR = 15, FAST_CHARS = 5;
    const END_CHOICE = 'Continuer votre chemin';

    const $ = (id) => document.getElementById(id);
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    let provider = null, story = null, fromId = null;
    let path = [];          // étapes jouées : [{cardId, choiceIndex}]
    let run = 0;            // change à chaque nouvelle étape : stoppe l'écriture et le chrono en cours
    let fast = false, instant = false, writing = false;
    let timerHandle = null;

    const dialog = () => $('cp-dialog');

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
                box.innerText = parts[parts.length - 1];
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
        if (!instant)
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

    /* ---------- Affichage ---------- */

    function choiceButtons(list, onPick) {
        let box = $('cp-choices');
        box.innerHTML = '';
        list.forEach((item, i) => {
            let btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cp-choice' + (item.missing ? ' is-missing' : '');
            btn.innerHTML = '<span>' + esc(item.label || '(choix sans texte)') + '</span>'
                + (item.missing ? '<small>pas encore de suite</small>' : '');
            btn.style.animationDelay = (i * 90) + 'ms';
            btn.addEventListener('click', () => onPick(item));
            box.append(btn);
        });
    }

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

    // Panneau MJ : infos MJ de la carte et de chaque choix, ce qui suit chaque choix
    function renderMj(card, order) {
        let html = '';
        if (card) {
            html += '<p class="cp-mj-line"><b>Carte n° ' + card.num + '</b>'
                + (card.timer ? ' <span class="cp-tag"><i class="fas fa-stopwatch"></i> Chrono ' + TIMER_SECONDS + ' s</span>' : '')
                + (card.shuffle ? ' <span class="cp-tag"><i class="fas fa-random"></i> Choix mélangés</span>' : '') + '</p>';
            html += card.mjreveal ? '<p class="cp-mj-note">' + esc(card.mjreveal) + '</p>' : '<p class="cp-mj-empty">Pas d\'infos MJ sur cette carte.</p>';
            if (card.timer)
                html += '<p class="cp-mj-hint">Au bout du chrono, seul le dernier choix de la carte reste proposé.</p>';
            html += '<ol class="cp-mj-choices">';
            for (let c of order) {
                let after = c.reveal != null ? 'Résultat' : c.next != null ? 'Carte n° ' + story.cards.get(c.next).num : 'Aucune suite';
                html += '<li><span class="cp-mj-choice">' + esc(c.value || '(sans texte)') + '</span>'
                    + '<span class="cp-mj-after' + (c.reveal == null && c.next == null ? ' is-missing' : '') + '"><i class="fas fa-long-arrow-alt-right"></i> ' + after + '</span>'
                    + (c.mjreveal ? '<span class="cp-mj-note">' + esc(c.mjreveal) + '</span>' : '')
                    + (c.loot.length ? '<span class="cp-mj-loot">' + lootHtml(c.loot) + '</span>' : '')
                    + '</li>';
            }
            html += '</ol>';
        }
        $('cp-mj').innerHTML = html;
    }

    function renderPath() {
        let crumbs = path.map((step, i) => {
            let card = story.cards.get(step.cardId);
            return '<button type="button" data-step="' + i + '"' + (i === path.length - 1 ? ' aria-current="step"' : '') + '>n° ' + (card ? card.num : '?') + '</button>';
        });
        $('cp-path').innerHTML = crumbs.join('<i class="fas fa-angle-right"></i>');
        $('cp-back').disabled = path.length < 2;
    }

    function setEnd(kind, text) {
        let box = $('cp-end');
        box.hidden = !kind;
        if (!kind)
            return;
        box.className = 'cp-end ' + kind;
        box.innerHTML = text;
    }

    /* ---------- Déroulé ---------- */

    // Joue la dernière étape du parcours
    async function play() {
        let token = ++run;
        stopTimer();
        setEnd(null);
        showLoot([]);
        let step = path[path.length - 1];
        let card = story.cards.get(step.cardId);
        renderPath();
        $('cp-choices').innerHTML = '';
        if (!card) {
            $('cp-text').innerText = '';
            renderMj(null, []);
            return setEnd('is-warn', '<i class="fas fa-exclamation-triangle"></i> Cette carte n\'existe plus dans l\'éditeur.');
        }
        $('cp-card-num').textContent = 'Carte n° ' + card.num;
        // Ordre des choix : tiré une fois par étape (comme un tirage en jeu), gardé si on revient dessus
        if (!step.order) {
            step.order = card.choices.map((c, i) => i);
            if (card.shuffle)
                shuffle(step.order);
        }
        let order = step.order.map(i => card.choices[i]).filter(Boolean);
        renderMj(card, order);
        if (!(await write(card.desc || '(carte sans texte)', token)))
            return;
        if (!order.length)
            return setEnd('is-warn', '<i class="fas fa-exclamation-triangle"></i> Cette carte ne propose aucun choix : en jeu, l\'histoire resterait bloquée ici.'
                + ' <button type="button" class="cp-link" data-goto="' + card.id + '">Aller à la carte</button>');
        let pick = (c) => choose(card, c, token);
        let items = order.map(c => ({label: c.value, missing: c.reveal == null && c.next == null, choice: c}));
        choiceButtons(items, (item) => pick(item.choice));
        if (card.timer && !instantTimerOff())
            startTimer(token, async () => {
                // Comme en jeu : il ne reste que le dernier choix de la carte
                let last = card.choices[card.choices.length - 1];
                await hideChoices();
                if (token !== run)
                    return;
                choiceButtons([{label: last.value, missing: last.reveal == null && last.next == null, choice: last}], (item) => pick(item.choice));
            });
    }

    const instantTimerOff = () => $('cp-no-timer').checked;

    async function hideChoices() {
        let list = $('cp-choices').querySelectorAll('.cp-choice');
        list.forEach((b, i) => setTimeout(() => b.classList.add('is-leaving'), i * 50));
        await sleep(instant ? 0 : 350 + list.length * 50);
    }

    async function choose(card, choice, token) {
        if (token !== run)
            return;
        stopTimer();
        if (choice.reveal == null && choice.next == null) {
            // Choix incomplet : on le signale sans quitter la carte
            return setEnd('is-warn', '<i class="fas fa-exclamation-triangle"></i> Ce choix n\'a pas encore de suite (carte suivante ou résultat).'
                + ' <button type="button" class="cp-link" data-goto="' + choice.id + '">Aller au choix</button>');
        }
        token = ++run;
        await hideChoices();
        if (token !== run)
            return;
        $('cp-choices').innerHTML = '';
        setEnd(null);
        if (choice.reveal != null) {
            if (!(await write(choice.reveal || '(résultat sans texte)', token)))
                return;
            showLoot(choice.loot);
            choiceButtons([{label: END_CHOICE}], () => {
                run++;
                $('cp-choices').innerHTML = '';
                setEnd('is-done', '<i class="fas fa-flag-checkered"></i> Fin du lieu. En jeu, la partie reprendrait avec la carte suivante du deck.'
                    + ' <button type="button" class="cp-link" data-restart>Rejouer depuis le début</button>');
            });
            return;
        }
        showLoot(choice.loot);
        if (choice.loot.length && !instant)
            await sleep(1200);
        if (token !== run)
            return;
        path.push({cardId: choice.next});
        play();
    }

    function shuffle(list) {
        for (let i = list.length - 1; i > 0; i--) {
            let j = Math.floor(Math.random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    }

    /* ---------- Ouverture et commandes ---------- */

    function open(getStory, from) {
        provider = getStory;
        fromId = from != null ? String(from) : null;
        story = provider();
        path = [{cardId: fromId || story.startId}];
        $('cp-title').textContent = story.title;
        if (!dialog().open)
            dialog().showModal();
        play();
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
        $('cp-restart').addEventListener('click', () => {
            if (provider)
                open(provider, fromId);
        });
        $('cp-back').addEventListener('click', () => {
            if (path.length < 2)
                return;
            path.pop();
            delete path[path.length - 1].order;
            play();
        });
        $('cp-edit').addEventListener('click', () => {
            let step = path[path.length - 1];
            close();
            if (story && step)
                story.goTo(step.cardId);
        });
        $('cp-path').addEventListener('click', (e) => {
            let btn = e.target.closest('[data-step]');
            if (!btn)
                return;
            path = path.slice(0, parseInt(btn.dataset.step) + 1);
            delete path[path.length - 1].order;
            play();
        });
        $('cp-instant').addEventListener('change', (e) => {
            instant = e.target.checked;
            if (instant && writing)
                fast = true;
        });
        // Clic sur la carte pendant l'écriture : le texte s'accélère (comme en jeu)
        $('cp-card').addEventListener('click', () => { if (writing) fast = true; });
        $('cp-dialog').addEventListener('click', (e) => {
            let go = e.target.closest('[data-goto]');
            if (go) {
                close();
                story.goTo(go.dataset.goto);
            }
            if (e.target.closest('[data-restart]'))
                $('cp-restart').click();
        });
    }

    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', init);
    else
        init();

    return {open, close};
})();
