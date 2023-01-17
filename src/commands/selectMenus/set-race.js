const ws = require("ws");
const {StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder} = require("discord.js");
const fs = require("fs");

module.exports = {

    data: {
        name: 'set-race'
    },
    async execute(interaction) {

        const wsClient = new ws(WS_URL);

        let rawData = fs.readFileSync(__dirname  + './../../config/raceStats.json');
        let raceStats = JSON.parse(rawData);
        let options = [];

        // SEND Data through WebSocket
        let data = JSON.stringify({
            action: 'set-race',
            uid: interaction.user.id,
            nick: interaction.user.tag,
            race: interaction.values[0]
        });

        wsClient.on('open', () => {
            wsClient.send(data);
        });

        for (let i in raceStats) {

            let stats = raceStats[i];
            let desc = `[⚔` + stats.combat + `] [🕹️` + stats.pilotage + `] [🔧` + stats.engineering + `] [🛰️` + stats.recon + `] [🫀` + stats.survival + `] [🧠` + stats.moral + `]`;

            options.push({
                label: i,
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
            .setCustomId('confirm')
            .setLabel('Confirmer')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
            .setDisabled(false);

        const actionSelect = new ActionRowBuilder().addComponents(raceInput);
        const actionConfirm = new ActionRowBuilder().addComponents(confirmRace);

        await interaction.update({ content: `Pick a race : `, components: [actionSelect, actionConfirm], ephemeral:true });
    },
};