//server.js
// TODO INIT DB
const db = require ('./src/controllers/db');

var DB = new db.DB;
DB = DB.init();

console.log(DB);

// Nous avons besoin de notre configuration
var app = require('./bin/express')();
var router = require('./bin/express-router')();
//On fait appel à nos routes
require('./src/routers/default')(router);
// Puis on dit à express d'utiliser notre router
app.use('/', router);
// Enfin on lance notre serveur sur le port 8080
app.listen(8080);
console.log('Server launched on port 8080');