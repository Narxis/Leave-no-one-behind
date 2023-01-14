
  function startCountDown() {
    // On récupère le texte dans le timer (en tant qu'entier)
    let time_left = parseInt(document.getElementById('timer-text').textContent);
    // On lance une fonction toutes les secondes (1000ms)
    let interval_cd = setInterval(function() {
        // aucune idée, une sorte de magie noire
        time_left = time_left -1;
        // On change le texte dans le timer (avec un 0 devant si on est en dessous de 10)
        document.getElementById('timer-text').textContent = (time_left < 10 ? '0' : '') + time_left;
        switch (time_left){
         // case 18:
           // document.getElementById('bigboite').classList.add('start')
           // document.getElementById('plugship').classList.add('shipstart')
           // break;
         // case 16:
          //  document.getElementById('bigboite').classList.add('idle')
           // break;
          //case 10:
           // document.getElementById('bigboite').classList.add('flash')
            //break;
          //case 1:
           // break;
          //case 0:
           // document.getElementById('bigboite').classList.remove('flash')
           // document.getElementById('bigboite').classList.remove('idle')
           // document.getElementById('bigboite').classList.add('shot')
           case 15:
            document.getElementById('bigboite').classList.add('start')
            document.getElementById('plugship').classList.add('shipstart')
            break;
          case 13:
            document.getElementById('bigboite').classList.add('idle')
            document.getElementById('bigboite').classList.remove('start')
            break;
          case 10:
            document.getElementById('bigboite').classList.add('flash')
            break;
          case 9:
            document.getElementById('bigboite').classList.add('shot')
            document.getElementById('bigboite').classList.remove('idle')
            break;
          case 1:
            //document.getElementById('bigboite').classList.remove('flash')
            break;
          case 0:
            //document.getElementById('bigboite').classList.remove('idle')
            clearInterval(interval_cd);
            return true;
            break;
        }
    }, 1000);
}
