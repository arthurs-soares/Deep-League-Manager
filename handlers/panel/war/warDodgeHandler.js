// handlers/panel/war/warDodgeHandler.js
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { loadWarTicketByThreadId, saveWarTicket, deleteWarTicket } = require('../../db/warDb');
const { loadConfig } = require('../../db/configDb');
const { sendLogMessage } = require('../../utils/logManager');
const { saveEntityScore, processWarResultForPersonalScores, restrictThreadAccessOnCompletion } = require('./warLogic');

async function handleWarRequestDodgeButton(interaction, client, globalConfig) {
    const threadId = interaction.channel.id;
    const warData = await loadWarTicketByThreadId(threadId);

    if (!warData || (warData.status !== 'Aguardando Aceitação' && warData.status !== 'Aceita')) {
        return interaction.reply({ content: '❌ Esta war já foi concluída ou não pode ser declarada Dodge.', ephemeral: true });
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const isModerator = member.permissions.has('Administrator') ||
                        (globalConfig.moderatorRoles || []).some(roleId => member.roles.cache.has(roleId));
    const isScoreOperator = (globalConfig.scoreOperatorRoles || []).some(roleId => member.roles.cache.has(roleId));

    if (!isModerator && !isScoreOperator) {
        return interaction.reply({ 
            content: '❌ Apenas moderadores ou operadores de score podem declarar Dodge.', 
            ephemeral: true 
        });
    }

    const modal = new ModalBuilder()
        .setCustomId(`modal_war_dodge_select_guild_${threadId}`)
        .setTitle('Declarar Dodge');

    const dodgingEntityInput = new TextInputBuilder()
        .setCustomId('dodging_entity_name')
        .setLabel('Nome da Entidade que Deu Dodge (EXATO)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`${warData.yourEntity.name} ou ${warData.enemyEntity.name}`)
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(dodgingEntityInput));

    await interaction.showModal(modal);
}

async function handleWarDodgeSelectGuildSubmit(interaction, client) { 
    await interaction.deferReply({ ephemeral: true });
    const currentConfig = await loadConfig();
    const threadId = interaction.channel.id;
    const warData = await loadWarTicketByThreadId(threadId);

    if (!warData || (warData.status !== 'Aguardando Aceitação' && warData.status !== 'Aceita')) {
        return interaction.editReply({ content: '❌ Esta war já foi concluída ou não pode ser declarada Dodge neste momento.' });
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const isModerator = member.permissions.has('Administrator') || (currentConfig.moderatorRoles || []).some(roleId => member.roles.cache.has(roleId));
    const isScoreOperator = (currentConfig.scoreOperatorRoles || []).some(roleId => member.roles.cache.has(roleId));

    if (!isModerator && !isScoreOperator) {
        return interaction.editReply({ content: '❌ Apenas moderadores ou operadores de score podem declarar Dodge.' });
    }

    const dodgingEntityName = interaction.fields.getTextInputValue('dodging_entity_name');
    let dodgingEntity, winnerEntity;

    if (dodgingEntityName.toLowerCase() === warData.yourEntity.name.toLowerCase()) {
        dodgingEntity = warData.yourEntity;
        winnerEntity = warData.enemyEntity;
    } else if (dodgingEntityName.toLowerCase() === warData.enemyEntity.name.toLowerCase()) {
        dodgingEntity = warData.enemyEntity;
        winnerEntity = warData.yourEntity;
    } else {
        return interaction.editReply({ content: `❌ O nome "${dodgingEntityName}" não corresponde a nenhuma entidade nesta war.` });
    }

    warData.status = 'Dodge';
    await saveWarTicket(warData);
    
    await saveEntityScore(winnerEntity.name, winnerEntity.type, { wins: 1, losses: 0 });
    await saveEntityScore(dodgingEntity.name, dodgingEntity.type, { wins: 0, losses: 1 });
    await processWarResultForPersonalScores(winnerEntity, dodgingEntity);

    client.emit('updateLeaderboard');
    client.emit('updateTeamLeaderboard');
    
    const warEmbed = new EmbedBuilder(interaction.message.embeds[0].toJSON());
    const statusFieldIndex = warEmbed.data.fields.findIndex(field => field.name === 'Status');
    if (statusFieldIndex !== -1) {
        warEmbed.spliceFields(statusFieldIndex, 1, { name: 'Status', value: `🏃 Dodge - ${dodgingEntity.name} Fugiu`, inline: false });
    }
    warEmbed.setColor('#FF0000');
    warEmbed.addFields({ name: 'Resultado', value: `**${dodgingEntity.name}** fugiu da War/Glad contra **${winnerEntity.name}**.`, inline: false });
    await interaction.message.edit({ embeds: [warEmbed], components: [] });

    await interaction.channel.send(`**Atenção!** A War/Glad foi declarada **DODGE**! **${dodgingEntity.name}** fugiu!`);

    const dodgeLogChannelId = currentConfig.dodgeLogChannelId;
    if (dodgeLogChannelId) {
        const dodgeLogChannel = await client.channels.fetch(dodgeLogChannelId).catch(() => null);
        if (dodgeLogChannel && dodgeLogChannel.type === ChannelType.GuildText && dodgeLogChannel.permissionsFor(client.user).has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
            const dodgeEmbed = new EmbedBuilder()
                .setTitle('🚨 DODGE DETECTADO! 🚨')
                .setColor('#FF0000')
                .setDescription(`Uma War/Glad foi declarada como **DODGE** no ticket: <#${interaction.channel.id}>`)
                .addFields(
                    { name: 'Entidade que Deu Dodge', value: `${dodgingEntity.name} (${dodgingEntity.type})`, inline: true },
                    { name: 'Entidade Vencedora', value: `${winnerEntity.name} (${winnerEntity.type})`, inline: true },
                    { name: 'Declarado por', value: interaction.user.tag, inline: false }
                )
                .setTimestamp();
            await dodgeLogChannel.send({ embeds: [dodgeEmbed] });
        }
    }

    await sendLogMessage(client, currentConfig, interaction, 'War Dodge Declarada', `**${dodgingEntity.name}** fugiu contra **${winnerEntity.name}**.`);
    
    await deleteWarTicket(threadId);
    
    await restrictThreadAccessOnCompletion(client, threadId);
    
    await interaction.editReply({ content: `✅ Dodge registrado com sucesso!` });
}

module.exports = {
    handleWarRequestDodgeButton,
    handleWarDodgeSelectGuildSubmit,
};
