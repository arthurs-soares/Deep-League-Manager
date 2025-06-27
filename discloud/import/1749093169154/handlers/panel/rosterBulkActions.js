// handlers/panel/rosterBulkActions.js
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const { loadGuildByName, saveGuildData, isUserInAnyGuild, loadGuildById } = require('../db/guildDb');
const { saveConfig } = require('../db/configDb');
const { sendLogMessage } = require('../utils/logManager');
const { getAndValidateGuild } = require('../utils/validation');
const { manageGuildForumPost } = require('../../utils/guildForumPostManager');
const { COOLDOWN_DAYS, MAX_ROSTER_SIZE } = require('../utils/constants');
const { processRosterInput } = require('../panel/rosterUtils');

// --- HANDLERS DE ADICIONAR MEMBROS EM MASSA (BULK ADD por IDs) ---
async function handleGuildPanelBulkaddmember(interaction, guildIdSafe, globalConfig, client) {
    const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, false, true); 
        if (!guild) return;

    const modal = new ModalBuilder()
        .setCustomId(`modal_guildpanel_bulkaddmember_${guildIdSafe}`) 
        .setTitle(`Bulk Adicionar Membros - ${guild.name}`);

    const memberIdsInput = new TextInputBuilder()
        .setCustomId('member_ids_list')
        .setLabel("IDs de Membros (separados por vírgula)")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Ex: ID1, ID2, <@Membro3>, ID4")
        .setRequired(true);

    const rosterTypeInput = new TextInputBuilder()
        .setCustomId('roster_type')
        .setLabel("Tipo de Roster (main/sub)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Digite 'main' ou 'sub'")
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(memberIdsInput),
        new ActionRowBuilder().addComponents(rosterTypeInput)
    );
    return { type: 'modal', data: modal }; 
}

