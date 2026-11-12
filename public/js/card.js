var currentCard = {};
var interval_cd;
var countDownRunning = false;
// The countdown is paused during combat (combat.js) and during
// a choice roll: one reason per pause, it restarts when there are none left
var countDownPauses = new Set();

// Against misclicks: a clicked choice only goes through after this delay,
// with a "Annuler" button; another click during the delay changes the choice
const CHOICE_CONFIRM_DELAY = 2500;
// A lone button ("Continuer votre chemin"...) goes through right away
const CHOICE_CONFIRM_MIN_CHOICES = 2;
// Pending choice: {btn, timeout, commit}
var pendingChoice = null;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getActiveStatus () {
    const rawResponse = await fetch('/api/statuses/active', { // will need to add /active
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
    });
    return JSON.parse(await rawResponse.text());
}

async function getNextCard (pop=false) {
    const rawResponse = await fetch('/api/nextCard/'+(pop ? 'pop' : 'get'), {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
    });

    return JSON.parse(await rawResponse.text());
}

async function getCardByName (name) {
    const rawResponse = await fetch('/api/nextCard/get/' + name, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
    });

    return JSON.parse(await rawResponse.text());
}

// Countdown shown to online players (playerView.setTimer)
function announceTimer(left, paused) {
    if (typeof wsLNOB === 'undefined')
        return;
    wsLNOB.send({action: 'card-timer', data: {cardId: currentCard.id, left: left, paused: !!paused}});
}

function startCountDown() {

    let time_left = 30;
    let pausedSent = false;
    countDownRunning = true;

    const tick = async function () {
        if (countDownPauses.size) {
            if (!pausedSent)
                announceTimer(time_left + 1, true);
            pausedSent = true;
            return;
        }
        pausedSent = false;
        if (time_left > 0) {
            TimerAnim.tick(time_left);
            announceTimer(time_left);
            time_left--;
            return;
        }
        // Timer at 0 during the delay: the choice already clicked is kept
        if (pendingChoice) {
            pendingChoice.commit();
            return;
        }
        clearInterval(interval_cd);
        countDownRunning = false;
        announceTimer(0);
        // The choices also go to the players, for the duration of the animation
        announceScreen(undefined, []);
        let choicetab = document.getElementById('choicetab');
        TimerAnim.tick(0);
        choicetab.style.pointerEvents = 'none';
        await sleep(500);
        await hideChoices();
        choicetab.style.pointerEvents = '';
        await TimerAnim.finish();
        currentCard.choices = currentCard.choices.slice(-1);
        await showChoices();
    };
    tick();
    interval_cd = setInterval(tick, 1000);
}

async function stopCountdown() {
    if (typeof interval_cd !== 'undefined' && countDownRunning) {
        clearInterval(interval_cd);
        countDownRunning = false;
        announceTimer(0);
        await TimerAnim.cancel();
    }
}

// Called by combat.js: the timer stops at the start of combat and resumes
// where it was at the end (same thing during a choice roll)
function pauseCountDown(paused, reason = 'combat') {
    if (paused)
        countDownPauses.add(reason);
    else
        countDownPauses.delete(reason);
}

async function initialiseModTabs() {
    var mod = document.getElementById('modtab');
    var modTabs = mod.getElementsByClassName('tab');

    for (let i = 0; i < modTabs.length; i++) {
        await sleep(100);
        modTabs.item(i).classList.remove('move-right');
    }
}
async function initialisePlayerTab() {
    var playerTab = document.querySelectorAll('.player-tab');
    for (let i = 0; i < playerTab.length; i++) {
        playerTab.item(i).classList.remove('load-in');
        await sleep(100)
    }
}
async function initialiseleLeftTabs() {
    var consommableTabVar = document.getElementsByClassName('consommable-tab');
    var todoListVar = document.getElementsByClassName('todoList');
    var modsLeftVar = document.getElementsByClassName('mods-left');
    await sleep(1000);
    consommableTabVar.item(0).classList.remove('slide-right');
    todoListVar.item(0).classList.remove('hidden');
    modsLeftVar.item(0).classList.remove('hidden');
}

