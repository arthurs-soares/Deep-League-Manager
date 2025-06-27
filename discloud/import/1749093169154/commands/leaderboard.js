// commands/leaderboard.js (VERSÃO FINAL AJUSTADA)
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const path = require('path');

const { saveLeaderboardInfo } = require(path.resolve(process.cwd(), 'handlers', 'db', 'configDb.js'));
const { updateLeaderboard } = require(path.resolve(process.cwd(), 'handlers', 'utils', 'leaderboardManager.js'));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Cria a mensagem de leaderboard dinâmico neste canal.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });
        try {
            const message = await interaction.channel.send({ content: 'Gerando leaderboard...' });
            await saveLeaderboardInfo(message.channel.id, message.id);
            
            // [AJUSTE] Passamos o objeto 'message' diretamente para a função
            await updateLeaderboard(interaction.client, message);

            await interaction.editReply('Leaderboard criado com sucesso!');
        } catch (error) {
            console.error("Erro ao executar /leaderboard:", error);
            await interaction.editReply({ content: '❌ Ocorreu um erro ao criar o leaderboard.' });
        }
    },
};