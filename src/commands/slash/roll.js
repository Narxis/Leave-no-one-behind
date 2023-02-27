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
                    { name: 'Combat', value: 'combat' },
                    { name: 'Force', value: 'combat' },
                    { name: 'Pilotage', value: 'pilotage' },
                    { name: 'Dextérité', value: 'pilotage' },
                    { name: 'Ingénierie', value: 'engineering' },
                    { name: 'Intelligence', value: 'engineering' },
                    { name: 'Survie', value: 'survival' },
                    { name: 'Constitution', value: 'survival' },
                    { name: 'Reconaissance', value: 'recon' },
                    { name: 'Charisme', value: 'recon' },
                )
        )
        .addStringOption(option =>
            option.setName('module')
                .setDescription('roll on module')
                .setRequired(false)
                .addChoices(
                    { name: 'Scanners de surface', value: 'scanner' },
                    { name: 'Détecteurs de proximité', value: 'proximity' },
                    { name: 'Moteurs', value: 'motors' },
                    { name: 'Module d\'Oxygène', value: 'oxygen' },
                    { name: 'Electricité', value: 'energy' },
                    { name: 'Gravité Artificielle', value: 'gravity' },
                )
        ),
    step: 'gameLive',
    async execute(interaction) {


        let stat = interaction.options.getString('stat');
        let module = interaction.options.getString('module') ?? '';
        // SEND Data through WebSocket
        let data = JSON.stringify({
            action: 'roll',
            data: {
                discord_id: interaction.user.id,
                stat: stat,
                module: module
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