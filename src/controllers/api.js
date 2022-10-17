module.exports.index = function(req, res) {
    res.status(200);
    res.json({
        version: API_VER
    });
};