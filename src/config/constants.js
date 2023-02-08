const Chalk = require("chalk");
module.exports.register = function () {
    global.TYPE_PLANET = 0;
    global.TYPE_NEUTRAL = 1;
    global.TYPE_POSITIVE = 2;
    global.TYPE_NEGATIVE = 3;
    global.TYPE_PLACE = 4;

    global.ALL = null;

    global.WS_URL = 'ws://localhost:' + (process.env.PORT || 8080)

    global.log = function (content, hex = '#ffffff', clean = false) {
        console.log(Chalk.hex(hex)(content))
    }
    global.clear = function () {
        process.stdout.write('\033c')
    }
}