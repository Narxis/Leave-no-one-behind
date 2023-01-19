const { SlashCommandBuilder } = require('discord.js');
const ws = require("ws");

module.exports = {

    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('join game'),
    async execute(interaction) {

        const wsClient = new ws(WS_URL);

        // SEND Data through WebSocket
        let data = JSON.stringify({
            action: 'join',
            uid: interaction.user.id,
            nick: interaction.user.tag
        });

        wsClient.on('open', () => {
            wsClient.send(data);
        });

        let keyCache = interaction.user.id;
        CACHE.set( keyCache, {}, 10000 );

        await interaction.reply({
            content: "Joined !",
            ephemeral: true
        });
    },
};