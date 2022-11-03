const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const token = process.env.DS_TOKEN;

module.exports.start = function () {
    // Require the necessary discord.js classes
// Create a new client instance
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });

    client.commands = new Collection();

    const commandsPath = path.join(__dirname, './../commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        // Set a new item in the Collection
        // With the key as the command name and the value as the exported module
        client.commands.set(command.data.name, command);
    }

// When the client is ready, run this code (only once)
    client.once('ready', () => {
        console.log('Bot Ready!');
    });

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

// Login to Discord with your client's token
    client.login(token);
}

module.exports.deployCommands = function () {

    let clientId = process.env.DS_CLIENT_ID;
    let token = process.env.DS_TOKEN;
    let guildId = process.env.DS_GUILD_ID     // TODO GET GUILD ID

    const commands = [];
    const commandsPath = path.join(__dirname, './../commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        commands.push(command.data.toJSON());
    }

    const rest = new REST({ version: '10' }).setToken(token);

    rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands })
        .then(() => console.log('Successfully registered application commands.'))
        .catch(console.error);
}