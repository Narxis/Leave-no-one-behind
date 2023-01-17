const ws = require("ws");
const {StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder} = require("discord.js");
const fs = require("fs");

module.exports = {

    data: {
        name: 'confirm-race'
    },
    async execute(interaction) {

        await interaction.update({ content: `Allez c'est l'heure de roll des stats !`, components: [], ephemeral:true });
    },
};