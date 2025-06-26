// commands/deletar-time.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { loadTeamByName, deleteTeamByName, loadAllTeams } = require('../handlers/db/teamDb');
const { sendLogMessage } = require('../handlers/utils/logManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deletar-time')
        .setDescription('Deleta um time do sistema (ação irreversível).')
        .addStringOption(option =>
            option.setName('time')
                .setDescription('Nome do time para deletar (comece a digitar para ver sugestões)')
                .setRequired(true)
                .setAutocomplete(true)), // Habilitando autocomplete

    async execute(interaction, client, globalConfig) {
        // Apenas moderadores e administradores podem usar
        const isModerator = interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                                (globalConfig.moderatorRoles && globalConfig.moderatorRoles.some(roleId => interaction.member.roles.cache.has(roleId)));

        if (!isModerator) {
            return await interaction.reply({
                content: '❌ Apenas moderadores podem deletar times.',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const teamName = interaction.options.getString('time');
        const team = await loadTeamByName(teamName);

        if (!team) {
            return await interaction.editReply({ content: `❌ Time "${teamName}" não encontrado no banco de dados!` });
        }

        try {
            const confirmEmbed = new EmbedBuilder()
                .setTitle('⚠️ Confirmação de Exclusão de Time')
                .setColor('#E74C3C')
                .setDescription(`Você tem certeza que deseja deletar permanentemente o time **${team.name}**?\n\n**Esta ação não pode ser desfeita!**`);

            // Usar um customId único para a confirmação
            const teamIdSafe = team.name.toLowerCase().replace(/\s+/g, '-');
            const confirmButton = new ButtonBuilder().setCustomId(`confirm_delete_team_${teamIdSafe}`).setLabel('Sim, Deletar Time').setStyle(ButtonStyle.Danger);
            const cancelButton = new ButtonBuilder().setCustomId('cancel_delete_team').setLabel('Cancelar').setStyle(ButtonStyle.Secondary);
            const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

            const response = await interaction.editReply({
                embeds: [confirmEmbed],
                components: [row]
            });

            // Coletor para esperar pela resposta do botão
            const filter = i => i.user.id === interaction.user.id;
            const confirmation = await response.awaitMessageComponent({ filter, time: 30_000 }); // 30 segundos

            if (confirmation.customId === `confirm_delete_team_${teamIdSafe}`) {
                // Chama a função de deleção do DB
                const deleted = await deleteTeamByName(team.name);

                // ✅ CORREÇÃO AQUI: Verifique o resultado de 'deleted' ANTES de prosseguir
                if (deleted) {
                    // --- Se a deleção foi bem-sucedida, faça tudo isso ---
                    client.emit('updateTeamLeaderboard');

                    await sendLogMessage(
                        client, globalConfig, interaction,
                        'Deleção de Time',
                        `O time **${team.name}** foi deletado permanentemente.`,

                        [
                            { name: 'Nome do Time', value: team.name, inline: true },
                            { name: 'Líder Antigo', value: team.leader ? `<@${team.leader.id}>` : 'N/A', inline: true },
                            { name: 'Membros afetados', value: `${(team.roster?.length || 0) + 1} jogadores`, inline: true } // +1 para o líder
                        ]
);
                    const successEmbed = new EmbedBuilder()
                        .setTitle('✅ Time Deletado com Sucesso!')
                        .setColor('#2ECC71')
                        .setDescription(`O time **${team.name}** foi deletado permanentemente do sistema.`);

                    await confirmation.update({ embeds: [successEmbed], components: [] });
                    console.log(`🗑️ Time "${team.name}" deletado por ${interaction.user.tag} (${interaction.user.id}).`);

                } else {
                    // --- Se a deleção FALHOU, informe o erro ---
                    console.error(`Falha ao deletar o time "${team.name}" do DB. A função deleteTeamByName retornou false.`);
                    await confirmation.update({ 
                        content: `❌ Falha ao deletar o time **${team.name}** do banco de dados. O time pode já ter sido deletado por outra pessoa.`, 
                        embeds: [], 
                        components: [] 
                    });
                }

            } else if (confirmation.customId === 'cancel_delete_team') {
                await confirmation.update({ content: 'ℹ️ A exclusão do time foi cancelada.', embeds: [], components: [] });
            }
        } catch (error) {
            console.error("❌ Erro no comando /deletar-time:", error);
            // Se o tempo esgotar, o awaitMessageComponent lança um erro
            await interaction.editReply({
                content: 'Tempo de confirmação esgotado ou ocorreu um erro. A exclusão foi cancelada.',
                embeds: [], components: []
            }).catch(() => {}); // catch para evitar erro se a interação já não for válida
        }
    },

    // Função de Autocomplete
    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);
        if (focusedOption.name === 'time') {
            const focusedValue = focusedOption.value;
            const allTeams = await loadAllTeams(); // Carrega todos os times
            const filtered = allTeams
                .filter(team => team.name.toLowerCase().startsWith(focusedValue.toLowerCase()))
                .slice(0, 25);

            await interaction.respond(
                filtered.map(choice => ({ name: choice.name, value: choice.name })),
            );
        }
    }
};