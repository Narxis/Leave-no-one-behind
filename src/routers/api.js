var controller = require('./../controllers/api');
var basePath = '/api/v' + API_VER;

module.exports = function(router) {

    router.get(basePath + '/', controller.index);
};