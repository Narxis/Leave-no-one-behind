const { SlashCommandBuilder } = require('discord.js');
const ws = require("ws");

module.exports = {

    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('join game'),
    step: 'creation',
    async execute(interaction) {

        // SEND Data through WebSocket
        let data = JSON.stringify({
            action: 'join',
            uid: interaction.user.id,
            nick: interaction.user.tag
        });

        const wsClient = new ws(WS_URL);
        wsClient.on('open', () => {
            wsClient.send(data);
        });

        await interaction.reply({
            content: "Joined !",
            ephemeral: true
        });
    },
};