// commands/deletar-time.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { loadTeamByName, deleteTeamByName } = require('../handlers/db/teamDb');
const { sendLogMessage } = require('../handlers/utils/logManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deletar-time')
        .setDescription('Deleta um time do sistema (ação irreversível).')
        .addStringOption(option =>
            option.setName('nome')
                .setDescription('Nome do time para deletar (comece a digitar para ver sugestões).')
                .setRequired(true)
                .setAutocomplete(true)), // <-- Futuramente, teremos um autocomplete para times

    async execute(interaction, client, globalConfig) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const teamName = interaction.options.getString('nome');
        const teamData = await loadTeamByName(teamName);

        if (!teamData) {
            return await interaction.editReply({ content: `❌ Time "${teamName}" não encontrado no banco de dados!` });
        }

        const isModerator = interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                                (globalConfig.moderatorRoles && globalConfig.moderatorRoles.some(roleId => interaction.member.roles.cache.has(roleId)));
        const isLeader = teamData.leader && teamData.leader.id === interaction.user.id;

        if (!isModerator && !isLeader) {
            return await interaction.editReply({ content: '❌ Você não tem permissão para deletar este time! Apenas o líder ou moderadores.' });
        }

        try {
            const confirmEmbed = new EmbedBuilder()
                .setTitle('⚠️ Confirmação de Exclusão')
                .setColor('#E74C3C')
                .setDescription(`Você tem certeza que deseja deletar permanentemente o time **${teamData.name}**?\n\n**Esta ação não pode ser desfeita!**`);

            const confirmButton = new ButtonBuilder().setCustomId(`confirm_delete_team_${teamData.id}`).setLabel('Sim, Deletar').setStyle(ButtonStyle.Danger);
            const cancelButton = new ButtonBuilder().setCustomId('cancel_delete_team').setLabel('Cancelar').setStyle(ButtonStyle.Secondary);
            const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

            const response = await interaction.editReply({
                embeds: [confirmEmbed],
                components: [row]
            });

            const filter = i => i.user.id === interaction.user.id;
            const confirmation = await response.awaitMessageComponent({ filter, time: 30_000 });

            if (confirmation.customId === `confirm_delete_team_${teamData.id}`) {
                const deleted = await deleteTeamByName(teamData.name);

                if (deleted) {
                    client.emit('updateTeamLeaderboard');
                    await sendLogMessage(
                        client, globalConfig, interaction,
                        'Deleção de Time',
                        `O time **${teamData.name}** foi deletado permanentemente.`,
                        [
                            { name: 'Nome do Time', value: teamData.name, inline: true },
                            { name: 'Líder Antigo', value: `<@${teamData.leader.id}>`, inline: true },
                        ]
                    );
                    const successEmbed = new EmbedBuilder()
                        .setTitle('✅ Time Deletado com Sucesso!')
                        .setColor('#2ECC71')
                        .setDescription(`O time **${teamData.name}** foi deletado permanentemente do sistema.`);
                    
                    await confirmation.update({ embeds: [successEmbed], components: [] });
                } else {
                    await confirmation.update({ content: '❌ Falha ao deletar o time do banco de dados.', embeds: [], components: [] });
                }

            } else if (confirmation.customId === 'cancel_delete_team') {
                await confirmation.update({ content: 'ℹ️ A exclusão foi cancelada.', embeds: [], components: [] });
            }
        } catch (error) {
            console.error("❌ Erro no comando /deletar-time:", error);
            await interaction.editReply({
                content: 'Tempo de confirmação esgotado ou ocorreu um erro. A exclusão foi cancelada.',
                embeds: [], components: []
            }).catch(() => {});
        }
    },
};