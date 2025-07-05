// commands/time-painel.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { findTeamByLeader, loadTeamByName } = require('../handlers/db/teamDb'); // Usaremos teamDb
const { resolveDisplayColor } = require('../handlers/utils/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('time-painel')
        .setDescription('Abre o painel de gerenciamento do seu time ou de outro (moderadores).')
        .addStringOption(option =>
            option.setName('time')
                .setDescription('Nome do time para gerenciar (apenas moderadores, comece a digitar)')
                .setRequired(false)
                .setAutocomplete(true)), // Adicionaremos autocomplete para times depois

    async execute(interaction, client, globalConfig) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const teamNameToManage = interaction.options.getString('time');
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
                return interaction.editReply({ content: '❌ Você precisa ser o líder de um time para usar este painel, ou um moderador deve especificar um time.' });
            }
        }

        const teamIdSafe = targetTeam.name.toLowerCase().replace(/\s+/g, '-'); // Para custom IDs
        const panelEmbedColor = resolveDisplayColor(targetTeam.color, globalConfig);

        const panelEmbed = new EmbedBuilder()
            .setTitle(`⚽ Painel de Gerenciamento - ${targetTeam.name}`)
            .setColor(panelEmbedColor)
            .setDescription('Use os botões abaixo para gerenciar seu time.')
            .addFields(
                { name: '👑 Líder', value: `<@${targetTeam.leader.id}>`, inline: true },
                { name: '👥 Membros no Roster', value: `${targetTeam.roster?.length || 0} membros`, inline: true },
                { name: '📊 Score', value: `${targetTeam.score?.wins || 0}V / ${targetTeam.score?.losses || 0}D`, inline: true }
            )
            .setFooter({ text: `ID do Time (Nome): ${teamIdSafe}` })
            .setTimestamp();

        if (targetTeam.logo) panelEmbed.setThumbnail(targetTeam.logo);

        // Definindo permissões para botões
        const canManageTeam = (targetTeam.leader?.id === interaction.user.id) || isModerator;

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`teampanel_editprofile_${teamIdSafe}`).setLabel('✏️ Editar Perfil').setStyle(ButtonStyle.Primary).setDisabled(!canManageTeam),
            new ButtonBuilder().setCustomId(`teampanel_manageroster_${teamIdSafe}`).setLabel('📋 Gerenciar Roster').setStyle(ButtonStyle.Success).setDisabled(!canManageTeam)
            // Adicionar botão para transferir liderança de time se desejar no futuro
        );

        await interaction.editReply({
            embeds: [panelEmbed],
            components: [row1]
        });
    },
};
