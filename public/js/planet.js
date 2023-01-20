function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

var texto2 = "blabla Oxygène blabla planette blabla pollution bla bla ";
var textcl = "blabla Climat blabla planette blabla ouragan bla bla ";
var textff = "blabla Animal blabla planette blabla plante bla bla ";
var textre = "blabla Fer blabla planette blabla diamant bla bla ";
var texteau = "blabla Eau blabla planette blabla boire bla bla ";
var textgr = "blabla Gravité blabla planette blabla pomme bla bla";
var costo2 = 2; //coût en points de detection
var costcl = 3;//coût en points de detection
var costff = 2;//coût en points de detection
var costre = 5;//coût en points de detection
var costeau = 4;//coût en points de detection
var costgr = 6;//coût en points de detection
var costList = [costo2, costcl, costff, costre, costeau, costgr,];
var points = 14;//total de detection
var showbuttons = false;
var dronenbr = 3
var iswritting = 0;
var droneUse = false;

function writePoints(place, number) {
    document.querySelector(place).innerText = String(number);
};
function initialisePlanet() {
    writePoints('#pointso2', costo2);
    writePoints('#pointscl', costcl);
    writePoints('#pointsff', costff);
    writePoints('#pointsre', costre);
    writePoints('#pointseau', costeau);
    writePoints('#pointsgr', costgr);
    writePoints('.detection-point', points);
    writePoints('.drone', dronenbr);
}
window.addEventListener('load', initialisePlanet, false);

function pointsLeft() {
    showbuttons = true
    for (let i = 0; i < costList.length; i++) {
        if (points >= costList[i]) {
            showbuttons = false
        }
    }
}
async function showbuttons_fun() {
    if (showbuttons) {
        while (iswritting > 0) {
            await sleep(100)
        }
        document.querySelector('.land-button').classList.add('show-buttons')
        document.querySelector('.leave-button').classList.add('show-buttons')
    }
}


async function initialisePlayerTab() {
    var playerTab = document.querySelectorAll('.player-tab');
    for (let i = 0; i < playerTab.length; i++) {
        playerTab.item(i).classList.remove('load-in');
        await sleep(100)
    }
}

window.addEventListener('load', initialisePlayerTab, false);


async function write(fulltext, place) {
    iswritting++
    let currenttext = ''
    for (let i = 0; i <= fulltext.length; i++) {
        document.querySelector(place).innerText = currenttext;
        currenttext += fulltext.substring(i, i + 1)
        await sleep(30)
    }
    iswritting--
}

