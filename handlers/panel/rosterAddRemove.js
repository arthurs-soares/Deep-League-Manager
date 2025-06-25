// handlers/panel/rosterAddRemove.js
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const { loadGuildByName, saveGuildData, isUserInAnyGuild } = require('../db/guildDb'); // loadGuildById não é usado aqui diretamente
const { saveConfig } = require('../db/configDb');
const { sendLogMessage } = require('../utils/logManager');
const { getAndValidateGuild } = require('../utils/validation');
const { manageGuildForumPost } = require('../../utils/guildForumPostManager');
// Funções e constantes do nosso novo rosterUtils.js
const { validateMemberEligibility, applyLeaveCooldown, processRosterInput, COOLDOWN_DAYS: ADD_REMOVE_COOLDOWN_DAYS } = require('./rosterUtils');

const MAX_ROSTER_SIZE = 5; // Esta constante é usada aqui

async function handleGuildPanelAddmember(interaction, guildIdSafe, globalConfig, client) { 
    const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, false, true); 
    if (!guild) return;

    const modal = new ModalBuilder()
        .setCustomId(`modal_guildpanel_addmember_${guildIdSafe}`)
        .setTitle(`Adicionar Membro - ${guild.name}`);

    const memberIdInput = new TextInputBuilder()
        .setCustomId('member_id')
        .setLabel("ID do Discord do Membro")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("ID do usuário para adicionar")
        .setRequired(true);

    const rosterTypeInput = new TextInputBuilder()
        .setCustomId('roster_type')
        .setLabel("Tipo de Roster (main/sub)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Digite 'main' ou 'sub'")
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(memberIdInput),
        new ActionRowBuilder().addComponents(rosterTypeInput)
    );

    await interaction.showModal(modal);
}

async function handleGuildPanelAddmemberSubmit(interaction, guildIdSafe, globalConfig, client) { 
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, false, true); 
    if (!guild) return;

    const memberId = interaction.fields.getTextInputValue('member_id');
    let rosterType = interaction.fields.getTextInputValue('roster_type').toLowerCase();

    const cleanedId = (memberId.match(/^<@!?(\d+)>$/) || [, memberId])[1];
    if (!/^\d+$/.test(cleanedId)) {
        return interaction.editReply({ content: '❌ O ID do membro fornecido é inválido. Deve ser numérico ou uma menção válida.' });
    }

    if (rosterType !== 'main' && rosterType !== 'sub') {
        return interaction.editReply({ content: '❌ Tipo de roster inválido. Use "main" ou "sub".' });
    }

    const member = await interaction.guild.members.fetch(cleanedId).catch(() => null);
    if (!member) {
        return interaction.editReply({ content: `❌ Usuário com ID \`${cleanedId}\` (digitado como \`${memberId}\`) não encontrado neste servidor.` });
    }

const validation = await validateMemberEligibility(member.id, guild, globalConfig, member.user);
if (!validation.elegible) {
    return interaction.editReply({ content: validation.error });
}

    const memberObj = { id: member.id, username: member.user.username, joinedAt: new Date().toISOString() };

    const isAlreadyInMain = guild.mainRoster.some(m => m.id === member.id);
    const isAlreadyInSub = guild.subRoster.some(m => m.id === member.id);

    if (isAlreadyInMain || isAlreadyInSub) {
        return interaction.editReply({ content: `❌ O usuário ${member.toString()} já está em um dos rosters da guilda.` });
    }
    
    if (rosterType === 'main' && guild.mainRoster.length >= MAX_ROSTER_SIZE) {
        return interaction.editReply({ content: `❌ O Roster Principal já está cheio (${MAX_ROSTER_SIZE} jogadores). Remova um jogador antes de adicionar outro.` });
    }
    if (rosterType === 'sub' && guild.subRoster.length >= MAX_ROSTER_SIZE) {
        return interaction.editReply({ content: '❌ O Roster Reserva já está cheio (${MAX_ROSTER_SIZE} jogadores). Remova um jogador antes de adicionar outro.' });
    }


    if (rosterType === 'main') {
        guild.mainRoster.push(memberObj);
    } else {
        guild.subRoster.push(memberObj);
    }

    guild.updatedAt = new Date().toISOString();
    guild.updatedBy = interaction.user.id;

    await saveGuildData(guild);

    globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== member.id);
    await saveConfig(globalConfig); 

    client.emit('updateLeaderboard');

    await sendLogMessage(
        client, globalConfig, interaction, 
        `Adição de Membro (${rosterType.toUpperCase()})`, 
        `O membro **${member.user.tag}** foi adicionado ao roster ${rosterType} da guilda **${guild.name}**.`,
        [
            { name: 'Guilda', value: guild.name, inline: true },
            { name: 'Membro Adicionado', value: `<@${member.id}>`, inline: true },
            { name: 'Tipo de Roster', value: rosterType, inline: true },
        ]
    );
    await interaction.editReply({ content: `✅ Membro **${member.user.tag}** adicionado ao roster **${rosterType}** com sucesso!` });
}

