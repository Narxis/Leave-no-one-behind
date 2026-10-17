const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const chalk = require("chalk");
const token = process.env.DS_TOKEN;

// Client connecté, pour retrouver un pseudo Discord hors d'une commande
let activeClient = null;
const getClient = () => activeClient;

// Commande refusée parce que la partie n'en est pas à la bonne étape : on dit pourquoi
const STEP_HINTS = {
    creation: 'La création des personnages n\'est pas ouverte : le MJ doit d\'abord ouvrir la page « Fiche Personnages ».',
    gameLive: 'La partie n\'a pas encore commencé : attends que le MJ lance la partie.'
};
const blockedMessage = (command) => STEP_HINTS[command && command.step] || 'Tu ne peux pas faire ça maintenant !';

const start = function () {

    if (!process.env.DS_TOKEN) return false;

    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    activeClient = client;

    const commandsType = [
        'selectMenus',
        'modals',
        'slash',
        'buttons'
    ];

    for (let i of commandsType) {

        client[i] = new Collection();

        const comsPath = path.join(__dirname, './../commands/' + i);
        const comsFiles = fs.readdirSync(comsPath).filter(file => file.endsWith('.js'));

        for (const file of comsFiles) {
            const filePath = path.join(comsPath, file);
            const com = require(filePath);
            client[i].set(com.data.name, com);
        }
    }

// When the client is ready, run this code (only once)
    client.once('ready', async () => {
        let guilds = client.guilds.cache;
        for (let guild_data of guilds) {
            await deployCommands(guild_data[1])
        }
        log('\n' +
            '  ⢠⣴⣾⣵⣶⣶⣾⣿⣦⡄\n' +
            ' ⢀⣾⣿⣿⢿⣿⣿⣿⣿⣿⣿⡄\n' +
            ' ⢸⣿⣿⣧⣀⣼⣿⣄⣠⣿⣿⣿\n' +
            ' ⠘⠻⢷⡯⠛⠛⠛⠛⢫⣿⠟⠛\n' +
            '\n' +
            '  Bot Ready !\n', '#7289DA');
    });

    // Invité sur un nouveau serveur pendant qu'il tourne : ses commandes y sont
    // enregistrées tout de suite (sinon il fallait redémarrer)
    client.on('guildCreate', async guild => {
        log('[DS] Nouveau serveur : ' + guild.name, '#7289DA');
        await deployCommands(guild);
    });

    /* SLASH COMMANDS */
    client.on('interactionCreate', async interaction => {
        if (!interaction.isChatInputCommand()) return;

        log('[DS] '+ chalk.hex('#aaaaaa')(interaction.user.tag + ' => ' + interaction.commandName), '#7289DA');
        const slash = client.slash.get(interaction.commandName);

        if (!slash) return;
        if (slash.step !== '' && slash.step !== CONFIG.gameState) {
            await interaction.reply({ content: blockedMessage(slash), ephemeral: true });
            log("[Blocked]", "#dd0000");
            return
        }

        try {
            await slash.execute(interaction);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    });

    /* AUTOCOMPLETE : propositions pendant la saisie d'une option */
    client.on('interactionCreate', async interaction => {
        if (!interaction.isAutocomplete()) return;

        const slash = client.slash.get(interaction.commandName);
        if (!slash || !slash.autocomplete) return;

        try {
            await slash.autocomplete(interaction);
        } catch (error) {
            console.error(error);
        }
    });

    /* SELECT MENU */
    client.on('interactionCreate', async interaction => {

        if (!interaction.isStringSelectMenu()) return;

        log('[DS] '+ chalk.hex('#aaaaaa')(interaction.user.tag + ' => ' + interaction.customId), '#7289DA');
        const selectMenu = client.selectMenus.get(interaction.customId);

        if (!selectMenu) return;
        if (selectMenu.step !== '' && selectMenu.step !== CONFIG.gameState) {
            await interaction.reply({ content: blockedMessage(selectMenu), ephemeral: true });
            return
        }

        try {
            await selectMenu.execute(interaction);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    });

    /* MODALS */
    client.on('interactionCreate', async interaction => {

        if (!interaction.isModalSubmit()) return;

        log('[DS] '+ chalk.hex('#aaaaaa')(interaction.user.tag + ' => ' + interaction.customId), '#7289DA');
        const modal = client.modals.get(interaction.customId);

        if (!modal) return;
        if (modal.step !== '' && modal.step !== CONFIG.gameState) {
            await interaction.reply({ content: blockedMessage(modal), ephemeral: true });
            return
        }

        try {
            await modal.execute(interaction);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    });

    /* BUTTONS */
    client.on('interactionCreate', async interaction => {

        if (!interaction.isButton()) return;

        log('[DS] '+ chalk.hex('#aaaaaa')(interaction.user.tag + ' => ' + interaction.customId), '#7289DA');
        let customId = interaction.customId;

        // Pass rolled dice through custom ID

        if (customId.startsWith('roll-stats'))
            customId = 'roll-stats';

        const button = client.buttons.get(customId);

        if (!button) return;
        if (button.step !== '' && button.step !== CONFIG.gameState) {
            await interaction.reply({ content: blockedMessage(button), ephemeral: true });
            return
        }

        try {
            await button.execute(interaction);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    });

// Login to Discord with your client's token
    client.login(token);
}

const deployCommands = async function (guild) {

    let clientId = process.env.DS_CLIENT_ID;
    let token = process.env.DS_TOKEN;

    const commands = [];
    const commandsPath = path.join(__dirname, './../commands/slash');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        commands.push(command.data.toJSON());
    }

    const rest = new REST({ version: '10' }).setToken(token);

    rest.put(Routes.applicationGuildCommands(clientId, guild.id), { body: commands })
        .then(() => {
            //
        })
        .catch(console.error);
}

module.exports = {start, deployCommands, getClient}