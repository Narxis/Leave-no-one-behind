const ws = require("ws");
const {StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder} = require("discord.js");
const fs = require("fs");
const Player = require('./../../models/player')

// TODO use node-cache during creation ?

module.exports = {

    data: {
        name: 'roll-stats'
    },
    async execute(interaction) {

        let player = new Player.getData(interaction.user.id);
        let race = player.race;

        let rawData = fs.readFileSync(__dirname  + './../../config/raceStats.json');
        let raceStats = JSON.parse(rawData)[race];

        let components = [];

        let currentRoll = () => {
            let dat = interaction.customId.split('_');

            if (dat.length <= 1)
                return null;

            return {
                stat: dat[1],
                val: dat[2]
            };
        };




        let getRolls = (statVal) => {
            return Math.abs(statVal) + 1;
        }

        // TODO change command once all rolls are done
        for (let stat in raceStats) {

            // TODO CREATE ACTIONROW
            const actionRow = new ActionRowBuilder();
            let val = raceStats[stat];
            let ctRolls = getRolls(val);

            let buttons = [];

            for (let i=0; i < ctRolls; i++) {
                // TODO CREATE A ROLL BUTTON FOR EACH STAT
                // reduce dice from 3 to 1    (less space used)
                // or show rolled val on a disabled button after each roll ? (more infos on discord)
                let rollStat = new ButtonBuilder()
                    .setCustomId('roll-stats_' + stat + '_' + i)
                    .setLabel(stat)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎲')
                    .setDisabled(false);

                buttons.push(rollStat);
            }
            actionRow.addComponents(buttons);

            components.push(actionRow);
        }

        await interaction.update({ content: `Allez c'est l'heure de roll des stats !`, components: components, ephemeral:true });
    },
};