async function handleGuildPanelRemovemember(interaction, guildIdSafe, globalConfig, client) { 
    const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, false, true); 
    if (!guild) return;

    const modal = new ModalBuilder()
        .setCustomId(`modal_guildpanel_removemember_${guildIdSafe}`)
        .setTitle(`Remover Membro - ${guild.name}`);

    const memberIdInput = new TextInputBuilder()
        .setCustomId('member_id')
        .setLabel("ID do Discord do Membro")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("ID do usuário para remover")
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(memberIdInput));

    await interaction.showModal(modal);
}

async function handleGuildPanelRemovememberSubmit(interaction, guildIdSafe, globalConfig, client) { 
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, false, true); 
    if (!guild) return;

    const memberId = interaction.fields.getTextInputValue('member_id');

    const cleanedId = (memberId.match(/^<@!?(\d+)>$/) || [, memberId])[1];
    if (!/^\d+$/.test(cleanedId)) {
        return interaction.editReply({ content: '❌ O ID do membro fornecido é inválido. Deve ser numérico ou uma menção válida.' });
    }

    let memberFound = false;
    let originalRosterType = 'N/A';
    guild.mainRoster = guild.mainRoster.filter(m => {
        if (m.id === cleanedId) { 
            memberFound = true;
            originalRosterType = 'principal';
            return false;
        }
        return true;
    });

    if (!memberFound) {
        guild.subRoster = guild.subRoster.filter(m => {
            if (m.id === cleanedId) { 
                memberFound = true;
                originalRosterType = 'reserva';
                return false;
            }
            return true;
        });
    }

    if (!memberFound) {
        return interaction.editReply({ content: `❌ Usuário com ID \`${cleanedId}\` (digitado como \`${memberId}\`) não encontrado em nenhum roster desta guilda.` });
    }

    const isLeader = guild.leader?.id === cleanedId;
    const isCoLeader = guild.coLeader?.id === cleanedId;
    if (isLeader || isCoLeader) {
        return interaction.editReply({ content: `❌ ${member.toString()} é líder ou vice-líder da guilda. Use "Trocar Líder" ou "Trocar Vice-Líder" para gerenciar.` });
    }

    guild.updatedAt = new Date().toISOString();
    guild.updatedBy = interaction.user.id;

    await saveGuildData(guild);
    
    // NOVO: Atualizar o post no fórum da guilda
    await manageGuildForumPost(client, guild, globalConfig, 'update', interaction);

    applyLeaveCooldown(cleanedId, globalConfig);
    
    await saveConfig(globalConfig); 

    client.emit('updateLeaderboard');

    const memberUser = await client.users.fetch(cleanedId).catch(() => null); 
    const memberTag = memberUser ? memberUser.tag : `usuário com ID ${cleanedId}`;

    await sendLogMessage(
        client, globalConfig, interaction, 
        `Remoção de Membro (${originalRosterType.toUpperCase()})`, 
        `O membro **${memberTag}** foi removido do roster ${originalRosterType} da guilda **${guild.name}**.`,
        [
            { name: 'Guilda', value: guild.name, inline: true },
            { name: 'Membro Removido', value: `<@${cleanedId}>`, inline: true },
            { name: 'Tipo de Roster Original', value: originalRosterType, inline: true },
        ]
    );
    await interaction.editReply({ content: `✅ Membro **${memberTag}** removido da guilda com sucesso!` });
}

async function handleGuildPanelBulkaddmemberSubmit(interaction, guildIdSafe, globalConfig, client) { 
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

        const validation = await validateMemberEligibility(member.id, guild, globalConfig, member.user);
        if (!validation.elegible) {
            // Contabiliza o tipo de erro para o resumo final
            if (validation.error.includes("já está na guilda")) {
                alreadyInOtherGuildCount++;
            } else if (validation.error.includes("precisa esperar")) {
                cooldownBlockedCount++;
            }
            individualErrorDetails.push(`• ${validation.error.replace("❌ O usuário ", "")}`); // Remove o "❌ O usuário " para evitar duplicar na mensagem
            continue;
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

module.exports = {
    handleGuildPanelAddmember,
    handleGuildPanelAddmemberSubmit,
    handleGuildPanelRemovemember,
    handleGuildPanelRemovememberSubmit,
    handleGuildPanelBulkaddmember,
    handleGuildPanelBulkaddmemberSubmit,
};