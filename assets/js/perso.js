var race_selec = "";
(function (){
    let race_list = document.querySelectorAll('.race-possible');
    document.querySelector('.select-affichage').addEventListener('mouseup', function() {
        document.querySelector('.options-affichage').classList.toggle('display-options')
    })
    for (let i=0; i<race_list.length; i++) {
        race_list.item(i).addEventListener ('mouseup', function() {
            document.querySelector('.options-affichage').classList.remove('display-options')
            race_selec = race_list.item(i).innerText
            document.querySelector('.select-affichage').innerText = race_selec
        })
    }
})()
