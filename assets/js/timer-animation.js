var timerText = document.querySelector('#timer-text');
var timerText2 = document.querySelector('#timer-text2');
var bigBoite = document.querySelector('#bigboite');
var bigBoite2 = document.querySelector('#bigboite2');
var plugShip = document.querySelector('#plugship');
var plugShip2 = document.querySelector('#plugship2');

  function startCountDown() {
    // On récupère le texte dans le timer (en tant qu'entier)
    let time_left = parseInt(timerText.textContent);
    // On lance une fonction toutes les secondes (1000ms)
    let interval_cd = setInterval(function() {
        // aucune idée, une sorte de magie noire
        time_left = time_left -1;
        // On change le texte dans le timer (avec un 0 devant si on est en dessous de 10)
        timerText.textContent = (time_left < 10 ? '0' : '') + time_left;
        timerText.textContent = (time_left < 10 ? '0' : '') + time_left;
        switch (time_left){
         // case 18:
           // bigBoite.classList.add('start')
           // plugShip.classList.add('shipstart')
           // break;
         // case 16:
          //  bigBoite.classList.add('idle')
           // break;
          //case 10:
           // bigBoite.classList.add('flash')
            //break;
          //case 1:
           // break;
          //case 0:
           // bigBoite.classList.remove('flash')
           // bigBoite.classList.remove('idle')
           // bigBoite.classList.add('shot')
           case 15:
            bigBoite.classList.add('start')
            plugShip.classList.add('shipstart')
            break;
          case 13:
            bigBoite.classList.add('idle')
            bigBoite.classList.remove('start')
            break;
          case 10:
            bigBoite.classList.add('flash')
            break;
          case 9:
            bigBoite.classList.add('shot')
            bigBoite.classList.remove('idle')
            break;
          case 1:
            //bigBoite.classList.remove('flash')
            break;
          case 0:
            //bigBoite.classList.remove('idle')
            clearInterval(interval_cd);
            return true;
            break;
        }
    }, 1000);
}
