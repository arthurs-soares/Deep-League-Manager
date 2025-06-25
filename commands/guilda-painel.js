// commands/guilda-painel.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');
// CORRIGIDO: Caminhos de importação diretos para handlers/db/ e handlers/utils/
const { findGuildByLeader, loadGuildByName } = require('../handlers/db/guildDb'); // Caminho corrigido
const { resolveDisplayColor } = require('../handlers/utils/constants'); // Caminho corrigido


module.exports = {
    data: new SlashCommandBuilder()
        .setName('guilda-painel')
        .setDescription('Abre o painel de gerenciamento da sua guilda ou de outra (moderadores).')
        .addStringOption(option =>
            option.setName('guilda')
                .setDescription('Nome da guilda para gerenciar (apenas moderadores)')
                .setRequired(false)),

    async execute(interaction, client, globalConfig) { 
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guildNameToManage = interaction.options.getString('guilda');
        let targetGuild = null; 

        const isModerator = interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                            (globalConfig.moderatorRoles && globalConfig.moderatorRoles.some(roleId => interaction.member.roles.cache.has(roleId)));

        if (guildNameToManage) {
            if (!isModerator) {
                return interaction.editReply({ content: '❌ Apenas moderadores podem especificar uma guilda para gerenciar.' });
            }
            targetGuild = await loadGuildByName(guildNameToManage); 
            if (!targetGuild) {
                return interaction.editReply({ content: `❌ Guilda "${guildNameToManage}" não encontrada no banco de dados.` });
            }
        } else {
            targetGuild = await findGuildByLeader(interaction.user.id);
            if (!targetGuild) {
                return interaction.editReply({ content: '❌ Você precisa ser o líder ou vice-líder de uma guilda para usar este painel, ou um moderador deve especificar uma guilda.' });
            }
        }

        const guildIdSafe = targetGuild.name.toLowerCase().replace(/\s+/g, '-');

        const isCurrentLeader = targetGuild.leader?.id === interaction.user.id;
        const isCurrentCoLeader = targetGuild.coLeader?.id === interaction.user.id;

        const canEditRosterAndProfile = isCurrentLeader || isCurrentCoLeader || isModerator; 
        const canManageLeadership = isCurrentLeader || isModerator; 

        const panelEmbedColor = resolveDisplayColor(targetGuild.color, globalConfig); 

        const panelEmbed = new EmbedBuilder()
            .setTitle(`🎛️ Painel de Gerenciamento - ${targetGuild.name}`)
            .setColor(panelEmbedColor) 
            .setDescription('Use os botões abaixo para gerenciar sua guilda.')
            .addFields(
                { name: '👑 Líder', value: `<@${targetGuild.leader.id}>`, inline: true },
                { name: '⭐ Vice-Líder', value: targetGuild.coLeader ? `<@${targetGuild.coLeader.id}>` : '*Não definido*', inline: true },
                { name: '👥 Membros', value: `${(targetGuild.mainRoster?.length || 0) + (targetGuild.subRoster?.length || 0)} membros`, inline: true }
            )
            .setFooter({ text: `ID da Guilda (Nome): ${guildIdSafe}` })
            .setTimestamp();
            
        if (targetGuild.logo) panelEmbed.setThumbnail(targetGuild.logo);
        if (targetGuild.banner) panelEmbed.setImage(targetGuild.banner);

        // LINHA 1: Edição de Perfil e Liderança
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`guildpanel_edit_${guildIdSafe}`).setLabel('✏️ Editar Perfil').setStyle(ButtonStyle.Primary).setDisabled(!canEditRosterAndProfile),
            new ButtonBuilder()
                .setCustomId(`guildpanel_setcoleader_${guildIdSafe}`)
                .setLabel('⭐ Trocar Vice-Líder')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!canManageLeadership),
            new ButtonBuilder()
                .setCustomId(`guildpanel_transferleader_${guildIdSafe}`)
                .setLabel('👑 Transferir Liderança')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!canManageLeadership)
        );

        // LINHA 2: Botão único para o dropdown de Gerenciamento de Rosters
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`guildpanel_manage_rosters_dropdown_${guildIdSafe}`) 
                .setLabel('📋 Gerenciar Rosters') 
                .setStyle(ButtonStyle.Success) 
                .setEmoji('🔽') 
                .setDisabled(!canEditRosterAndProfile)
        );


        await interaction.editReply({ 
            embeds: [panelEmbed],
            components: [row1, row2] 
        });
    },
};