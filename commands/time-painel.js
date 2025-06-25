// commands/time-painel.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { loadTeamByName, isUserInAnyTeam } = require('../handlers/db/teamDb');
const { resolveDisplayColor } = require('../handlers/utils/constants');

async function findTeamByLeader(userId) {
    // Reutiliza a lógica de isUserInAnyTeam que já busca pelo líder.
    return await isUserInAnyTeam(userId);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('time-painel')
        .setDescription('Abre o painel de gerenciamento do seu time ou de outro (moderadores).')
        .addStringOption(option =>
            option.setName('nome')
                .setDescription('Nome do time para gerenciar (apenas moderadores).')
                .setRequired(false)
                .setAutocomplete(true)), // Futuro autocomplete

    async execute(interaction, client, globalConfig) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const teamNameToManage = interaction.options.getString('nome');
        let targetTeam = null;

        const isModerator = interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                            (globalConfig.moderatorRoles && globalConfig.moderatorRoles.some(roleId => interaction.member.roles.cache.has(roleId)));

        if (teamNameToManage) {
            if (!isModerator) {
                return interaction.editReply({ content: '❌ Apenas moderadores podem especificar um time para gerenciar.' });
            }
            targetTeam = await loadTeamByName(teamNameToManage);
            if (!targetTeam) {
                return interaction.editReply({ content: `❌ Time "${teamNameToManage}" não encontrado.` });
            }
        } else {
            targetTeam = await findTeamByLeader(interaction.user.id);
            if (!targetTeam) {
                return interaction.editReply({ content: '❌ Você não é o líder de nenhum time.' });
            }
        }

        const isCurrentLeader = targetTeam.leader?.id === interaction.user.id;
        const canManage = isCurrentLeader || isModerator;
        const panelEmbedColor = resolveDisplayColor(targetTeam.color, globalConfig);

        const panelEmbed = new EmbedBuilder()
            .setTitle(`⚽ Painel de Gerenciamento - ${targetTeam.name}`)
            .setColor(panelEmbedColor)
            .setDescription('Use os botões abaixo para gerenciar seu time.')
            .addFields(
                { name: '👑 Líder', value: `<@${targetTeam.leader.id}>`, inline: true },
                { name: '👥 Membros', value: `${(targetTeam.roster?.length || 0)} membros`, inline: true },
                { name: '📊 Score', value: `${targetTeam.score.wins}V / ${targetTeam.score.losses}D`, inline: true }
            )
            .setFooter({ text: `ID do Time: ${targetTeam.id}` })
            .setTimestamp();
            
        if (targetTeam.logo) panelEmbed.setThumbnail(targetTeam.logo);

        // Botões (por enquanto, podem não ter handlers funcionais)
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`teampanel_edit_${targetTeam.id}`).setLabel('✏️ Editar Perfil').setStyle(ButtonStyle.Primary).setDisabled(!canManage),
            new ButtonBuilder().setCustomId(`teampanel_roster_${targetTeam.id}`).setLabel('📋 Gerenciar Roster').setStyle(ButtonStyle.Success).setDisabled(!canManage),
            new ButtonBuilder().setCustomId(`teampanel_transfer_${targetTeam.id}`).setLabel('👑 Transferir Liderança').setStyle(ButtonStyle.Secondary).setDisabled(!canManage)
        );

        await interaction.editReply({ 
            embeds: [panelEmbed],
            components: [row1]
        });
    },
};