(function () {
    let tree = document.querySelectorAll('.ff-tree')
    let cloud = document.querySelectorAll('.cl-cloud')
    let cloudshadow = document.querySelectorAll('.cloudshadow')
    let mountain = document.querySelectorAll('.re-mountain')
    let mountainstar = document.querySelectorAll('.re-background')
    let txt = document.querySelectorAll('.p-txt')
    document.querySelector('.o2-txt').addEventListener('mouseup', async function () {
        if (points >= costo2 || droneUse) {
            document.querySelector('#o2-button').disabled = 'disabled'
            if (!droneUse) {
                points = points - costo2;
            }
            else {
                document.querySelector('.cursor').classList.add('o2-cursor')
                droneUse = !droneUse;
                droneCursor = document.querySelector('.transparent')
                await sleep(500)
                droneCursor = document.querySelector('.position')
                document.querySelector('.o2-pulsebox').classList.add('pulse')
                document.querySelector('.use-drone').classList.toggle('switch-on')
                document.querySelector('.cursor').classList.toggle('visible')
                document.querySelector('.drone-svg').classList.remove('cursor-on-txt')
                dronenbr--;
                writePoints('.drone', dronenbr);
                document.querySelector('.cursor').classList.remove('o2-cursor')
            }
            writePoints('.detection-point', points);
            let index = costList.indexOf(costo2)
            costList.splice(index, 1);
            pointsLeft();
            document.querySelector('#rond1').classList.add('rond1');
            document.querySelector('#rond2').classList.add('rond2');
            document.querySelector('.o2-blur').classList.add('blurring');
            document.querySelector('.o2-line').classList.add('trace-o2-line');
            document.querySelector('.o2-line2').classList.add('trace-o2-line2');
            document.querySelector('.o2-linedot').classList.add('trace-o2-linedot');
            document.querySelector('#reading-1').classList.remove('scanning');
            write(texto2, '#reading-1');
            showbuttons_fun();
        }
    })
    document.querySelector('.ff-txt').addEventListener('mouseup', async function () {
        if (points >= costff || droneUse) {
            document.querySelector('#ff-button').disabled = 'disabled'
            if (!droneUse) {
                points = points - costff;
            }
            else {
                document.querySelector('.cursor').classList.add('ff-cursor')
                droneCursor = document.querySelector('.transparent')
                droneUse = !droneUse;
                await sleep(500)
                droneCursor = document.querySelector('.position')
                document.querySelector('.ff-pulsebox').classList.add('pulse')
                document.querySelector('.use-drone').classList.toggle('switch-on')
                document.querySelector('.cursor').classList.toggle('visible')
                document.querySelector('.drone-svg').classList.remove('cursor-on-txt')
                dronenbr--;
                writePoints('.drone', dronenbr);
                document.querySelector('.cursor').classList.remove('ff-cursor')
            }
            writePoints('.detection-point', points);
            let index = costList.indexOf(costff)
            costList.splice(index, 1);
            pointsLeft();
            document.querySelector('.ff-line').classList.add('trace-ff-line')
            document.querySelector('.ff-line2').classList.add('trace-ff-line2')
            document.querySelector('.ff-linedot').classList.add('trace-ff-linedot')
            for (let i = 0; i < tree.length; i++) {
                tree.item(i).classList.add('trace-tree' + i);
            }
            document.querySelector('#reading-3').classList.remove('scanning')
            write(textff, '#reading-3')
            showbuttons_fun();
        }
    })
    document.querySelector('.cl-txt').addEventListener('mouseup', async function () {
        if (points >= costcl || droneUse) {
            document.querySelector('#cl-button').disabled = 'disabled'
            if (!droneUse) {
                points = points - costcl;
            }
            else {
                document.querySelector('.cursor').classList.add('cl-cursor')
                droneUse = !droneUse;
                droneCursor = document.querySelector('.transparent')
                await sleep(500)
                droneCursor = document.querySelector('.position')
                document.querySelector('.cl-pulsebox').classList.add('pulse')
                document.querySelector('.use-drone').classList.toggle('switch-on')
                document.querySelector('.cursor').classList.toggle('visible')
                document.querySelector('.drone-svg').classList.remove('cursor-on-txt')
                dronenbr--;
                writePoints('.drone', dronenbr);
                document.querySelector('.cursor').classList.remove('cl-cursor')
            }
            writePoints('.detection-point', points);
            let index = costList.indexOf(costcl)
            costList.splice(index, 1);
            pointsLeft();
            document.querySelector('.cl-line').classList.add('trace-cl-line')
            document.querySelector('.cl-line2').classList.add('trace-cl-line2')
            document.querySelector('.cl-linedot').classList.add('trace-cl-linedot')
            for (let i = 0; i < cloud.length; i++) {
                cloud.item(i).classList.add('trace-cloud' + i);
            }
            for (let i = 0; i < cloudshadow.length; i++) {
                cloudshadow.item(i).classList.add('trace-cloudshadow');
            }
            document.querySelector('#reading-2').classList.remove('scanning')
            write(textcl, '#reading-2')
            showbuttons_fun();
        }
    })
    document.querySelector('.eau-txt').addEventListener('mouseup', async function () {
        if (points >= costeau || droneUse) {
            document.querySelector('#eau-button').disabled = 'disabled'
            if (!droneUse) {
                points = points - costeau;
            }
            else {
                document.querySelector('.cursor').classList.add('eau-cursor')
                droneUse = !droneUse;
                droneCursor = document.querySelector('.transparent')
                await sleep(500)
                droneCursor = document.querySelector('.position')
                document.querySelector('.eau-pulsebox').classList.add('pulse')
                document.querySelector('.use-drone').classList.toggle('switch-on')
                document.querySelector('.cursor').classList.toggle('visible')
                document.querySelector('.drone-svg').classList.remove('cursor-on-txt')
                dronenbr--;
                writePoints('.drone', dronenbr);
                document.querySelector('.cursor').classList.remove('eau-cursor')
            }
            writePoints('.detection-point', points);
            let index = costList.indexOf(costeau)
            costList.splice(index, 1);
            pointsLeft();
            document.querySelector('.eau-line').classList.add('trace-eau-line')
            document.querySelector('.eau-line2').classList.add('trace-eau-line2')
            document.querySelector('.eau-linedot').classList.add('trace-eau-linedot')
            document.querySelector('.eau-fill').classList.add('trace-eau-fill')
            document.querySelector('.eau-border').classList.add('trace-eau-border')

            document.querySelector('#reading-5').classList.remove('scanning')
            write(texteau, '#reading-5')
            showbuttons_fun();
        }
    })
    document.querySelector('.re-txt').addEventListener('mouseup', async function () {
        if (points >= costre || droneUse) {
            document.querySelector('#re-button').disabled = 'disabled'
            if (!droneUse) {
                points = points - costre;
            }
            else {
                document.querySelector('.cursor').classList.add('re-cursor')
                droneUse = !droneUse;
                droneCursor = document.querySelector('.transparent')
                await sleep(500)
                droneCursor = document.querySelector('.position')
                document.querySelector('.re-pulsebox').classList.add('pulse')
                document.querySelector('.use-drone').classList.toggle('switch-on')
                document.querySelector('.cursor').classList.toggle('visible')
                document.querySelector('.drone-svg').classList.remove('cursor-on-txt')
                dronenbr--;
                writePoints('.drone', dronenbr);
                document.querySelector('.cursor').classList.remove('re-cursor')
            }
            writePoints('.detection-point', points);
            let index = costList.indexOf(costre)
            costList.splice(index, 1);
            pointsLeft();
            document.querySelector('.re-line').classList.add('trace-re-line')
            document.querySelector('.re-line2').classList.add('trace-re-line2')
            document.querySelector('.re-linedot').classList.add('trace-re-linedot')
            for (let i = 0; i < mountain.length; i++) {
                mountain.item(i).classList.add('trace-mountain' + i);
            }
            for (let i = 0; i < mountainstar.length; i++) {
                mountainstar.item(i).classList.add('trace-re-background');
            }
            document.querySelector('#reading-4').classList.remove('scanning')
            write(textre, '#reading-4')
            showbuttons_fun();
        }
    })
    document.querySelector('.gr-txt').addEventListener('mouseup', async function () {
        if (points >= costgr || droneUse) {
            document.querySelector('#gr-button').disabled = 'disabled';
            if (!droneUse) {
                points = points - costre;
            }
            else {
                document.querySelector('.cursor').classList.add('gr-cursor')
                droneUse = !droneUse;
                droneCursor = document.querySelector('.transparent')
                await sleep(500)
                droneCursor = document.querySelector('.position')
                document.querySelector('.gr-pulsebox').classList.add('pulse')
                document.querySelector('.use-drone').classList.toggle('switch-on')
                document.querySelector('.cursor').classList.toggle('visible')
                document.querySelector('.drone-svg').classList.remove('cursor-on-txt')
                dronenbr--;
                writePoints('.drone', dronenbr);
                document.querySelector('.cursor').classList.remove('gr-cursor')
            }
            writePoints('.detection-point', points);
            let index = costList.indexOf(costgr)
            costList.splice(index, 1);
            pointsLeft();
            document.querySelector('.gr-line').classList.add('trace-gr-line')
            document.querySelector('.gr-line2').classList.add('trace-gr-line2')
            document.querySelector('.gr-linedot').classList.add('trace-gr-linedot')
            document.querySelector('.gr-circle').classList.add('trace-gr-circle')
            document.querySelector('#reading-6').classList.remove('scanning')
            write(textgr, '#reading-6')
            showbuttons_fun();
        }
    })
    document.querySelector('.use-drone').addEventListener('mouseup', async function () {
        if (dronenbr > 0) {
            droneUse = !droneUse;
            document.querySelector('.use-drone').classList.toggle('switch-on') //class pour le visuel
            document.querySelector('.cursor').classList.toggle('visible')
        }
    })
    for (let i = 0; i < txt.length; i++) {
        txt.item(i).addEventListener('mouseover', function () {
            document.querySelector('.drone-svg').classList.add('cursor-on-txt')
        })
        txt.item(i).addEventListener('mouseleave', function () {
            document.querySelector('.drone-svg').classList.remove('cursor-on-txt')
        })
    }
})();

(function () {
    let ptabs = document.querySelectorAll('.expander');
    for (let i = 0; i < ptabs.length; i++) {
        ptabs.item(i).addEventListener('mouseup', function () {
            this.closest('.player-tab').classList.toggle('move-up')
        })
    }
})()


let index = 0,
    interval = 1000;

const rand = (min, max) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

const animate = star => {
    star.style.setProperty("--star-left", `${rand(-10, 100)}%`);
    star.style.setProperty("--star-top", `${rand(-40, 80)}%`);

    star.style.animation = "none";
    star.offsetHeight;
    star.style.animation = "";
}

for (const star of document.getElementsByClassName("magic-star")) {
    setTimeout(() => {
        animate(star);

        setInterval(() => animate(star), 2500);
    }, index++ * (interval / 3))
}

var droneCursor = document.querySelector('.position');

window.onmousemove = e => {
    const x = e.clientX + droneCursor.offsetWidth / 2,
        y = e.clientY + droneCursor.offsetHeight / 2;

    droneCursor.style.transform = `translate(${x}px, ${y}px)`;
}

