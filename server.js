const constants = require('./src/config/constants');
const db = require ('./src/controllers/db');

const start = async function() {

    constants.register();
    let DB = new db.DB;
    global.DB = await DB.init();

    let app = require('./bin/express')();
    let router = require('./bin/express-router')();
    require('./src/routers/default')(router);
    require('./src/routers/api')(router);
    app.use('/', router);
    app.listen(8080);
}

start().then(e => {console.log('Server launched on port 8080')});