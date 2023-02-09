const fs = require("fs");

class Config {

    baseConf = {
        "gameState": "init", // 0 init - 1 creation - 2 gameLive - 3 postGame
    };

    async upsert(key, val){
        await DB.tables.config.upsert({key: key, val: val});
        this[key] = val;
    }

    async get() {
        let conf = await DB.tables.config.findAll({raw: true});
        for (let item of conf) {
            this[item.key] = item.val;
        }
        return this;
    }

    async hydrateDB(cleanInstall = true) {
        if (cleanInstall) {
            DB.tables.config.destroy({truncate: true});
        }
        let baseConfRaw = fs.readFileSync(__dirname + '/../config/baseConf.json');
        let baseConfFull = {...JSON.parse(baseConfRaw), ...this.baseConf};

        for (let i in baseConfFull) {
            await this.upsert(i, baseConfFull[i]);
        }
        await this.get()
    }
}

module.exports = {Config}