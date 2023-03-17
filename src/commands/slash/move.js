const { SlashCommandBuilder } = require('discord.js');
const ws = require("ws");

module.exports = {

    data: new SlashCommandBuilder()
        .setName('move')
        .setDescription('Move your token to [A:1] !')
        .addStringOption(option =>
            option.setName('column')
                .setDescription('Column (Letter)')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('row')
                .setDescription('Row (Number)')
                .setRequired(true)
        ),
    step: '', // TODO add step IN combat
    async execute(interaction) {
        let col = interaction.options.getString('column');
        let row = interaction.options.getInteger('row').toString();
        // SEND Data through WebSocket
        let data = JSON.stringify({
            action: 'moveToken',
            data: {
                uid: interaction.user.id,
                col: col,
                row: row
            }
        });

        const wsClient = new ws(WS_URL);
        wsClient.on('open', () => {
            wsClient.send(data);
        });

        // todo Manage bad moves
        await interaction.reply({
            content: "done",
            ephemeral: true
        });
    },
};