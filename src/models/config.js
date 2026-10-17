const fs = require("fs");

class Config {

    baseConf = {
        "gameState": "init", // 0 init - 1 creation - 2 gameLive - 3 postGame
    };

    async upsert(key, val){
        await DB.tables.config.upsert({key: key, val: val});
        this[key] = val;
    }

    async bulkUpsert(data) {
        await DB.tables.config.bulkCreate(data,{
            fields:["key", "val"] ,
            updateOnDuplicate: ["val"]
        })
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
            await DB.tables.config.destroy({truncate: true});
        }
        let baseConfRaw = fs.readFileSync(__dirname + '/../config/baseConf.json');
        let baseConfFull = {...JSON.parse(baseConfRaw), ...this.baseConf};

        let bulkConf = [];
        for (let key in baseConfFull) {
            bulkConf.push({
                key: key,
                val: baseConfFull[key]
            })
        }
        if (bulkConf.length > 0) {
            await this.bulkUpsert(bulkConf);
        }
        await this.get()
        return this;
    }
}

module.exports = {Config}