async function initialiseStatusList (){
    var activeStatus = await getActiveStatus();

    activeStatusList = [];
    document.querySelector(".status").innerHTML = '<div class="status-title-line">\<div class="status-title1">Status :</div><div class="status-title2">Durée</div></div>';
    for (let i=0; i<activeStatus.length; i++){
        addStatus(activeStatus[i]);
        activeStatusList.push(activeStatus[i].slug)
    }
}

// The chest is redrawn by the "inventory" event (inventory.js)
function removeStarterItem(id, slug) {
    wsLNOB.delItem(slug, id);
}

function quickUpdateModule(el, mod, left=false) {
    let currentVal;
    let input;
    let inputVal='';
    let isCryopods = mod === 'cryopods';
    let maxVal = isCryopods ? 1000 : 100;
    if (left) {
        currentVal = parseInt(document.querySelector('#'+mod+'-value').innerText) || 0;
    }
    else {
        currentVal = parseInt(document.querySelector('#modtab #dial-'+mod).getAttribute('data-value')) || 0;
        input = document.getElementsByName('i-'+ mod)[0];
        inputVal = input.value;
    }
    let modifier = 1;
    let newValue;

    // "+x" / "-x" in the box: offset applied as is, whatever the button
    let parsed = parseModuleInput(inputVal);
    if (parsed && parsed.delta) {
        input.value = '';
        newValue = Math.min(Math.max(currentVal + parsed.value, 0), maxVal);
        if (currentVal !== newValue)
            setModuleVal(mod, newValue, left);
        return;
    }

    if (el.classList.contains(left ? 'moins' : 'tab-moins')) {
        modifier = -1;
    }

    if (isCryopods)
        modifier *= 5;

    if (inputVal !== ''){
        modifier *= inputVal;
    }
    else {
        if (this.event.shiftKey) {
            modifier *= isCryopods ? 20 : 10;
        }
        else if (this.event.ctrlKey) {
            modifier *= isCryopods ? 2 : 5;
        }
    }

    newValue = currentVal + modifier;
    if (input)
        input.value = '';

    newValue = Math.min(Math.max(newValue, 0), maxVal);
    if (currentVal === newValue) return;

    setModuleVal(mod, newValue, left);
}

// Module box input: "+x" or "-x" = offset, number alone = value
function parseModuleInput(text) {
    let m = String(text || '').trim().replace(',', '.').match(/^([+-])?\s*(\d+(?:\.\d+)?)$/);
    if (!m)
        return null;
    let value = Math.round(Number(m[2]));
    return m[1] ? {delta: true, value: m[1] === '-' ? -value : value} : {delta: false, value: value};
}

// Enter in a module box: applies the offset (+x / -x) or the typed value
function submitModuleInput(input, mod) {
    let parsed = parseModuleInput(input.value);
    input.value = '';
    if (!parsed)
        return;
    let currentVal = parseInt(document.querySelector('#modtab #dial-'+mod).getAttribute('data-value')) || 0;
    let newValue = parsed.delta ? currentVal + parsed.value : parsed.value;
    newValue = Math.min(Math.max(newValue, 0), 100);
    if (currentVal !== newValue)
        setModuleVal(mod, newValue, false);
}

document.querySelectorAll('#modtab .form-input').forEach(input => {
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter')
            submitModuleInput(input, input.name.replace(/^i-/, ''));
    });
});

// Choices that cost (or yield) humans: applied on click
function changeHumans(delta) {
    let counter = document.querySelector('#cryopods-value');
    let current = parseInt(counter.innerText) || 0;
    setModuleVal('cryopods', current + delta, true);

    let pop = document.createElement('div');
    pop.className = 'human-delta ' + (delta < 0 ? 'loss' : 'gain');
    pop.textContent = (delta > 0 ? '+' : '') + delta;
    counter.parentElement.append(pop);
    setTimeout(() => pop.remove(), 1800);
}

