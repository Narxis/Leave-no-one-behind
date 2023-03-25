function addlife() {
    if (document.getElementById('add-type-friend').checked){
        let race;
        let friends = document.getElementsByName('bestiaire');
        for (btn of friends) {
            if (btn.checked) {
                race = btn.value
                break;
            }
        }
        let main_stat;
        let stats = document.getElementsByName('friend-stat');
        for (btn of stats){
            if(btn.checked) {
                main_stat = btn.value
                break;
            }
        }
        wsLNOB.triggerCustomEvent('create-friend', {name: 'Passager', race:''+race, stat: ''+main_stat})
    }
    else {
        let race;
        let friends = document.getElementsByName('bestiaire');
        for (btn of friends) {
            if (btn.checked) {
                race = btn.value
                break;
            }
        }
        wsLNOB.triggerCustomEvent('add-foe', {race:''+race})
    }
}