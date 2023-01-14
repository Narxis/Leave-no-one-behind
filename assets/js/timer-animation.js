function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

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
    let interval_cd = setInterval(async function() {
        // aucune idée, une sorte de magie noire
        time_left = time_left -1;
        // On change le texte dans le timer (avec un 0 devant si on est en dessous de 10)
        timerText.textContent = (time_left < 10 ? '0' : '') + time_left;
        timerText2.textContent = (time_left < 10 ? '0' : '') + time_left;
        switch (time_left){
           case 30:
            bigBoite.classList.add('start')
            break;
          case 28:
            bigBoite.classList.add('idle')
            bigBoite.classList.remove('start')
            break;
          case 10:
            bigBoite.classList.add('flash')
            break;
          case 9:
            bigBoite.classList.remove('flash')
            break;
          case 4:
            await sleep(500)
            bigBoite.classList.add('plop')
            break;
          case 3:
            bigBoite.classList.add('shot')
            await sleep(300)
            break;
          case 2:
            await sleep(520)
            bigBoite.classList.add('show-plugun')
            bigBoite.classList.add('hide-plugun')
            await sleep(250)
            plugShip.classList.remove('shipflotte')
            plugShip.classList.add('bonk')
            await sleep(900)
            plugShip.classList.remove('bonk')
            plugShip.classList.add('comeback')
            break;
          case 0:
            await sleep(1200)
            plugShip.classList.remove('comeback')
            plugShip.classList.add('shipflotte')
            bigBoite.classList.remove('idle')
            clearInterval(interval_cd);
            return true;
            break;
        }
    }, 1000);
}