function setModuleVal(mod, newValue, left) {
    if (typeof wsLNOB === 'undefined'){
        console.error('YOU MUST INCLUDE socketLNOB.js before this');
    }
    let isCryopods = mod === 'cryopods';
    let maxVal = isCryopods ? 1000 : 100;

    // A non-numeric value (empty box, invalid input) must never
    // be displayed or sent to the server
    newValue = Number(newValue);
    if (!Number.isFinite(newValue)) return;
    newValue = Math.min(Math.max(newValue, 0), maxVal);

    if (left) {
        let statVal = document.querySelector('#'+mod+'-value');
        statVal.innerText = newValue;
    }
    else {
        let statVal = document.querySelector('#modtab #dial-'+mod);
        statVal.setAttribute('data-value', newValue);

        let tooltip = statVal.querySelector('.mod-button');
        let newTooltip = tooltip.getAttribute('data-tooltip').replace(/\d+%$/, newValue + '%');
        tooltip.setAttribute('data-tooltip', newTooltip)
    }

    wsLNOB.setModule(mod, newValue);
}

const addStatus = (status) => {
    // let index = statusNameList.findIndex(e => e === statusname)
    // Status created on the fly: generic icon
    let svg = statusSvgList[status.slug] || statusSvgList.custom || '';
    const esc = (text) => String(text || '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
    // Status of a single player: their name next to it
    let name = esc(status.name) + (status.player_id ? ' <span class="status-player">(' + esc(status.player_name) + ')</span>' : '');

    const html = ` <div class="status-line" id="line_${status.id}" title="${esc(status.desc)}">
                        ${svg}
                        <div class="status-name">${name}</div>
                        <div class="status-duration">${status.duration}</div>
                    </div>`;
    document.querySelector(".status").innerHTML += html
    // wsLNOB.setStatus(status.slug, status.duration)
}

async function hideChoices() {
    let choicesActive = document.querySelectorAll('#choicetab .choice');

    for (let i = 0; i < choicesActive.length; i++) {
        choicesActive[i].classList.add('move-down');
        await sleep(50);
    }

    await sleep(1000);
    choicesActive.innerHTML = '';
}

async function initCard(forceName = null) {
    if (forceName) {
        currentCard = await getCardByName(forceName);
    }
    else {
        currentCard = await getNextCard(true);
        if (currentCard.type !== -1) {
            fastTravel();
            await sleep(fastTravelTime);
            await sleep(500);
        }
    }
    await initialiseStatusList();
    await writeCardDesc();
    if (currentCard.timer === 1)
        startCountDown();
    await showChoices();
}

// A new display (GM blank card) stops the current one
var showChoicesRun = 0;

// What the page shows, announced to the server for online players: they
// see the same text and vote on the same choices (votes.js)
var cardScreenText = '';
function announceScreen(chosen, choices) {
    if (typeof wsLNOB === 'undefined')
        return;
    // (a blank card has no number: "blank", as for the players)
    let data = {cardId: currentCard.blank ? 'blank' : currentCard.id, text: cardScreenText,
        choices: choices || (currentCard.choices || []).map(c => c.value)};
    if (chosen !== undefined)
        data.chosen = chosen;
    wsLNOB.send({action: 'card-screen', data: data});
}

// Players' votes: under each button, the role logo of those who
// chose it and the vote count
function showVotes(data) {
    if (!data)
        return;
    // (not the box of a pending roll)
    document.querySelectorAll('#choicetab .choice:not(.card-roll)').forEach(function (btn, i) {
        let count = (data.counts || [])[i] || 0;
        let badge = btn.querySelector('.vote-count');
        if (!count) {
            if (badge)
                badge.remove();
            return;
        }
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'vote-count';
            btn.append(badge);
        }
        badge.replaceChildren(voteRoleIcons((data.voters || []).filter(v => v.index === i)), count + (count > 1 ? ' votes' : ' vote'));
    });
}
document.addEventListener('votes', (e) => showVotes(e.detail.data));

