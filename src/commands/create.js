const { SlashCommandBuilder, ActionRowBuilder, SelectMenuBuilder } = require('discord.js');
const fs = require("fs");

module.exports = {

    data: new SlashCommandBuilder()
        .setName('create')
        .setDescription('create sheet'),
    async execute(interaction) {

        let rawData = fs.readFileSync(__dirname  + './../config/raceStats.json');
        let raceStats = JSON.parse(rawData);
        let options = [];

        for (let i in raceStats) {
            let stats = raceStats[i];
            let desc = `[⚔` + stats.combat + `] [🕹️` + stats.pilotage + `] [🔧` + stats.engineering + `] [🛰️` + stats.recon + `] [🧠` + stats.moral + `]`;

            options.push({
                label: i,
                description: desc,
                value: i
            })
        }

        const actionRow = new ActionRowBuilder()
            .addComponents(
                new SelectMenuBuilder()
                    .setCustomId('set-race')
                    .setPlaceholder('Nothing is selected.')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addOptions(options)
            );

        await interaction.reply({ content: `Pick a race : `, components: [actionRow], ephemeral:true });
    },
};