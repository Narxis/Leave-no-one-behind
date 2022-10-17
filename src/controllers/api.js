const {Player} = require("../models/player");
module.exports.index = function(req, res) {
    res.status(200);
    res.json({
        version: API_VER
    });
};

module.exports.getPlayer = async function (req, res) {
    let player = new Player(req.params.playerId);
    player = await player.getData();
    if (!player)
        showError(res, 'No player for this ID')
    else {
        delete player['accepted_datas'];
        res.json(player)
    }
}

module.exports.updatePlayer = async function (req, res) {
    let player = new Player(req.params.playerId);
    let stat = req.params.stat;
    let val = parseInt(req.params.val);
    player = await player.getData();
    if (!player)
        showError(res, 'No player for this ID')
    else {
        if (typeof player.accepted_datas[stat] !== 'number') {
            showError(res, 'Wrong stat, expecting one of [combat|pilotage|engineering|survival|recon|moral]')
        }
        else {
            let data = {};
            data[stat] = player[stat] + val;
            let updatedPlayer = await player.update(data)
            updatedPlayer['updated_stat'] = stat;
            updatedPlayer['updated_val'] = val;
            delete updatedPlayer['accepted_datas'];
            res.json(updatedPlayer);
        }
    }
}

const showError = function (res, msg) {
    res.status(404);
    res.json({
        error_msg: msg
    })
}