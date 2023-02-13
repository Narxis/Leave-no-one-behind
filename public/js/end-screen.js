function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
var scoreMultiplier = ["Humain", "Etat du vaisseau", "Etat de la planète"];
var scoreAdder = ["Bonus carte", "Autres"]
var bonusCarte = score.scoreCards;
var shipState = score.scoreShip;
var humans = ship.cryopods;
var planetState = score.scorePlanet;
var other = 69;
var valueScoreMultiplier = [humans, shipState, planetState, bonusCarte, other];
var valueScoreAdder = [bonusCarte, other];
var currentscore = "1";
var scoring = false;
var iswritting = 0

async function scoreUp(oldscore, newscore, place, interval) {
    scoring = true;
    var from = oldscore;
    var to = newscore;

    while (from.length < to.length) {
        from = '0' + from;
    }
    var fromArr = ("" + from).split("").map(num => parseInt(num, 10));
    var toArr = ("" + to).split("").map(num => parseInt(num, 10));

    for (let i = (fromArr.length - 1); i >= 0; i--) {
        while (fromArr[i] !== toArr[i]) {
            fromArr[i]++;
            fromArr[i] = fromArr[i] % 10;

            let j = 0;

            while ((i - j) > 0) {
                if (fromArr[i - j] === 0) {
                    j++;
                    fromArr[i - j]++;
                }
                else
                    break;
            }

            await sleep(interval)
            var output = fromArr.join('');
            document.getElementById(place).innerText = (parseInt(output)).toLocaleString()
        }
    }
}

function strshow (str){
    let result = ""
    let resultArr = (str).split("").map(num => parseInt(num, 10));
    for (let i=0; i<str.length; i++) {
        if (i%3 == 0 && i != 0){
            result = " "+result;
        }
        result = resultArr.pop() + result;
    } 
    return result
}

async function scoreDown(oldscore, newscore, place, interval) {
    scoring = true;
    var from = oldscore;
    var to = newscore;

    while (to.length < from.length) {
        to = '0' + to;
    }
    var fromArr = ("" + from).split("").map(num => parseInt(num, 10));
    var toArr = ("" + to).split("").map(num => parseInt(num, 10));

    for (let i = (fromArr.length - 1); i >= 0; i--) {
        while (fromArr[i] !== toArr[i]) {
            fromArr[i]--;
            if (fromArr[i] == -1) {
                fromArr[i] = 9;
            }
            fromArr[i] = fromArr[i] % 10;

            let j = 0;

            while ((i - j) > 0) {
                if (fromArr[i - j] === 9) {
                    j++;
                    fromArr[i - j] = 9 + fromArr[i - j];
                    fromArr[i - j] = fromArr[i - j] % 10;
                }
                else
                    break;
            }
            fromArr[i] = fromArr[i] % 10;
            await sleep(interval)
            var output = fromArr.join('');
            document.getElementById(place).innerText = strshow(output);
        }
    }
    await sleep (500)
    while (fromArr[0] == 0){
        fromArr.shift();
        var output = fromArr.join('');
        document.getElementById(place).innerText = strshow(output);
        await sleep (interval*2);
    }
}
async function scoreAdd(oldscore, newscore, place, interval) {
    if (oldscore <= newscore){
        scoreUp(oldscore, newscore, place, interval).then (async function() {
            await sleep (1000)
            scoring = false
        })
    }
    else
        scoreDown(oldscore, newscore, place, interval).then (async function() {
            await sleep (1000)
            scoring = false
        })
}

async function write(fulltext, place, previoustext, noeffect) {
    iswritting++
    place.classList.remove('aftereffect')
    let currenttext = ''
    for (let i = 0; i <= fulltext.length; i++) {
        if (previoustext != '') {
            place.innerText = previoustext + '\n' + currenttext;
            currenttext += fulltext.substring(i, i + 1)
            await sleep(100)
        }
        else {
            place.innerText = currenttext;
            currenttext += fulltext.substring(i, i + 1)
            await sleep(100)
        }

    }
    place.classList.add('aftereffect')
    if (noeffect) {
        place.classList.remove('aftereffect')
    }
    iswritting--
}

async function writeNoWait(fulltext, place, previoustext, noeffect, interval) {
    place.classList.remove('aftereffect')
    let currenttext = ''
    for (let i = 0; i <= fulltext.length; i++) {
        if (previoustext != '') {
            place.innerText = previoustext + '\n' + currenttext;
            currenttext += fulltext.substring(i, i + 1)
            await sleep(interval)
        }
        else {
            place.innerText = currenttext;
            currenttext += fulltext.substring(i, i + 1)
            await sleep(interval)
        }

    }
    place.classList.add('aftereffect')
    if (noeffect) {
        place.classList.remove('aftereffect')
    }
}

async function writePercent(number, place) {
    let fulltext = ''+number;
    let currenttext = ''
    for (let i = 0; i <= fulltext.length; i++) {
        place.innerText = currenttext + '%';
        currenttext += fulltext.substring(i, i + 1)
        await sleep(50)
    }
}

