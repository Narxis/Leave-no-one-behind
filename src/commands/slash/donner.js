const { SlashCommandBuilder } = require('discord.js');
const ws = require("ws");
const inventory = require('../../controllers/inventory');

module.exports = {

    data: new SlashCommandBuilder()
        .setName('donner')
        .setDescription('Donne un objet de ton inventaire à un autre joueur')
        .addStringOption(option =>
            option.setName('objet')
                .setDescription('Objet à donner')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addUserOption(option =>
            option.setName('joueur')
                .setDescription('Joueur qui reçoit l\'objet')
                .setRequired(true)
        ),
    step: '',

    // Propose les objets de l'inventaire de celui qui tape la commande
    async autocomplete(interaction) {
        let typed = interaction.options.getFocused().toLowerCase();
        let items = await inventory.getInventory(interaction.user.id);
        await interaction.respond(items
            .filter(item => item.name.toLowerCase().includes(typed))
            .slice(0, 25)
            .map(item => ({name: item.name + (item.count > 1 ? ' ×' + item.count : ''), value: item.slug})));
    },

    async execute(interaction) {

        let slug = interaction.options.getString('objet');
        let target = interaction.options.getUser('joueur');

        if (target.id === interaction.user.id) {
            await interaction.reply({content: 'Tu ne peux pas te donner un objet à toi-même.', ephemeral: true});
            return;
        }

        // Saisie libre sans passer par la liste : on retrouve l'objet par son nom
        let items = await inventory.getInventory(interaction.user.id);
        let item = items.find(i => i.slug === slug) || items.find(i => i.name.toLowerCase() === slug.toLowerCase());
        if (!item) {
            await interaction.reply({content: 'Cet objet n\'est pas dans ton inventaire.', ephemeral: true});
            return;
        }

        let result = await inventory.move({
            slug: item.slug,
            from: {type: 'player', id: interaction.user.id},
            to: {type: 'player', id: target.id}
        });
        if (result.error) {
            await interaction.reply({content: result.error === 'Ce joueur n\'existe pas' ? target.username + ' ne joue pas dans cette partie.' : result.error, ephemeral: true});
            return;
        }

        // Les coffres de la page de jeu se mettent à jour
        const wsClient = new ws(WS_URL);
        wsClient.on('open', () => {
            wsClient.send(JSON.stringify({action: 'inventory-sync', data: {event: result}}));
            wsClient.close();
        });
        wsClient.on('error', () => {});

        await interaction.reply({content: '🎁 <@' + interaction.user.id + '> donne **' + item.name + '** à <@' + target.id + '>'});
    },
};
