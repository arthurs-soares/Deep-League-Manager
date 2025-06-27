// commands/ping.js

const { SlashCommandBuilder, MessageFlags } = require('discord.js');


module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Verifica a latência do bot e da API do Discord.'),
        
    async execute(interaction) {
        // Envia uma resposta inicial efêmera. É importante deferir ou responder rapidamente
        // para que o Discord saiba que a interação está a ser processada.
        await interaction.reply({ content: 'Calculando ping...', flags: MessageFlags.Ephemeral });

        // Calcula a latência de ida e volta da interação (tempo entre o envio da interação e a resposta do bot).
        const sent = await interaction.fetchReply(); // Obtém a mensagem de resposta que acabou de ser enviada.
        const roundtripLatency = sent.createdTimestamp - interaction.createdTimestamp;
        
        // Obtém a latência do WebSocket (o "coração" da conexão do bot com os servidores do Discord).
        const apiLatency = Math.round(interaction.client.ws.ping);

        // Edita a resposta inicial com os resultados finais do ping.
        await interaction.editReply(
            `🏓 **Pong!**\n` +
            `> 📊 **Latência de Resposta:** ${roundtripLatency}ms\n` +
            `> 🌐 **Latência da API:** ${apiLatency}ms`
        );
    },
};
