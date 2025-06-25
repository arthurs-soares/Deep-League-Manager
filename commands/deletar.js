// commands/deletar.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { loadGuildByName, deleteGuildByName } = require('../handlers/db/guildDb');
const { manageLeaderRole, manageCoLeaderRole } = require('../handlers/utils/roleManager');
const { saveConfig } = require('../handlers/db/configDb');
const { sendLogMessage, manageGuildForumPost } = require('../handlers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deletar')
        .setDescription('Deleta uma guilda do sistema (ação irreversível).')
        .addStringOption(option =>
            option.setName('guilda')
                .setDescription('Nome da guilda para deletar (comece a digitar para ver sugestões)')
                .setRequired(true)
                .setAutocomplete(true)), // <-- Autocomplete habilitado

    async execute(interaction, client, globalConfig) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const guildName = interaction.options.getString('guilda');
        const guild = await loadGuildByName(guildName);

        if (!guild) {
            return await interaction.editReply({ content: `❌ Guilda "${guildName}" não encontrada no banco de dados!` });
        }

        const isModerator = interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                                (globalConfig.moderatorRoles && globalConfig.moderatorRoles.some(roleId => interaction.member.roles.cache.has(roleId)));
        const isLeader = guild.leader && guild.leader.id === interaction.user.id;

        if (!isModerator && !isLeader) {
            return await interaction.editReply({ content: '❌ Você não tem permissão para deletar esta guilda! Apenas líderes ou moderadores.' });
        }

        try {
            const confirmEmbed = new EmbedBuilder()
                .setTitle('⚠️ Confirmação de Exclusão')
                .setColor('#E74C3C')
                .setDescription(`Você tem certeza que deseja deletar permanentemente a guilda **${guild.name}**?\n\n**Esta ação não pode ser desfeita!**`);

            const confirmButton = new ButtonBuilder().setCustomId(`confirm_delete_${guild.name.toLowerCase().replace(/\s+/g, '-')}`).setLabel('Sim, Deletar').setStyle(ButtonStyle.Danger);
            const cancelButton = new ButtonBuilder().setCustomId('cancel_delete').setLabel('Cancelar').setStyle(ButtonStyle.Secondary);
            const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

            const response = await interaction.editReply({
                embeds: [confirmEmbed],
                components: [row]
            });

            const filter = i => i.user.id === interaction.user.id;
            const confirmation = await response.awaitMessageComponent({ filter, time: 30_000 });

            if (confirmation.customId === `confirm_delete_${guild.name.toLowerCase().replace(/\s+/g, '-')}`) {
                const discordGuildId = interaction.guild.id;
                const now = new Date();

                // Lógica de remoção de cargos
                if (guild.leader?.id) {
                    await manageLeaderRole(client, discordGuildId, guild.leader.id, false, globalConfig);
                }
                if (guild.coLeader?.id) {
                    await manageCoLeaderRole(client, discordGuildId, guild.coLeader.id, false, globalConfig);
                }

                // Limpa o status de todos os membros da guilda deletada e inicia cooldown
                const allMembersIds = [
                    ...(guild.leader ? [guild.leader.id] : []),
                    ...(guild.coLeader ? [guild.coLeader.id] : []),
                    ...(guild.mainRoster || []).map(m => m.id),
                    ...(guild.subRoster || []).map(m => m.id)
                ];
                const uniqueMemberIds = [...new Set(allMembersIds)];

                const COOLDOWN_DAYS = 3;
                const COOLDOWN_MILLISECONDS_LOCAL = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

                globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => !uniqueMemberIds.includes(u.userId));
                for (const memberId of uniqueMemberIds) {
                    globalConfig.recentlyLeftUsers.push({ userId: memberId, leaveTimestamp: now.toISOString() });
                }
                const threeDaysAgo = new Date(now.getTime() - COOLDOWN_MILLISECONDS_LOCAL);
                globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => new Date(u.leaveTimestamp) > threeDaysAgo);

                await saveConfig(globalConfig);
                console.log(`🧹 Status de ${uniqueMemberIds.length} membros da guilda "${guild.name}" limpos e cooldown iniciados.`);

                await manageGuildForumPost(client, guild, globalConfig, 'delete', interaction);

                const deleted = await deleteGuildByName(guild.name);

                if (deleted) {
                    client.emit('updateLeaderboard');
                    await sendLogMessage(
                        client, globalConfig, interaction,
                        'Deleção de Guilda',
                        `A guilda **${guild.name}** foi deletada permanentemente.`,
                        [
                            { name: 'Nome da Guilda', value: guild.name, inline: true },
                            { name: 'Líder Antigo', value: guild.leader ? `<@${guild.leader.id}>` : 'N/A', inline: true },
                            { name: 'Vice-Líder Antigo', value: guild.coLeader ? `<@${guild.coLeader.id}>` : 'N/A', inline: true },
                            { name: 'Membros afetados', value: `${uniqueMemberIds.length} jogadores`, inline: true }
                        ]
                    );
                    const successEmbed = new EmbedBuilder()
                        .setTitle('✅ Guilda Deletada com Sucesso!')
                        .setColor('#2ECC71')
                        .setDescription(`A guilda **${guild.name}** foi deletada permanentemente do sistema.`);

                    await confirmation.update({ embeds: [successEmbed], components: [] });
                    console.log(`🗑️ Guilda "${guild.name}" deletada por ${interaction.user.tag} (${interaction.user.id}).`);
                } else {
                    await confirmation.update({ content: '❌ Falha ao deletar a guilda do banco de dados.', embeds: [], components: [] });
                }

            } else if (confirmation.customId === 'cancel_delete') {
                await confirmation.update({ content: 'ℹ️ A exclusão foi cancelada.', embeds: [], components: [] });
            }
        } catch (error) {
            console.error("❌ Erro no comando /deletar:", error);
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: 'Tempo de confirmação esgotado ou ocorreu um erro. A exclusão foi cancelada.',
                    embeds: [], components: []
                }).catch(() => {});
            } else {
                await interaction.reply({
                    content: `❌ Ocorreu um erro ao deletar a guilda: ${error.message}`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    },
};