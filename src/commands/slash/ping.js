const { SlashCommandBuilder } = require('discord.js');
const ws = require("ws");

// Fake ping, used for discord sided debug 🥷
module.exports = {

    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('ping server'),
    step: '',
    async execute(interaction) {

        const wsClient = new ws(WS_URL);

        // SEND Data through WebSocket
        wsClient.on('open', () => {
            wsClient.send('Pong');
        });

        let key = interaction.user.id;
        console.log(CACHE.get(key));

        await interaction.reply({
            content: "Pong !",
            ephemeral: true
        });
    },
};