//server.js
// TODO INIT DB

const start = async function() {
    const db = require ('./src/controllers/db');

    var DB = new db.DB;
    global.DB = await DB.init();

    var app = require('./bin/express')();
    var router = require('./bin/express-router')();
    require('./src/routers/default')(router);
    app.use('/', router);
    app.listen(8080);
}

start().then(e => {console.log('Server launched on port 8080')});