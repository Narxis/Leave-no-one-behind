function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
var score = 1;
var scoreMultiplier = ["Humain", "Etat du vaisseau", "Etat de la planète"];
var scoreAdder = ["Bonus carte", "Autres"]
var bonusCarte = 303500;
var shipState = 48875;
var humans = 997;
var planetState = 37875;
var other = 0;
var valueScoreMultiplier = [humans, shipState, planetState, bonusCarte, other];
var valueScoreAdder = [bonusCarte, other];
var amount = document.getElementById('amountid');
var currentscore = "1";
var scoring = false;


async function scoreUp(oldscore, newscore, interval) {
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
            document.getElementById('amountid').innerText = fromArr.join('');
        }
    }
}

async function scoreDown(oldscore, newscore, interval) {
    scoring = true;
    var from = oldscore;
    var to = newscore;

    while (to.length < from.length) {
        to = '0' + to;
    }
    var fromArr = ("" + from).split("").map(num => parseInt(num, 10));
    var toArr = ("" + to).split("").map(num => parseInt(num, 10));
    console.log(fromArr, toArr)

    for (let i = (fromArr.length - 1); i >= 0; i--) {
        while (fromArr[i] !== toArr[i]) {
            fromArr[i]--;
            if (fromArr[i] == -1) {
                fromArr[i] = 9;
            }
            fromArr[i] = fromArr[i] % 10;

            let j = 0;

            while ((i - j) > 0) {
                if (fromArr[i - j] === 0) {
                    fromArr[i - j] = 10 + fromArr[i - j]
                    j++;
                    fromArr[i - j] = 10 + fromArr[i - j];
                }
                else
                    break;
            }
            fromArr[i] = fromArr[i] % 10;
            await sleep(interval)
            document.getElementById('amountid').innerText = fromArr.join('');
        }
    }

    while (fromArr[0] === 0) {
        await sleep(150)
        fromArr.shift()
        document.getElementById('amountid').innerText = fromArr.join('');
    }

}
async function scoreAdd(oldscore, newscore, interval) {
    if (oldscore <= newscore){
        scoreUp(oldscore, newscore, interval).then (async function() {
            await sleep (1000)
            scoring = false
        })
    }
    else
        scoreDown(oldscore, newscore, interval).then (async function() {
            await sleep (1000)
            scoring = false
        })
}


async function scoreCalcul() {
    await sleep(2000);
    let speed = 125;
    for (let i = 0; i < scoreMultiplier.length; i++) {
        while (scoring) {
            await sleep(100)
        }
        score = parseInt(currentscore, 10) * valueScoreMultiplier[i];
        scoreUp(currentscore, "" + score, speed).then(async function () {
            await sleep(1000)
            scoring = false
            speed = speed - 25;
            currentscore = "" + score;
        });
    }
    while (scoring) {
        await sleep(100)
    }
    await sleep(1000);
    score = Math.floor(score / 500000);
    scoreDown(currentscore, '' + score, 75).then(async function () {
        await sleep(1000)
        scoring = false
        currentscore = "" + score;
    });
    speed = 125;
    for (let i = 0; i < scoreAdder.length; i++) {
        while (scoring) {
            await sleep(100)
        }
        await sleep(1000)
        score = parseInt(currentscore, 10) + valueScoreAdder[i];
        scoreAdd(currentscore, "" + score, speed).then(async function () {
            console.log('then')
            await sleep(1000)
            scoring = false
            currentscore = "" + score;
        });
    }

}

window.addEventListener('load', scoreCalcul(), 'false')