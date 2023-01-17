const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const token = process.env.DS_TOKEN;

const start = function () {

    const client = new Client({ intents: [GatewayIntentBits.Guilds] });

    // INIT COMMANDS
    client.commands = new Collection();

    const commandsPath = path.join(__dirname, './../commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        client.commands.set(command.data.name, command);
    }

    client.selectMenus = new Collection();

    // INIT SELECT MENUS
    const selectMenusPath = path.join(__dirname, './../commands/selectMenus');
    const selectMenusFiles = fs.readdirSync(selectMenusPath).filter(file => file.endsWith('.js'));

    for (const file of selectMenusFiles) {
        const filePath = path.join(selectMenusPath, file);
        const selectMenu = require(filePath);
        client.selectMenus.set(selectMenu.data.name, selectMenu);
    }

    //INIT MODALS
    client.modals = new Collection();

    const modalsPath = path.join(__dirname, './../commands/modals');
    const modalsFiles = fs.readdirSync(modalsPath).filter(file => file.endsWith('.js'));

    for (const file of modalsFiles) {
        const filePath = path.join(modalsPath, file);
        const modal = require(filePath);
        client.modals.set(modal.data.name, modal);
    }

// When the client is ready, run this code (only once)
    client.once('ready', () => {
        let guilds = client.guilds.cache;
        for (let guild_data of guilds) {
            deployCommands(guild_data[1])
        }
        console.log('Bot Ready!');
    });

    /* SLASH COMMANDS */
    client.on('interactionCreate', async interaction => {
        if (!interaction.isChatInputCommand()) return;

        const command = client.commands.get(interaction.commandName);

        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    });

    /* SELECT MENU */
    client.on('interactionCreate', async interaction => {

        if (!interaction.isStringSelectMenu()) return;

        const selectMenu = client.selectMenus.get(interaction.customId);

        if (!selectMenu) return;

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

        const modal = client.modals.get(interaction.customId);

        if (!modal) return;

        try {
            await modal.execute(interaction);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    });

// Login to Discord with your client's token
    client.login(token);
}

const deployCommands = function (guild) {

    let clientId = process.env.DS_CLIENT_ID;
    let token = process.env.DS_TOKEN;

    const commands = [];
    const commandsPath = path.join(__dirname, './../commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        commands.push(command.data.toJSON());
    }

    const rest = new REST({ version: '10' }).setToken(token);

    rest.put(Routes.applicationGuildCommands(clientId, guild.id), { body: commands })
        .then(() => console.log(`Successfully registered application commands on "${guild.name}"`))
        .catch(console.error);
}

module.exports = {start, deployCommands}