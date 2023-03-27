const fs = require("fs");
const {friendFoe} = require("../models/friendFoe");
/**
 * Friend Foes Controller
 */

module.exports = {
    async createFromSlug(slug, is_friend = false) {

        let ffData = JSON.parse(fs.readFileSync(__dirname + '/../config/friendFoes.json'));
        let friendFoeDat = ffData.find(el => el.slug === slug);
        friendFoeDat.is_friend = is_friend ? 1 : 0;
        return new friendFoe().create(friendFoeDat);
    },

    async createFromRace(race, is_friend = false) {

        let ffData = JSON.parse(fs.readFileSync(__dirname + '/../config/friendFoes.json'));
        let raceData = ffData.filter(el => el.race === race);
        const friendFoeDat = raceData[Math.floor(Math.random() * raceData.length)];
        friendFoeDat.is_friend = is_friend ? 1 : 0;
        return new friendFoe().create(friendFoeDat);
    },

    async getAllFriends() {
        return await DB.tables.friend_foes.findAll({where:{is_friend:1}, raw:true});
    },

    async getAllFoes() {
        return await DB.tables.friend_foes.findAll({where:{is_friend:0}, raw:true});
    },

    async deleteAllFriendFoes() {
        await DB.tables.friend_foes.destroy({truncate: true, restartIdentity: true});
    }
}