async function showChoices() {
    let run = ++showChoicesRun;
    let choices = currentCard.choices;
    let choiceTab = document.getElementById('choicetab');
    choiceTab.innerHTML = '';
    announceScreen();
    // Only one choice per display: the buttons stay clickable while
    // they leave, a double click triggered the follow-up a second time
    // (two "Continuer votre chemin", two draws and a skipped card)
    let chosen = false;
    clearPendingChoice();
    const commit = async function (apply) {
        if (chosen)
            return;
        chosen = true;
        clearPendingChoice();
        // The timer stops in apply: a choice with a roll only pauses it
        await apply();
    };
    // A click puts the choice on hold (clicking the same one again does nothing)
    const pick = function (btn, apply) {
        if (chosen || (pendingChoice && pendingChoice.btn === btn))
            return;
        if (choices.length < CHOICE_CONFIRM_MIN_CHOICES)
            return commit(apply);
        clearPendingChoice();
        pendingChoice = {btn, commit: () => commit(apply)};
        armPendingChoice();
        showPendingChoice(btn);
    };
    for (let i=0; i<choices.length; i++) {
        if (run !== showChoicesRun)
            return;
        let choice = choices[i];
        let choiceBtn = document.createElement('button');
        choiceBtn.classList.add('choice');
        choiceBtn.classList.add('move-down');
        choiceBtn.id = 'choice' + i;
        choiceBtn.innerHTML = choice.value;
        // Follow-up of the choice, once the cancel delay has passed
        const apply = async function() {
            if (choice.other) {
                stopCountdown();
                return askBlankCard();
            }
            let next = choice;
            if (choice.roll) {
                // Roll needed: timer paused, the follow-up depends on the result
                let issue = await askCardRoll(choice);
                if (!issue)
                    return showChoices();   // roll cancelled: the choices come back, the timer restarts
                next = rollFollowUp(choice, issue);
            }
            // Choice kept (after a possible roll): the votes close
            announceScreen(i);
            stopCountdown();
            if (choice.blank !== undefined) {
                blankReturn = null;
                wsLNOB.send({action: 'blank-card-choice', data: {index: choice.blank}});
            }
            if (next.humans)
                changeHumans(next.humans);
            // Status given by the choice (the whole team)
            if (choice.status && choice.status.slug)
                wsLNOB.setStatus(choice.status.slug, choice.status.duration);
            // The choice opens the shop (merchant.js); the GM closes it from their menu
            if (choice.shop)
                wsLNOB.send({action: 'merchant-open', data: choice.shop});
            await hideChoices();
            await followChoice(next);
        };
        choiceBtn.addEventListener('mouseup', () => pick(choiceBtn, apply));
        choiceTab.append(choiceBtn);
        await sleep(150);
        choiceBtn.classList.remove('move-down');
    }
}

// Blank card (src/controllers/blankCard.js): "Autre…" lets the GM write
// what follows from their menu (mj-menu.js). Previous card kept for "Annuler"
const BLANK_WAIT_TEXT = "\n Action libre !\n\n Décrivez au MJ ce que vous tentez : il prépare la suite.";
const BLANK_NO_REVEAL = "\n Le MJ raconte la suite.";
var blankReturn = null;

async function askBlankCard() {
    blankReturn = {desc: currentCard.desc, choices: currentCard.choices};
    wsLNOB.send({action: 'blank-card-request', data: {desc: currentCard.desc}});
    await hideChoices();
    await writeCardDesc(BLANK_WAIT_TEXT);
}

