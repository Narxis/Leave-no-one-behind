const ws = require("ws");
const {StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder} = require("discord.js");
const fs = require("fs");
const {Player} = require(__dirname + '/../../models/player');

// TODO use node-cache during creation ?

module.exports = {

    data: {
        name: 'roll-stats'
    },
    async execute(interaction) {

        let player = await new Player().getData(interaction.user.id);
        let race = player.race;

        let rawData = fs.readFileSync(__dirname  + '/../../config/raceStats.json');
        let raceStats = JSON.parse(rawData)[race];

        let components = [];

        let currentRoll = () => {
            let dat = interaction.customId.split('_');

            if (dat.length <= 1)
                return null;

            return {
                stat: dat[1],
                val: parseInt(dat[2])
            };
        };

        let keyCache = interaction.user.id;
        let playerCache = CACHE.get(keyCache);

        if (!playerCache) {
            playerCache = {
                stats: {
                    combat: [],
                    pilotage: [],
                    engineering: [],
                    survival: [],
                    recon: [],
                    moral: []
                }
            }
        }

        if (currentRoll()) {
            playerCache['stats'][currentRoll().stat][currentRoll().val] = Math.floor(Math.random() * 50);
            CACHE.set(keyCache, playerCache, 10000);
        }

        let getRolls = (statVal) => {
            return Math.abs(statVal) + 1;
        }

        // TODO change command once all rolls are done
        for (let stat in raceStats) {

            if (stat === 'moral') continue;

            const actionRow = new ActionRowBuilder();
            let val = parseInt(raceStats[stat]);
            let ctRolls = getRolls(val);

            let buttons = [];

            buttons.push(
                new ButtonBuilder()
                .setCustomId('roll-stats_'+ stat)
                .setLabel(stat)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true)
            );

            for (let i=0; i < ctRolls; i++) {
                let cachedVal = playerCache.stats[stat][i];
                let disabled = typeof cachedVal !== 'undefined';
                let label = disabled ? cachedVal.toString() : '?';

                let isSelected = false;

                if (disabled) {

                    Math.max.apply(Math, playerCache.stats[stat]);

                    if (val > 0) {
                        if (cachedVal === Math.max.apply(Math, playerCache.stats[stat])) {
                            isSelected = true;
                        }
                    }
                    else if (val < 0) {
                        if (cachedVal === Math.min.apply(Math, playerCache.stats[stat])) {
                            isSelected = true;
                        }
                    }
                    else {
                        isSelected = true;
                    }
                }

                let btnStyle = isSelected ? ButtonStyle.Success : ButtonStyle.Secondary;

                let rollStat = new ButtonBuilder()
                    .setCustomId('roll-stats_' + stat + '_' + i)
                    .setLabel(label)
                    .setStyle(btnStyle)
                    .setEmoji('🎲')
                    .setDisabled(disabled);

                buttons.push(rollStat);
            }
            actionRow.addComponents(buttons);

            components.push(actionRow);
        }

        // await interaction.update({ content: `Allez c'est l'heure de roll des stats !`, components: [], ephemeral:true });
        await interaction.update({ content: `Allez c'est l'heure de roll des stats !`, components: components, ephemeral:true });
    },
};