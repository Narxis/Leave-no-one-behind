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
// Le combat (adversaires, début/fin, attaques) est géré dans mj-combat.js

document.getElementById('add-friend').addEventListener('mouseup',function(){
    let mob = document.getElementById("search-ally").value
    //faire spawn le compagnon (surement rajouter un player tab temporairement)
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
    document.querySelectorAll('.mjreveal-text').forEach(function (btn){
        btn.innerHTML = '';
    })
    document.querySelector('.desc-text').innerHTML = card.desc;
    document.querySelector('.desc-mjreveal').innerHTML = '<span class="mjreveal">'+card.mjreveal+'</span>';
    for (let choice of card.choices) {
        document.querySelector('#choice'+i+' .button-text').innerHTML = choice.value;
        document.querySelector('#choice'+i+' .mjreveal-text').innerHTML = '<span class="mjreveal">'+choice.mjreveal+'</span>';
        document.querySelector('#choice'+i+++' .reveal-text').innerHTML = "Prochain evenement: <br> <br>" + choice.reveal;
        console.log(i)
    }
}

document.getElementById('mjroll-button').addEventListener('mouseup',function(){
    let val = document.querySelector('input[name="mjroll"]:checked').value;
    let test = document.getElementById('mjroll-module').checked;
    let i=40; 
    let rollDiv = document.getElementById('mjroll-roll'); 
    let result;
    let min;
    let range;
    if (test){
        result = 13 + Math.floor(Math.random()*5)
        min = 13
        range = 5
    }
    else{
        result = val*4 + Math.floor(Math.random()*4) + 1
        min = val*4 +1
        range = 4
    }
    let randomDisp = setInterval(function() { 
        rollDiv.innerText = (min + Math.floor(Math.random()*range)).toString(); 
        i--; 
        if (i<0) { 
            rollDiv.innerText = result; 
            clearInterval(randomDisp); 
        } 
    },25);
});

( function(){
    initialiseRadio();
    initialiseStatus();
    document.addEventListener('card-played', setMJCardValue);
})();