document.addEventListener('blank-card-show', async function (e) {
    let card = e.detail.data;
    // Shown by the GM without "Autre…": it replaces the current card
    if (!blankReturn && !currentCard.blank)
        blankReturn = {desc: currentCard.desc, choices: currentCard.choices};
    clearPendingChoice();
    dropCardRoll();
    await stopCountdown();
    let choices = card.choices.map((c, i) => ({
        value: c.value,
        reveal: c.reveal || BLANK_NO_REVEAL,
        humans: c.humans,
        loot: c.loot,
        blank: i
    }));
    if (!choices.length) {
        let nextCard = await getNextCard();
        choices = [{value: 'Continuer votre chemin', continue: nextCard.value > 0 ? 2 : 1, blank: -1}];
    }
    currentCard = {blank: true, desc: card.desc, timer: 0, choices: choices};
    await hideChoices();
    document.getElementById('choicetab').innerHTML = '';
    await writeCardDesc(card.desc || ' ');
    await showChoices();
});

// The GM gives up: the previous card comes back with its choices
document.addEventListener('blank-card-cancel', async function () {
    if (!blankReturn)
        return;
    let back = blankReturn;
    blankReturn = null;
    clearPendingChoice();
    currentCard = Object.assign({}, currentCard, back, {blank: false});
    await hideChoices();
    document.getElementById('choicetab').innerHTML = '';
    await writeCardDesc(back.desc);
    await showChoices();
});

// The delay restarts on each choice; during combat it waits for the end
function armPendingChoice() {
    let pending = pendingChoice;
    pending.timeout = setTimeout(function () {
        if (pendingChoice !== pending)
            return;
        if (countDownPauses.size)
            return armPendingChoice();
        pending.commit();
    }, CHOICE_CONFIRM_DELAY);
}

// Pending choice highlighted, with "Annuler" and a draining bar
function showPendingChoice(btn) {
    document.getElementById('choicetab').classList.add('has-pending');
    btn.classList.add('choice-pending');
    btn.style.setProperty('--choice-delay', CHOICE_CONFIRM_DELAY + 'ms');

    let cancel = document.createElement('span');
    cancel.className = 'choice-cancel';
    cancel.setAttribute('role', 'button');
    cancel.textContent = 'Annuler';
    // The click on "Annuler" must not bubble up to the choice
    cancel.addEventListener('mouseup', function (e) {
        e.stopPropagation();
        clearPendingChoice();
    });
    let bar = document.createElement('span');
    bar.className = 'choice-delay-bar';
    btn.append(cancel, bar);
}

function clearPendingChoice() {
    if (!pendingChoice)
        return;
    clearTimeout(pendingChoice.timeout);
    let btn = pendingChoice.btn;
    btn.classList.remove('choice-pending');
    btn.querySelectorAll('.choice-cancel, .choice-delay-bar').forEach(e => e.remove());
    let choiceTab = document.getElementById('choicetab');
    if (choiceTab)
        choiceTab.classList.remove('has-pending');
    pendingChoice = null;
}

/* ---------- Choice roll: success or failure, confirmed by the GM ---------- */

const CARD_ROLL_TITLES = {combat: 'Jet de combat', pilotage: 'Jet de pilotage', engineering: 'Jet d\'ingénierie', survival: 'Jet de survie', recon: 'Jet de reconnaissance'};
var cardRollPending = null;     // {choice, resolve, ask} as long as the GM hasn't decided

// Follow-up of a choice with a roll: the result's, plus the choice's humans and loot
function rollFollowUp(choice, issue) {
    return {
        reveal: issue.reveal || '',
        next: issue.next || '',
        humans: (choice.humans || 0) + (issue.humans || 0),
        loot: (Array.isArray(choice.loot) ? choice.loot : []).concat(Array.isArray(issue.loot) ? issue.loot : [])
    };
}

