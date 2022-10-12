const {constants} = require('./src/config/constants');
const db = require ('./src/controllers/db');

const start = async function() {

    constants();
    var DB = new db.DB;
    global.DB = await DB.init();

    var app = require('./bin/express')();
    var router = require('./bin/express-router')();
    require('./src/routers/default')(router);
    app.use('/', router);
    app.listen(8080);
}

start().then(e => {console.log('Server launched on port 8080')});