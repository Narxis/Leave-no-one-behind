const ws = require("ws");

module.exports = {

    data: {
        name: 'set-race'
    },
    async execute(interaction) {

        const wsClient = new ws(WS_URL);

        console.log(interaction.values[0]);

        // SEND Data through WebSocket
        let data = JSON.stringify({
            action: 'set-race',
            uid: interaction.user.id,
            nick: interaction.user.tag,
            race: interaction.values[0]
        });

        wsClient.on('open', () => {
            wsClient.send(data);
        });
        await interaction.reply({
            content: "Done !",
            ephemeral: true
        });
    },
};