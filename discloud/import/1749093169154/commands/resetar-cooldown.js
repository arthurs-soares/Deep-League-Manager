// commands/resetar-cooldown.js
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
// Importa a função saveConfig para manipular a configuração global
const { saveConfig } = require('../handlers/db/configDb'); 

module.exports = {
    // Configuração do comando slash
    data: new SlashCommandBuilder()
        .setName('resetar-cooldown')
        .setDescription('Reseta o cooldown de troca de guilda para um usuário específico (Apenas Administradores).')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('O usuário cujo cooldown será resetado.')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // APENAS ADMINISTRADORES

    // Lógica de execução do comando
    async execute(interaction, client, globalConfig) {
        // O comando já está configurado com setDefaultMemberPermissions(Administrator),
        // mas é bom ter uma verificação adicional de segurança.
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await interaction.reply({
                content: '❌ Você não tem permissão para usar este comando! Apenas Administradores podem resetar o cooldown.',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const targetUser = interaction.options.getUser('usuario');

        try {
            // Verifica se o usuário está na lista de cooldown
            const userIndex = globalConfig.recentlyLeftUsers.findIndex(u => u.userId === targetUser.id);

            if (userIndex === -1) {
                // Usuário não encontrado na lista de cooldown
                return await interaction.editReply({
                    content: `✅ O cooldown de **${targetUser.tag}** já não está ativo ou o usuário não foi encontrado na lista de cooldowns.`,
                });
            }

            // Remove o usuário da lista de cooldown
            globalConfig.recentlyLeftUsers.splice(userIndex, 1);

            // Salva a configuração global atualizada no banco de dados
            await saveConfig(globalConfig);

            // Envia mensagem de log para o canal configurado
            await client.guildPanelHandlers.sendLogMessage(
                client, globalConfig, interaction, 
                'Reset de Cooldown', 
                `O cooldown de **${targetUser.tag}** foi resetado manualmente.`,
                [
                    { name: 'Usuário Alvo', value: `<@${targetUser.id}>`, inline: true },
                ]
            );

            // Responde ao usuário que executou o comando
            await interaction.editReply({
                content: `✅ Cooldown de **${targetUser.tag}** resetado com sucesso!`,
            });

            console.log(`⏱️ Cooldown de ${targetUser.tag} (${targetUser.id}) resetado por ${interaction.user.tag} (${interaction.user.id}).`);

        } catch (error) {
            console.error("❌ Erro ao resetar o cooldown do usuário:", error);
            await interaction.editReply({
                content: '❌ Ocorreu um erro ao tentar resetar o cooldown. Tente novamente mais tarde.',
            });
        }
    },
};