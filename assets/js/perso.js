var raceImgList = {
    ygrl: 'assets/img/Races/Ygrl.png',
};
//faut remplir le reste des images sinon ça sera un chat
var testIMG = 'https://cataas.com/cat?';

(function () {
    let playerRaceContainer = document.querySelectorAll('.race-selector-container');
    let clickImg = document.querySelectorAll('.select-affichage');
    for (let i = 0; i < clickImg.length; i++) {
        let races = playerRaceContainer.item(i).querySelector('.options-affichage')
        clickImg.item(i).addEventListener('mouseup', function () {
            races.classList.toggle('display-options')
        })
        let race_list = races.querySelectorAll('.race-possible');
        for (let k = 0; k < race_list.length; k++) {
            race_list.item(k).addEventListener('mouseup', setPlayerRace)
        }
    }
})()

function setPlayerRace(e=null, race=null, player_id=null) {

    if (e) {
        if (!race) {
            race = this.getAttribute('data-name');
        }
        if (!player_id) {
            player_id = this.closest('.player').id.substring(1);
        }
    }

    let input = document.createElement('input');
    let img = document.querySelector('#p' + player_id + ' .race-img');
    let img_display = testIMG + new Date();

    if (raceImgList[race]) {
        img_display = raceImgList[race];
    }
    img.src = img_display;

    input.type = 'hidden';
    input.name = 'race['+player_id+']';
    input.value = race;
}