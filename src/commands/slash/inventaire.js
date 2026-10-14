const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const inventory = require('../../controllers/inventory');

module.exports = {

    data: new SlashCommandBuilder()
        .setName('inventaire')
        .setDescription('Affiche les objets de ton inventaire'),
    step: '',
    async execute(interaction) {

        let items = await inventory.getInventory(interaction.user.id);

        let embed = new EmbedBuilder()
            .setColor(0xffcc00)
            .setTitle('Inventaire de ' + (interaction.member?.displayName || interaction.user.username));

        if (!items.length)
            embed.setDescription('Ton inventaire est vide.');
        else
            // 25 champs au plus dans un embed Discord
            embed.addFields(items.slice(0, 25).map(item => ({
                name: item.name + (item.count > 1 ? ' ×' + item.count : ''),
                value: (item.desc || '—').slice(0, 1024)
            })))
                .setFooter({text: 'Utilise /donner pour donner un objet à un autre joueur'});

        await interaction.reply({embeds: [embed], ephemeral: true});
    },
};
