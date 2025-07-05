// commands/painel-ranking.js

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { saveConfig } = require('../handlers'); 


module.exports = {
    data: new SlashCommandBuilder()
        .setName('painel-ranking')
        .setDescription('Cria o painel de ranking global de guildas neste canal.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Envia uma mensagem placeholder que será atualizada com o ranking.
            const panelMessage = await interaction.channel.send({ content: 'Inicializando o painel de ranking...' });

            // Salva os IDs do canal e da mensagem na configuração global do bot.
            // Isso permite que o bot saiba onde encontrar e atualizar o painel de ranking.
            await saveConfig({ 
                rankingChannelId: interaction.channel.id,
                rankingMessageId: panelMessage.id,
            });

            // Dispara um evento personalizado. O client.on('updateLeaderboard') no index.js
            // irá capturar isso e chamar a função updateLeaderboardPanel.
            interaction.client.emit('updateLeaderboard'); 

            await interaction.editReply(`✅ Painel de ranking global criado com sucesso!`);
        } catch (error) {
            console.error('❌ Erro ao criar o painel de ranking:', error);
            await interaction.editReply('❌ Ocorreu um erro ao criar o painel. Verifique as permissões do bot neste canal (Enviar Mensagens, Incorporar Links).');
        }
    },
};
