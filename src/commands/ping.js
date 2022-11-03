const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('ping server'),
    async execute(interaction) {
        await interaction.reply('Pong');
    },
};