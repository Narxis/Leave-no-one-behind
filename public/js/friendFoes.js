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
    let container = document.getElementById('friends-container');
    getFriendTab(id).then(sheet => {
        let div = document.createElement('div');
        div.innerHTML = sheet.trim();
        container.append(div.firstChild);
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

document.addEventListener('ff_create', addFriend)
document.addEventListener('ff_delete', deleteFriend)