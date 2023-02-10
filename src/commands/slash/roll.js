const { SlashCommandBuilder } = require('discord.js');
const ws = require("ws");

module.exports = {

    data: new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Roll !')
        .addStringOption(option =>
            option.setName('stat')
                .setDescription('stat to roll')
                .setRequired(true)
                .addChoices(
                    { name: 'combat', value: 'combat' },
                    { name: 'pilotage', value: 'pilotage' },
                    { name: 'engineering', value: 'engineering' },
                    { name: 'survival', value: 'survival' },
                    { name: 'recon', value: 'recon' },
                    { name: 'moral', value: 'moral' },
                    { name: 'module', value: 'module' },
                )),
    step: 'gameLive',
    async execute(interaction) {


        let stat = interaction.options.getString('stat');
        // SEND Data through WebSocket
        let data = JSON.stringify({
            action: 'roll',
            data: {
                discord_id: interaction.user.id,
                stat: stat,
                module: stat === 'module'
            }
        });

        const wsClient = new ws(WS_URL);
        wsClient.on('open', () => {
            wsClient.send(data);
        });

        await interaction.reply({
            content: "done",
            ephemeral: true
        });
    },
};