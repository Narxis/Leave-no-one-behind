const { SlashCommandBuilder } = require('discord.js');
const ws = require("ws");

module.exports = {

    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('ping server'),
    async execute(interaction) {

        const wsClient = new ws(WS_URL);

        // SEND Data through WebSocket
        wsClient.on('open', () => {
            wsClient.send('Pong');
        });
        await interaction.reply('Pong', {ephemeral: true});
    },
};