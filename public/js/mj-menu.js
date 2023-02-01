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


document.getElementById('add-monstre').addEventListener('mouseup',function(){
    let mob = document.getElementById("search-ennemy").value
    //faire spawn le mob
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
    }

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