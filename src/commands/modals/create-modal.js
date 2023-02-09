const ws = require("ws");
const {ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle} = require("discord.js");
const fs = require("fs");

module.exports = {

    data: {
        name: 'create-modal'
    },
    step: 'creation',
    async execute(interaction) {

        let rawData = fs.readFileSync(__dirname  + './../../config/raceStats.json');
        let raceStats = JSON.parse(rawData);
        let options = [];

        let name = interaction.fields.getTextInputValue('set-name');

        let data = JSON.stringify({
            action: 'set-name',
            uid: interaction.user.id,
            nick: name,
        });

        const wsClient = new ws(WS_URL);
        wsClient.on('open', () => {
            wsClient.send(data);
        });

        for (let i in raceStats) {
            let stats = raceStats[i];
            let desc = `[⚔` + stats.combat + `] [🕹️` + stats.pilotage + `] [🔧` + stats.engineering + `] [🛰️` + stats.recon + `] [🫀` + stats.survival + `] [🧠` + stats.moral + `]`;

            options.push({
                label: i,
                description: desc,
                value: i
            })
        }
        const raceInput = new StringSelectMenuBuilder()
            .setCustomId('set-race')
            .setPlaceholder('Nothing is selected.')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(options);

        const confirmRace = new ButtonBuilder()
            .setCustomId('confirm-race')
            .setLabel('Confirmer')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
            .setDisabled(true);

        const actionSelect = new ActionRowBuilder().addComponents(raceInput);
        const actionConfirm = new ActionRowBuilder().addComponents(confirmRace);

        await interaction.reply({ content: `Pick a race : `, components: [actionSelect, actionConfirm], ephemeral:true });
    },
};