// Shows the roll to make and waits for "success", "failure" (returns the follow-up) or "cancel" (null).
// The GM answers from their menu (card-roll-result) or with the card buttons
async function askCardRoll(choice) {
    pauseCountDown(true, 'roll');
    await hideChoices();
    let roll = choice.roll;
    let ask = {
        choice: choice.value,
        stat: roll.stat,
        mjreveal: choice.mjreveal || '',
        success: roll.success,
        failure: roll.failure
    };
    let box = document.createElement('div');
    box.className = 'choice card-roll move-down';
    box.innerHTML = '<div class="card-roll-title"><i class="fas fa-dice-d20"></i> ' + (CARD_ROLL_TITLES[roll.stat] || 'Jet') + '</div>'
        + '<div class="card-roll-choice"></div>'
        + '<div class="card-roll-hint">Le chrono est en pause : lancez les dés, le MJ valide le résultat.</div>'
        + '<div class="card-roll-btns">'
        + '<button type="button" class="card-roll-btn success" data-result="success">Réussi</button>'
        + '<button type="button" class="card-roll-btn failure" data-result="failure">Raté</button>'
        + '<button type="button" class="card-roll-btn cancel" data-result="cancel" title="Revenir aux choix">Annuler</button>'
        + '</div>';
    box.querySelector('.card-roll-choice').innerHTML = choice.value;
    let choiceTab = document.getElementById('choicetab');
    choiceTab.innerHTML = '';
    choiceTab.append(box);
    box.querySelectorAll('[data-result]').forEach(btn => btn.addEventListener('mouseup', () => sendCardRollResult(btn.dataset.result)));
    await sleep(50);
    box.classList.remove('move-down');

    return new Promise(resolve => {
        cardRollPending = {choice, resolve, ask, box};
        wsLNOB.triggerCustomEvent('card-roll-ask', ask);
    });
}

// Settled right away here, then sent to everyone to close the GM menu
function sendCardRollResult(result) {
    if (!cardRollPending)
        return;
    settleCardRoll(result);
    wsLNOB.triggerCustomEvent('card-roll-result', {result: result});
}

// Blank card shown during a roll: the roll is dropped with no follow-up
function dropCardRoll() {
    if (!cardRollPending)
        return;
    cardRollPending = null;
    pauseCountDown(false, 'roll');
    wsLNOB.triggerCustomEvent('card-roll-result', {result: 'cancel'});
}

function settleCardRoll(result) {
    let pending = cardRollPending;
    if (!pending || !['success', 'failure', 'cancel'].includes(result))
        return;
    cardRollPending = null;
    pauseCountDown(false, 'roll');
    pending.resolve(result === 'cancel' ? null : pending.choice.roll[result]);
}

document.addEventListener('card-roll-result', (e) => settleCardRoll(e.detail.data && e.detail.data.result));
// GM menu opened (or reloaded) during a roll: the request is sent to it again
document.addEventListener('card-roll-query', () => {
    if (cardRollPending)
        wsLNOB.triggerCustomEvent('card-roll-ask', cardRollPending.ask);
});
// Roll received while waiting (/roll or GM menu): the right button is highlighted, the GM confirms
document.addEventListener('roll', (e) => {
    let data = e.detail.data || {};
    if (!cardRollPending || (cardRollPending.choice.roll.stat && data.stat !== cardRollPending.choice.roll.stat))
        return;
    let box = cardRollPending.box;
    box.querySelectorAll('.card-roll-btn').forEach(b => b.classList.toggle('suggested', b.dataset.result === (data.success ? 'success' : 'failure')));
    box.querySelector('.card-roll-hint').textContent = 'Dernier jet : ' + data.result + (data.success ? ' (réussite)' : ' (échec)') + '. Le MJ valide le résultat.';
});

