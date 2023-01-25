function doPlayerRoll(resp) {

    let i=20;
    let rollDiv = document.getElementById('p'+resp.discord_id+'-roll');
    rollDiv.classList.remove('success');
    rollDiv.classList.remove('fail');
    let randomDisp = setInterval(function() {
        rollDiv.innerText = Math.floor(Math.random()*99).toString();
        i--;
        console.log(i);
        if (i<0) {
            rollDiv.innerText = resp.result;
            rollDiv.classList.add((resp.success ? 'success' : 'fail'));
            clearInterval(randomDisp);
        }
    },50);
}