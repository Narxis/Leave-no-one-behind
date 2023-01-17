const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require("fs");

module.exports = {

    data: new SlashCommandBuilder()
        .setName('create')
        .setDescription('create sheet'),
    async execute(interaction) {

        // TODO check if player exists
        const modal = new ModalBuilder()
            .setCustomId('create-modal')
            .setTitle('Création du personnage');

        const nameInput = new TextInputBuilder()
            .setCustomId('set-name')
            .setLabel("Quel est le nom de votre personnage ?")
            .setStyle(TextInputStyle.Short);

        const firstActionRow = new ActionRowBuilder().addComponents(nameInput);

        modal.addComponents(firstActionRow);

        // Show the modal to the user
        await interaction.showModal(modal);
    },
};