// What follows a choice (or the follow-up drawn by a roll): result, next card or planet
async function followChoice(choice) {
    let loot = Array.isArray(choice.loot) ? choice.loot : [];
    if (choice.reveal && choice.reveal !== ''){ // NEXT IS REVEAL

       await writeCardDesc(choice.reveal);
       await CardLoot.collect(loot);
       let nextCard = await getNextCard();
       currentCard.choices = [{
               value: 'Continuer votre chemin',
               continue: nextCard.value > 0 ? 2 : 1
           }];
       await showChoices();
    }
    else if (choice.continue && choice.continue === 1) { // NEXT IS CARD
       await initCard();
    }
    else if (choice.continue && choice.continue === 2) { // NEXT IS PLANET STEP 1
       let textPlanetEncounter = "\n \u00a0 Votre vaisseau s'approche d'une planète. \n \n \u00a0 Pendant la mise en orbite, vous êtes libre de vous déplacer à bord et de profiter des installations telles que la salle de cinéma, la cuisine, la salle d'entraînement, la bibliothèque, etc... \n \n\u00a0 Dirigez-vous vers la salle des scanners pour obtenir davantage d'informations sur cette planète.";
       await writeCardDesc(textPlanetEncounter);
       currentCard.choices = [{
           value: 'Aller dans la salle des scanners',
           continue: 3
       }];
       await showChoices();
    }
    else if (choice.continue && choice.continue === 3) { // NEXT IS PLANET STEP 2
        fastTravel();
        await sleep(fastTravelTime);
        window.location.href = '/next';
    }
    else if (choice.next && choice.next !== '') { // NEXT IS FOLLOWUP
       await CardLoot.collect(loot);
       await initCard(choice.next);
    }
}

// Click on the card while typing: the text speeds up a lot
// (reset on each new text)
var cardTextFast = false;
var cardTextWriting = false;
const CARD_TEXT_FAST_FACTOR = 15;   // pauses divided by 15
const CARD_TEXT_FAST_CHARS = 5;     // and 5 characters per pause

function cardTextPause(ms) {
    return sleep(cardTextFast ? ms / CARD_TEXT_FAST_FACTOR : ms);
}

// Text written, announced to online players: their page writes it at the same time
function announceCardText(data) {
    if (typeof wsLNOB !== 'undefined')
        wsLNOB.send({action: 'card-text', data: data});
}

async function writeCardDesc(text = null) {

    let currentText = '';
    let stopTokenToReplace = '{....}';
    let stopToken = '‡';
    let textDiv = document.querySelector('.card-text');
    text = text || currentCard.desc;
    cardScreenText = text;
    text = text.replaceAll(stopTokenToReplace, stopToken);
    cardTextFast = false;
    cardTextWriting = true;
    announceCardText({text: text.replaceAll(stopToken, stopTokenToReplace)});
    for (let i = 0; i <= text.length; i++) {
        textDiv.innerText = currentText;
        if (text.substring(i, i + 1) === stopToken) {
            for (let j=0; j<4; j++) {
                await cardTextPause(400);
                currentText += '.';
                textDiv.innerText = currentText;
            }
            currentText = '';
            await cardTextPause(500);
        } else {
            currentText += text.substring(i, i + 1)
        }
        if (!cardTextFast || i % CARD_TEXT_FAST_CHARS === 0)
            await cardTextPause(21.7)
    }
    textDiv.innerText = currentText;
    cardTextWriting = false;
}

document.addEventListener('mouseup', function (e) {
    if (cardTextWriting && !cardTextFast && e.button === 0 && e.target.closest('.container-card')) {
        cardTextFast = true;
        announceCardText({fast: true});
    }
});

(function(){
    initCard();
    initialiseModTabs();
    initialisePlayerTab();
    initialiseleLeftTabs();
    initialiseItemExpand()
    initialisePlayerExpander()
    initialiseStatusList();
    document.addEventListener('status', initialiseStatusList);
    document.addEventListener('roll',async function(e){
        let player =document.getElementById('player-tab'+e.detail.data.discord_id);
        let iconlist = player.querySelectorAll('.output-absolute');
        for (let i=0; i<iconlist.length; i++){
            iconlist.item(i).classList.add('hide-opacity')
        }
        await sleep(1000);
        player.querySelector('#output-'+e.detail.data.stat).classList.remove('hide-opacity')
    });
})();