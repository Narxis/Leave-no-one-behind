var raceImgList = ['assets/img/Races/Ygrl.png'];//faut remplir le reste des images

(function () {
    let imgList = document.querySelectorAll('.race-img')
    let playerRaceContainer = document.querySelectorAll('.race-selector-container');
    let clickImg = document.querySelectorAll('.select-affichage')
    for (let i = 0; i < clickImg.length; i++) {
        let races = playerRaceContainer.item(i).querySelector('.options-affichage')
        clickImg.item(i).addEventListener('mouseup', function () {
            races.classList.toggle('display-options')
        })
        let race_list = races.querySelectorAll('.race-possible');
        for (let k = 0; k < race_list.length; k++) {
            race_list.item(k).addEventListener('mouseup', function () {
                races.classList.remove('display-options')
                imgList.item(i).src = raceImgList[k];
            })
        }
    }
})()
