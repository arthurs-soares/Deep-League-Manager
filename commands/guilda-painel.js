// commands/guilda-painel.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { findGuildByLeader, loadGuildByName, loadAllGuilds } = require('../handlers/db/guildDb');
const { resolveDisplayColor } = require('../handlers/utils/constants');

/**
 * Exibe o painel de gerenciamento da guilda.
 * @param {Interaction} interaction - A interação original do Discord.
 * @param {Object} targetGuild - O objeto da guilda a ser gerenciada.
 * @param {boolean} isModerator - Se o usuário que invocou é um moderador.
 * @param {Object} globalConfig - Objeto de configuração global do bot.
 * @param {Client} client - A instância do bot Discord.js.
 */
async function openGuildPanel(interaction, targetGuild, isModerator, globalConfig, client) {
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

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`guildpanel_edit_${guildIdSafe}`).setLabel('✏️ Editar Perfil').setStyle(ButtonStyle.Primary).setDisabled(!canEditRosterAndProfile),
        new ButtonBuilder().setCustomId(`guildpanel_setcoleader_${guildIdSafe}`).setLabel('⭐ Trocar Vice-Líder').setStyle(ButtonStyle.Secondary).setDisabled(!canManageLeadership),
        new ButtonBuilder().setCustomId(`guildpanel_transferleader_${guildIdSafe}`).setLabel('👑 Transferir Liderança').setStyle(ButtonStyle.Secondary).setDisabled(!canManageLeadership)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`guildpanel_manage_rosters_dropdown_${guildIdSafe}`).setLabel('📋 Gerenciar Rosters').setStyle(ButtonStyle.Success).setEmoji('🔽').setDisabled(!canEditRosterAndProfile)
    );

    // Verifica se a interação já foi respondida ou adiada
    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
            embeds: [panelEmbed],
            components: [row1, row2]
        });
    } else {
        await interaction.reply({
            embeds: [panelEmbed],
            components: [row1, row2],
            flags: MessageFlags.Ephemeral // Garante que a resposta seja efêmera se for a primeira resposta
        });
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('guilda-painel')
        .setDescription('Abre o painel de gerenciamento da sua guilda ou de outra (moderadores).')
        .addStringOption(option =>
            option.setName('guilda')
                .setDescription('Nome da guilda para gerenciar (apenas moderadores, comece a digitar)')
                .setRequired(false)
                .setAutocomplete(true)),

    async execute(interaction, client, globalConfig) {
        // Deferir a resposta no início da execução do comando slash
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
        
        // Chamar a função separada para exibir o painel
        await openGuildPanel(interaction, targetGuild, isModerator, globalConfig, client);
    },

    async autocomplete(interaction, client, globalConfig) {
        const focusedOption = interaction.options.getFocused(true);

        if (focusedOption.name === 'guilda') {
            const focusedValue = focusedOption.value;
            const allGuilds = await loadAllGuilds();
            const filtered = allGuilds
                .filter(guild => guild.name.toLowerCase().startsWith(focusedValue.toLowerCase()))
                .slice(0, 25);

            await interaction.respond(
                filtered.map(choice => ({ name: choice.name, value: choice.name })),
            );
        }
    },
    openGuildPanel // Exporta a função para ser usada por outros handlers
};
