async function getFriendTab(id) {
    const rawResponse = await fetch('/friendTab', {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({id: id})
    });
    return rawResponse.text();
}

async function addFriendTab (id) {
    wsLNOB.ffDelete(id-1)
    let container = document.getElementById('friends-container');
    getFriendTab(id).then(sheet => {
        let div = document.createElement('div');
        div.innerHTML = sheet.trim();
        container.append(div.firstChild);
    });
    await sleep(100)
    //initialise eventListener
    let tab =container.querySelector('.player-tab');
    tab.classList.remove('load-in');
    tab.querySelector('.expander-item').addEventListener('mouseup', function () {
        this.lastElementChild.classList.toggle("itemshow");
    });
    tab.querySelector('.expander').addEventListener('mouseup', function () {
        this.parentElement.classList.toggle('move-up')
    });
}

function addFriend(e) {
    if (e.detail.data.is_friend)
        addFriendTab(e.detail.data.id)
}

function deleteFriend(e) {
    let el = document.getElementById('player-tab' + e.detail.data.id);

    if (el)
        el.remove()
}


async function createFriend(e) {
    let data = e.detail.data;
    wsLNOB.ffCreateFromSlug(data.race,true);
    await sleep(500);
    let container = document.getElementById('friends-container');
    let fullID = container.querySelector('.player-tab').getAttribute('id');
    let id= fullID.substring(10);
    console.log(id);
    wsLNOB.setStatistic(id, data.stat, 90);
}
function add_foe(e) {
    let data = e.detail.data;
    wsLNOB.ffCreateFromRace(data.race,false)

}

document.addEventListener('create-friend', createFriend);
document.addEventListener('ff_create', addFriend)
document.addEventListener('ff_delete', deleteFriend)