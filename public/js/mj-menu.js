
document.getElementById('add-monstre').addEventListener('mouseup',function(){
    let mob = document.getElementById("search-ennemy").value
    //faire spawn le mob
})

document.getElementById('add-friend').addEventListener('mouseup',function(){
    let mob = document.getElementById("search-ally").value
    //faire spawn le compagnon (surement rajouter un player tab temporairement)
})
document.getElementById('combat-start').addEventListener('mouseup',function(){
    document.getElementById('combat-start').innerText = 'Terminer le combat';
    let consoletext = document.getElementById('console-container').innerText
    //recup toute les stats moral des joueurs
        //check à chaque update de la stat si (newstat <= oldstat-11)
            //si oui indiquer au mj que le joueur s'évanouit  (consoletext.append('P1 s'est évanouit \n'))
            //l'indiquer aussi aux joueurs (exemple changer la couleur du pseudo blanc -> rouge)
    //check à chaque update si les hp d'un mob sont à zero
        //si oui on l'indique au mj (consoletext.append('mob1 est hors combat \n'))
        //L'indiquer aussi aux joueurs (exemple changer la couleur du pseudo blanc -> rouge)
})