//Console var :
const  humanTextArr = ['HumanText1', 'HumanText2', 'HumanText3'];
const  shipTextArr = ['ShipText1', 'ShipText2', 'ShipText3'];
const  planetTextArr = ['PlanetText1', 'PlanetText2', 'PlanetText3'];
const  cardTextArr = ['CardText1', 'CardText2', 'CardText3'];
const nerfTextArr = ['scaleDown1', 'scaleDown2', 'scaleDown3',]
const otherTextArr = ['other1', 'other2', 'other3']

function pickRandom (Arr) {
    const randomElement = Arr[Math.floor(Math.random() * Arr.length)];
    return randomElement
}
var humanText = pickRandom(humanTextArr);
var shipText = pickRandom(shipTextArr);
var planetText = pickRandom(planetTextArr);
var cardText = pickRandom(cardTextArr);
var nerfText = pickRandom(nerfTextArr);
var otherText = pickRandom(otherTextArr);
var textArr = [humanText, shipText, planetText, nerfText, cardText, other];
//Recap var :
var texto2 = "blabla Oxygène blabla planette blabla pollution bla bla ";
var textcl = "blabla Climat blabla planette blabla ouragan bla bla ";
var textff = "blabla Animal blabla planette blabla plante bla bla ";
var textre = "blabla Fer blabla planette blabla diamant bla bla ";
var texteau = "blabla Eau blabla planette blabla boire bla bla ";
var textgr = "blabla Gravité blabla planette blabla pomme bla bla";
var recapText = [texto2, textcl, textff, textre, texteau, textgr]
var etatVaisseau = [ship.motors,ship.scanner,ship.proximity,ship.oxygen,ship.energy,ship.gravity,ship.landing,ship.construction,ship.dbscience,ship.dbhistory]

async function scoreCalcul() {
    let id = document.getElementById('text');
    await sleep(2000);
    let speed = 125;
    let text = id.innerText;
    let score = parseInt(currentscore, 10);
    for (let i = 0; i < scoreMultiplier.length; i++) {
        while (scoring) {
            await sleep(100)
        }
        write('', id, '', false)
        while (iswritting != 0) {
            await sleep(100)
        }
        text = id.innerText
        write(textArr[i], id, '', false)
        while (iswritting != 0) {
            await sleep(100)
        }
        scoreUp('1', '' + valueScoreMultiplier[i], 'amount' + i, speed)
        if (i==0){
            scoreUp('1','' + valueScoreMultiplier[i], 'humain-value', speed)
        }
        if (i==1){
            for (let j=0; j<6; j++){
                let place = document.querySelectorAll('.dial')
                place.item(j).setAttribute('data-value',etatVaisseau[j])
            }
            for (let j=1; j<=4; j++){
                let place = document.getElementById('mod-sec'+j)
                writePercent(etatVaisseau[j+5],place)
            }
        }
        if (i==2){
            for (let j=0; j<recapText.length; j++){
                let interval = 50 + Math.floor(Math.random()*30)
                writeNoWait(recapText[j], document.getElementById('reading-'+(j+1)), '', true, interval)
            }
        }
        score = parseInt(currentscore, 10) * valueScoreMultiplier[i];
        scoreUp(currentscore, "" + score, 'amountfinal', speed).then(async function () {
            await sleep(500)
            scoring = false
            speed = speed - 25;
            currentscore = "" + score;
        });
    }
    while (scoring) {
        await sleep(100)
    }
    text = id.innerText
    await sleep(1000);
    write ('', id, '', false)
    while (iswritting != 0) {
        await sleep(100)
    }
    write(textArr[3], id,'', false)
    while (iswritting != 0) {
        await sleep(100)
    }
    score = Math.floor(score / 500000);
    scoreDown(currentscore, '' + score, 'amountfinal', 75).then(async function () {
        await sleep(1000)
        scoring = false
        currentscore = "" + score;
    });
    speed = 100;
    for (let i = 0; i < scoreAdder.length; i++) {
        while (scoring) {
            await sleep(100)
        }
        await sleep(1000)
        text = id.innerText;
        write(textArr[4 + i], id, '', false);
        while (iswritting != 0) {
            await sleep(100)
        }
        scoreUp('0', '' + valueScoreAdder[i], 'amount' + (i + 3), speed)
        score = parseInt(currentscore, 10) + valueScoreAdder[i];
        scoreAdd(currentscore, "" + score, 'amountfinal', speed).then(async function () {
            await sleep(1000)
            scoring = false
            currentscore = "" + score;
        });
    }
    id.classList.remove('aftereffect')
    await sleep (2000)
    write("", id, "",true)
    while (iswritting != 0) {
        await sleep(100)
    }
    write ("Your total score is :", id ,"", true)
    while (iswritting != 0) {
        await sleep(100)
    }
    document.getElementById('console').innerText = '';
    write((parseInt(currentscore)).toLocaleString(), document.querySelector(".consolescore"), "", true )
    while (iswritting != 0) {
        await sleep(100)
    }
}

window.addEventListener('load', scoreCalcul(), 'false')



