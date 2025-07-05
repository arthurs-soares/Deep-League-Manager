// handlers/panel/war/warAcceptHandler.js
const { EmbedBuilder } = require('discord.js');
const { loadGuildByName } = require('../../db/guildDb');
const { loadTeamByName } = require('../../db/teamDb');
const { saveWarTicket, loadWarTicketByThreadId } = require('../../db/warDb');
const { sendLogMessage } = require('../../utils/logManager');
const { createWarCurrentButtons } = require('../actions/warTicketButtons');

async function handleWarAcceptButton(interaction, client, globalConfig) {
    console.log(`[DEBUG] handleWarAcceptButton chamado - Timestamp: ${new Date().toISOString()}`);
    console.log(`[DEBUG] Botão clicado por: ${interaction.user.tag} (${interaction.user.id})`);
    console.log(`[DEBUG] Mensagem criada em: ${interaction.message.createdAt}`);
    console.log(`[DEBUG] Tempo desde a criação da mensagem: ${(Date.now() - interaction.message.createdAt) / 1000} segundos`);
    
    await interaction.deferUpdate();

    const threadId = interaction.channel.id;
    console.log(`[DEBUG] Buscando dados da war para threadId: ${threadId}`);
    const warData = await loadWarTicketByThreadId(threadId);
    console.log(`[DEBUG] Dados da war encontrados: ${warData ? 'Sim' : 'Não'}, Status: ${warData?.status}`);

    if (!warData || warData.status !== 'Aguardando Aceitação') {
        console.log(`[DEBUG] War não está aguardando aceitação - Status: ${warData?.status}`);
        return interaction.followUp({ content: '❌ Esta war não está aguardando aceitação ou já foi iniciada/concluída.', ephemeral: true });
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const isModerator = member.permissions.has('Administrator') ||
                        (globalConfig.moderatorRoles || []).some(roleId => member.roles.cache.has(roleId));
    const isScoreOperator = (globalConfig.scoreOperatorRoles || []).some(roleId => member.roles.cache.has(roleId));
    
    let hasPermission = isModerator || isScoreOperator;

    if (!hasPermission) {
        const enemyEntity = warData.enemyEntity;
        let enemyEntityData;

        if (enemyEntity.type === 'guild') {
            enemyEntityData = await loadGuildByName(enemyEntity.name);
        } else if (enemyEntity.type === 'team') {
            enemyEntityData = await loadTeamByName(enemyEntity.name);
        }
        
        if (enemyEntityData) {
            if (enemyEntityData.leader?.id === interaction.user.id) {
                hasPermission = true;
            }
            if (enemyEntity.type === 'guild' && enemyEntityData.coLeader?.id === interaction.user.id) {
                hasPermission = true;
            }
        }
    }

    if (!hasPermission) {
        return interaction.followUp({
            content: `❌ Apenas o líder/co-líder da entidade inimiga, moderadores ou operadores de score podem aceitar a war.`,
            ephemeral: true
        });
    }

    warData.status = 'Aceita';
    warData.currentRound = 1;

    await saveWarTicket(warData);

    let warEmbed = new EmbedBuilder(interaction.message.embeds[0].toJSON());
    warEmbed.fields = warEmbed.data.fields || [];

    const statusFieldIndex = warEmbed.fields.findIndex(field => field.name === 'Status');
    const newStatusValue = `✅ War Aceita - Round ${warData.currentRound}`;
    if (statusFieldIndex !== -1) {
        warEmbed.spliceFields(statusFieldIndex, 1, { name: 'Status', value: newStatusValue, inline: false });
    } else {
        warEmbed.addFields({ name: 'Status', value: newStatusValue, inline: false });
    }
    warEmbed.setColor('#3498DB');

    const components = createWarCurrentButtons(warData);
    await interaction.message.edit({ embeds: [warEmbed], components: components });
    await interaction.channel.send(`🎉 A War/Glad entre **${warData.yourEntity.name}** e **${warData.enemyEntity.name}** foi **ACEITA**! Boa sorte!`);

    await sendLogMessage(
        client, globalConfig, interaction,
        'War Aceita',
        `A War/Glad entre **${warData.yourEntity.name}** e **${warData.enemyEntity.name}** foi aceita.`,
        [
            { name: 'Status Atual', value: warData.status, inline: true },
            { name: 'Thread da War', value: interaction.channel.url, inline: true },
        ]
    );
}

module.exports = { handleWarAcceptButton };