async function handleGuildPanelBulkaddmemberSubmit(interaction, guildIdSafe, globalConfig, client) {
    // ... (COPIE O CORPO DA FUNÇÃO handleGuildPanelBulkaddmemberSubmit DO SEU rosterHandlers.js ORIGINAL AQUI)
    // As primeiras linhas seriam:
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, false, true); 
    if (!guild) return;

    const memberIdsList = interaction.fields.getTextInputValue('member_ids_list');
    const rosterType = interaction.fields.getTextInputValue('roster_type').toLowerCase().trim();

    if (rosterType !== 'main' && rosterType !== 'sub') {
        return interaction.editReply({ content: '❌ Tipo de roster inválido. Use "main" ou "sub".' });
    }

    const { memberIds: rawMemberIds, errors: rosterInputErrors } = await processRosterInput(memberIdsList); 

    let membersAddedCount = 0;
    let alreadyInRosterCount = 0;
    let cooldownBlockedCount = 0;
    let alreadyInOtherGuildCount = 0;
    const individualErrorDetails = []; 

    for (const cleanedId of rawMemberIds) {
        const member = await interaction.guild.members.fetch(cleanedId).catch(() => null);
        if (!member) {
            individualErrorDetails.push(`• Usuário com ID \`${cleanedId}\` não encontrado neste servidor.`);
            continue;
        }

        const isAlreadyInMain = guild.mainRoster.some(m => m.id === member.id);
        const isAlreadyInSub = guild.subRoster.some(m => m.id === member.id);

        if (isAlreadyInMain || isAlreadyInSub) {
            alreadyInRosterCount++;
            individualErrorDetails.push(`• ${member.user.tag} já está em um de seus rosters.`);
            continue; 
        }

        const userInGuild = await isUserInAnyGuild(member.id);
        if (userInGuild && userInGuild.name !== guild.name) {
            alreadyInOtherGuildCount++;
            individualErrorDetails.push(`• ${member.user.tag} já está na guilda "${userInGuild.name}".`);
            continue;
        }

        const recentlyLeftUser = globalConfig.recentlyLeftUsers.find(u => u.userId === member.id);
        if (recentlyLeftUser) {
            const leaveTime = new Date(recentlyLeftUser.leaveTimestamp).getTime();
            const now = new Date(); // CORRIGIDO: new Date() para ter toISOString()
            const diffTime = now.getTime() - leaveTime;
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays < COOLDOWN_DAYS) {
                cooldownBlockedCount++;
                const remainingDays = COOLDOWN_DAYS - diffDays; 
                individualErrorDetails.push(`• ${member.user.tag} precisa esperar ${remainingDays} dia(s) para entrar em uma nova guilda.`);
                continue;
            }
        }
        
        if (rosterType === 'main' && guild.mainRoster.length >= MAX_ROSTER_SIZE) {
            individualErrorDetails.push(`• ${member.user.tag} não foi adicionado ao Roster Principal: Roster cheio.`);
            continue;
        }
        if (rosterType === 'sub' && guild.subRoster.length >= MAX_ROSTER_SIZE) {
            individualErrorDetails.push(`• ${member.user.tag} não foi adicionado ao Roster Reserva: Roster cheio.`);
            continue;
        }


        if (rosterType === 'main') {
            guild.mainRoster.push({ id: member.id, username: member.user.username });
        } else {
            guild.subRoster.push({ id: member.id, username: member.user.username });
        }
        membersAddedCount++;
        globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== member.id);
    }
    await saveConfig(globalConfig); 

    if (membersAddedCount === 0 && rosterInputErrors.length === 0 && alreadyInRosterCount === 0 && cooldownBlockedCount === 0 && alreadyInOtherGuildCount === 0) {
        return interaction.editReply({ content: 'ℹ️ Nenhum membro válido foi fornecido ou todos já estavam nos rosters/bloqueados por cooldown/já em outra guilda.' });
    }

    guild.updatedAt = new Date().toISOString();
    guild.updatedBy = interaction.user.id;

    await saveGuildData(guild);
    
    // NOVO: Atualizar o post no fórum da guilda
    await manageGuildForumPost(client, guild, globalConfig, 'update', interaction);

    client.emit('updateLeaderboard');

    let replyMessage = `✅ Tentativa de adicionar membros concluída para a guilda **${guild.name}**:\n`;
    replyMessage += `**Adicionados ao roster ${rosterType}:** ${membersAddedCount} membros.\n`;
    if (alreadyInRosterCount > 0) {
        replyMessage += `**Já existentes nesta guilda:** ${alreadyInRosterCount} membros.\n`;
    }
    if (alreadyInOtherGuildCount > 0) {
        replyMessage += `**Já em outra guilda:** ${alreadyInOtherGuildCount} membros.\n`;
    }
    if (cooldownBlockedCount > 0) {
        replyMessage += `**Bloqueados por cooldown:** ${cooldownBlockedCount} membros.\n`;
    }
    if (rosterInputErrors.length > 0) {
        replyMessage += `**⚠️ Erros de Formato/Usuário não encontrado na lista inicial:**\n• ${rosterInputErrors.join('\n• ')}\n`;
    }
    if (individualErrorDetails.length > 0) {
        replyMessage += `**Detalhes de Erro:**\n${individualErrorDetails.join('\n')}\n`; 
    }

    await sendLogMessage(
        client, globalConfig, interaction, 
        `Adição de Membros em Massa (${rosterType.toUpperCase()})`, 
        `Foram adicionados **${membersAddedCount}** membros ao roster ${rosterType} da guilda **${guild.name}**.`,
        [
            { name: 'Guilda', value: guild.name, inline: true },
            { name: 'Roster Afetado', value: rosterType, inline: true },
            { name: 'Membros Adicionados', value: membersAddedCount.toString(), inline: true },
            { name: 'Já Existentes Nesta Guilda', value: alreadyInRosterCount.toString(), inline: true },
            { name: 'Já em Outra Guilda', value: alreadyInOtherGuildCount.toString(), inline: true },
            { name: 'Bloqueados por Cooldown', value: cooldownBlockedCount.toString(), inline: true },
            { name: 'Erros na Lista Fornecida', value: rosterInputErrors.length > 0 ? rosterInputErrors.join('\n') : '*Nenhum*', inline: false },
            { name: 'Detalhes de Erro', value: individualErrorDetails.length > 0 ? individualErrorDetails.join('\n') : '*Nenhum*', inline: false }, 
        ]
    );

    await interaction.editReply({ content: replyMessage });
}

module.exports = {
    handleGuildPanelBulkaddmember,
    handleGuildPanelBulkaddmemberSubmit,
};