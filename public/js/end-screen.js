function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
var scoreMultiplier = ["Humain", "Etat du vaisseau", "Etat de la planète"];
var scoreAdder = ["Bonus carte", "Autres"]
var bonusCarte = 303500;
var shipState = 48875;
var humans = 997;
var planetState = 37875;
var other = 0;
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

async function write(fulltext, place, previoustext) {
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
    iswritting--
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

async function scoreCalcul() {
    let id = document.getElementById('text');
    await sleep(2000);
    let speed = 125;
    let text = id.innerText;
    for (let i = 0; i < scoreMultiplier.length; i++) {
        while (scoring) {
            await sleep(100)
        }
        text = id.innerText
        write(textArr[i], id, text)
        while (iswritting != 0) {
            await sleep(100)
        }
        scoreUp('1', '' + valueScoreMultiplier[i], 'amount' + i, speed)
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
    write(textArr[3], id, text)
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
        write(textArr[4 + i], id, text);
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
    write("Clear Console", id, text);
    while (iswritting != 0) {
        await sleep(100)
    }
    await sleep (2000)
    write("", id, "")
    while (iswritting != 0) {
        await sleep(100)
    }
    id.classList.remove('aftereffect')
    await sleep(1000)
    write ("Your total score is :", id ,"")
    while (iswritting != 0) {
        await sleep(100)
    }
    document.getElementById('console').innerText = '';
    id.classList.remove('aftereffect')
    write((parseInt(currentscore)).toLocaleString(), document.querySelector(".consolescore"), "" )
    while (iswritting != 0) {
        await sleep(100)
    }
    document.querySelector(".consolescore").classList.remove('aftereffect')
}

window.addEventListener('load', scoreCalcul(), 'false')

