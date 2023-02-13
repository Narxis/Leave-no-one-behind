async function getAllPlayers () {
    const rawResponse = await fetch('/api/players', {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
    });
    return JSON.parse(await rawResponse.text());
}
var combat = 0;
var moral =[] ;
let consoleContainer = document.getElementById('console-container');
let consoletext = consoleContainer.innerText
var mobstats =[]


document.getElementById('add-monstre').addEventListener('mouseup',function(){
    let mob = document.getElementById("search-ennemy").value
    let mobId = mobstats.length
    //la fonction mobstat génère les stats d'un mob dans une liste
    mobstats.push(mobstat(mob))
    //mobstats est une liste de liste l'indice dans la première est l'id du mob et cette case contient les 6 stats du mob dans une autre liste
    let mobhmtl =`
                <div class="ennemy-container">  
                    <div class="ennemy-name">${mob}</div>
                    <div class="offense-container">
                        <button class="roll-button offense-roll" id="offense-ennemy${mobId}">Offense</button>
                        <button class="roll-button defence-roll" id="defense-ennemy${mobId}">Défense</button>
                    </div>
                    <div class="ennemy-damage output-roll" id="ennemy-damage${mobId}"></div>
                    <button class="roll-button damage-roll" id="defense-ennemy${mobId}">Dégâts</button>
                    <div class="ennemy-separateur"></div>
                </div>`;
    //faire spawn le mob genre document.getElementById('combat-area').innerHTML += mobhtml; (sauf que ca marcheras pas comme ça puisque c'est pas sur cette page lol)
})

document.getElementById('add-friend').addEventListener('mouseup',function(){
    let mob = document.getElementById("search-ally").value
    //faire spawn le compagnon (surement rajouter un player tab temporairement)
})
document.getElementById('combat-start').addEventListener('mouseup',async function(){
    if (combat == 0){
        combat++
        document.getElementById('combat-start').innerText = 'Terminer le combat';
        let players = await getAllPlayers();
        for (let player of players) {
            moral.push(player.moral)
        }
        console.log(moral)
    }
    else {
        combat--
        document.getElementById('combat-start').innerText = 'Commencer le combat';
        moral = []
        mobstats =[]
    }
    //le dernier mob qui a fait un jet de défense subit les dégats du roll de dégats du joueur
    //check à chaque update si les hp d'un mob sont à zero
        //si oui on l'indique au mj (consoletext.append('mob1 est hors combat \n'))
        //L'indiquer aussi aux joueurs (exemple changer la couleur du pseudo blanc -> rouge)
})

document.addEventListener('playerStat', async function(e){
    if (combat){
        let players = await getAllPlayers();
        for (let i=0;i<players.length;i++) {
            if (players[i].moral < moral[i]-10){
                consoleContainer.innerText = consoletext +'Le joueur '+players[i].name +" s'est évanouit.\n"
                consoletext = consoleContainer.innerText
                //l'indiquer aussi aux joueurs (exemple changer la couleur du pseudo blanc -> rouge)
            }
        }
    }
})
function initialiseRadio () {
    document.querySelector('.life-type1').addEventListener('mouseup', function(){
        document.getElementById('life-1').checked = true;
        document.querySelector('.ennemy').classList.remove('hide');
        document.querySelector('.ally').classList.add('hide');  
    })
    document.querySelector('.life-type2').addEventListener('mouseup', function(){
        document.getElementById('life-2').checked = true;
        document.querySelector('.ennemy').classList.add('hide');
        document.querySelector('.ally').classList.remove('hide');  
    })
}
function initialiseStatus () {
    document.getElementById('add-status').addEventListener('mouseup',function (){
        console.log(document.getElementById('search-status').value, document.getElementById('duration-status').value)
        wsLNOB.setStatus(''+document.getElementById('search-status').value, document.getElementById('duration-status').value )
    })
}

function setMJCardValue(e) {
    let card = e.detail.data;
    let i=0;
    document.querySelectorAll('.button-text').forEach(function (btn){
        btn.innerHTML = '';
    })
    document.querySelectorAll('.reveal-text').forEach(function (btn){
        btn.innerHTML = '';
    })
    for (let choice of card.choices) {
        document.querySelector('#choice'+i+' .button-text').innerHTML = choice.value;
        document.querySelector('#choice'+i+++' .reveal-text').innerHTML = choice.reveal;
    }
}

( function(){
    initialiseRadio();
    initialiseStatus();
    document.addEventListener('card-played', setMJCardValue);
})();
