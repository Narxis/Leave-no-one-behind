const fs = require("fs");
const {friendFoe} = require("../models/friendFoe");
/**
 * Friend Foes Controller
 */

let ffData = JSON.parse(fs.readFileSync(__dirname + '/../config/friendFoes.json'));

module.exports = {
    async createFromSlug(slug, is_friend = false) {

        let friendFoeDat = ffData.find(el => el.slug === slug);
        friendFoeDat.is_friend = is_friend ? 1 : 0;
        return new friendFoe().create(friendFoeDat);
    },

    async createFromRace(race, is_friend = false) {

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
    }
}