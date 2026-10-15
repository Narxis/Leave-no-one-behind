const ws = require("ws");
const {StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder} = require("discord.js");
const fs = require("fs");
const races = require('../../controllers/races');

module.exports = {

    data: {
        name: 'set-race'
    },
    step: 'creation',
    async execute(interaction) {

        let raceStats = races.getStats();
        let options = [];

        // SEND Data through WebSocket
        let data = JSON.stringify({
            action: 'set-race',
            uid: interaction.user.id,
            nick: interaction.user.tag,
            race: interaction.values[0]
        });

        const wsClient = new ws(WS_URL);
        wsClient.on('open', () => {
            wsClient.send(data);
        });

        for (let i in raceStats) {

            let stats = raceStats[i];
            let desc = `[⚔️` + stats.combat + `] [👟` + stats.pilotage + `] [🧠` + stats.engineering + `] [🛡️` + stats.survival + `] [🗣️` + stats.recon + `]`;

            options.push({
                label: races.nameOf(i),
                description: desc,
                value: i,
                default: interaction.values[0] === i,
            })
        }
        const raceInput = new StringSelectMenuBuilder()
            .setCustomId('set-race')
            .setPlaceholder('Nothing is selected.')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(options);

        const confirmRace = new ButtonBuilder()
            .setCustomId('roll-stats')
            .setLabel('Confirmer')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
            .setDisabled(false);

        const actionSelect = new ActionRowBuilder().addComponents(raceInput);
        const actionConfirm = new ActionRowBuilder().addComponents(confirmRace);

        await interaction.update({ content: `Pick a race : `, components: [actionSelect, actionConfirm], ephemeral:true });
    },
};