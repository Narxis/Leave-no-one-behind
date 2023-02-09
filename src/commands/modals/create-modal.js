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
        let keyCache = interaction.user.id;
        let playerCache = CACHE.get(keyCache);

        const raceInput = new StringSelectMenuBuilder()
            .setCustomId('set-race')
            .setPlaceholder('Nothing is selected.')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(options);

        const confirmRace = new ButtonBuilder()
            .setCustomId('roll-stats')
            .setLabel(playerCache ? 'Roll Stats' : 'Confirmer')
            .setStyle(ButtonStyle.Success)
            .setEmoji(playerCache ? '🎲' : '✅')
            .setDisabled(!playerCache);

        const actionSelect = new ActionRowBuilder().addComponents(raceInput);
        const actionConfirm = new ActionRowBuilder().addComponents(confirmRace);

        let components = [];
        if (!playerCache)
            components.push(actionSelect);
        components.push(actionConfirm);

        let content = playerCache ? '...' : 'Pick a race : ';

        await interaction.reply({ content: content, components: components, ephemeral:true });
    },
};