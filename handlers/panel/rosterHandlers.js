// handlers/panel/rosterHandlers.js
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder, MessageFlags } = require('discord.js'); // Importado MessageFlags
const { loadGuildByName, saveGuildData, isUserInAnyGuild } = require('../db/guildDb'); 
const { saveConfig } = require('../db/configDb');                                     
const { sendLogMessage } = require('../utils/logManager');                              
const { getAndValidateGuild } = require('../utils/validation');                         
const { manageGuildForumPost } = require('../../utils/guildForumPostManager'); // NOVO: manageGuildForumPost importado
const { loadGuildById } = require('../db/guildDb');
const { loadTeamByName, loadTeamById, saveTeamData } = require('../db/teamDb');

const COOLDOWN_DAYS = 3; 
const MAX_ROSTER_SIZE = 5; 

// --- FUNÇÃO AUXILIAR: PROCESSAR ROSTER INPUT GERAL (para inputs de texto) ---
const processRosterInput = async (input) => { 
    if (!input) return { memberIds: [], errors: [] };

    const memberIdsRaw = input.split(',').map(id => id.trim()).filter(id => id);
    const cleanedMemberIds = [];
    const errors = [];

    for (const rawId of memberIdsRaw) {
        let cleanedId = rawId;
        const mentionMatch = rawId.match(/^<@!?(\d+)>$/); 

        if (mentionMatch) {
            cleanedId = mentionMatch[1]; 
        }

        if (!/^\d+$/.test(cleanedId)) { 
            errors.push(`ID inválido: \`${rawId}\`. Use ID numérico ou menção (<@ID>).`);
            continue;
        }
        cleanedMemberIds.push(cleanedId);
    }
    return { memberIds: cleanedMemberIds, errors: errors };
};


// --- HANDLERS DE ADICIONAR MEMBRO (SINGULAR por ID/Menção) ---
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

    const userInGuild = await isUserInAnyGuild(member.id);
    if (userInGuild && userInGuild.name !== guild.name) { 
        return interaction.editReply({ content: `❌ O usuário ${member.toString()} já está na guilda "${userInGuild.name}" e não pode ser adicionado a esta!` });
    }

    const recentlyLeftUser = globalConfig.recentlyLeftUsers.find(u => u.userId === member.id);
    if (recentlyLeftUser) {
        const leaveTime = new Date(recentlyLeftUser.leaveTimestamp).getTime();
        const now = new Date(); // CORRIGIDO: new Date() para ter toISOString()
        const diffTime = now.getTime() - leaveTime;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 
        if (diffDays < COOLDOWN_DAYS) {
            const remainingDays = COOLDOWN_DAYS - diffDays;
            return interaction.editReply({ content: `❌ O usuário ${member.toString()} deixou uma guilda há ${diffDays} dia(s) e precisa esperar ${remainingDays} dia(s) para entrar em uma nova guilda!` });
        }
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


// --- HANDLERS DE REMOVER MEMBRO (SINGULAR por ID/Menção) ---
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

    const now = new Date(); // CORRIGIDO: new Date() para ter toISOString()
    globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== cleanedId);
    globalConfig.recentlyLeftUsers.push({ userId: cleanedId, leaveTimestamp: now.toISOString() });
    
    const threeDaysAgo = new Date(now.getTime() - (COOLDOWN_DAYS * 24 * 60 * 60 * 1000)); // Corrigido getTime()
    globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => new Date(u.leaveTimestamp) > threeDaysAgo);
    
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

    // Ajustado para RETORNAR o modal, em vez de mostrar diretamente
    // Isso permite que o chamador (handleGuildPanelManageRosters_SelectAction) use followUp
    return { type: 'modal', data: modal }; 
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
// --- HANDLERS DE TROCAR JOGADOR POR SLOT (MANTIDO) ---
async function handleGuildPanelTrocarJogador_Initial(interaction, guildIdSafe, globalConfig, client) {
    console.log(`[DIAGNÓSTICO SLOT] handleGuildPanelTrocarJogador_Initial INICIADO para guilda: ${guildIdSafe}`);
    try {
        const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, false, true);
        if (!guild) {
            return { error: true, content: `❌ Guilda "${guildIdSafe}" não encontrada ou você não tem permissão para editá-la.`, flags: MessageFlags.Ephemeral };
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`roster_select_type_${guildIdSafe}`)
            .setPlaceholder('Escolha qual roster deseja editar...');

        selectMenu.addOptions([
                { label: 'Roster Principal', description: 'Edite os jogadores do Roster Principal (slots 1-5).', value: 'main', emoji: '🛡️' },
                { label: 'Roster Reserva', description: 'Edite os jogadores do Roster Reserva (slots 1-5).', value: 'sub', emoji: '⚔️' },
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        console.log(`[DIAGNÓSTICO SLOT] handleGuildPanelTrocarJogador_Initial: Retornando menu de seleção de roster.`);
        // RETORNA OS DADOS EM VEZ DE RESPONDER
        return { type: 'content', content: `Qual roster de **${guild.name}** você gostaria de editar por slot?`, components: [row], flags: MessageFlags.Ephemeral };
    } catch (error) {
        console.error(`❌ [DIAGNÓSTICO SLOT] ERRO FATAL em handleGuildPanelTrocarJogador_Initial:`, error);
        return { error: true, content: `❌ Ocorreu um erro ao iniciar a edição por slot. Detalhes: ${error.message}`, flags: MessageFlags.Ephemeral };
    }
}


// handleGuildPanelTrocarJogador_RosterSelect é chamado por interactionHandler após a seleção do roster type
async function handleGuildPanelTrocarJogador_RosterSelect(interaction, guildIdSafe, globalConfig, client) {
    console.log(`[DIAGNÓSTICO SLOT] handleGuildPanelTrocarJogador_RosterSelect INICIADO para guilda: ${guildIdSafe}, rosterType: ${interaction.values[0]}`);
    try {
        const rosterType = interaction.values[0];
        const guild = await loadGuildByName(guildIdSafe.replace(/-/g, ' '));
        if (!guild) {
            // Se a guilda não for encontrada, precisamos responder com um erro.
            return interaction.reply({ content: '❌ Guilda não encontrada. A operação foi cancelada.', ephemeral: true });
        }

        const modal = new ModalBuilder()
            .setCustomId(`roster_edit_modal_${rosterType}_${guildIdSafe}`)
            .setTitle(`Editar Roster ${rosterType === 'main' ? 'Principal' : 'Reserva'} - ${guild.name}`);

        const currentRoster = rosterType === 'main' ? guild.mainRoster : guild.subRoster;

        for (let i = 0; i < MAX_ROSTER_SIZE; i++) {
            const playerInfo = currentRoster[i] || { id: '', username: '' };
            
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId(`${rosterType}_slot_${i + 1}`)
                        .setLabel(`Slot ${i + 1} (ID ou @Menção)`)
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder("Deixe vazio para remover.")
                        .setRequired(false)
                        .setValue(playerInfo.id ? `<@${playerInfo.id}>` : '') // Sempre usa menção ou vazio
                )
            );
        }
        
        console.log(`[DIAGNÓSTICO SLOT] handleGuildPanelTrocarJogador_RosterSelect: Mostrando modal para edição de slots.`);
        // A função agora responde diretamente à sua própria interação com o modal.
        await interaction.showModal(modal);

    } catch (error) {
        console.error(`❌ [DIAGNÓSTICO SLOT] ERRO FATAL em handleGuildPanelTrocarJogador_RosterSelect:`, error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: `❌ Ocorreu um erro ao preparar o formulário de edição por slot.`, ephemeral: true });
        }
    }
}


async function handleGuildPanelTrocarJogador_RosterSubmit(interaction, guildIdSafe, globalConfig, client) {
    console.log(`[DIAGNÓSTICO SLOT] handleGuildPanelTrocarJogador_RosterSubmit INICIADO para guilda: ${guildIdSafe}`);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const parts = interaction.customId.split('_');
        const rosterType = parts[3]; 
        const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, false, true);
        if (!guild) {
            console.log(`[DIAGNÓSTICO SLOT] handleGuildPanelTrocarJogador_RosterSubmit: Guilda inválida ou sem permissão.`);
            return; // Já respondido por getAndValidateGuild
        }

        const oldMainRoster = [...guild.mainRoster];
        const oldSubRoster = [...guild.subRoster];

        const newProposedRoster = []; 
        const errors = [];
        const processedUserIdsInSubmission = new Set(); 

        for (let i = 0; i < MAX_ROSTER_SIZE; i++) {
            const input = interaction.fields.getTextInputValue(`${rosterType}_slot_${i + 1}`);
            if (!input) continue; 

            let cleanedId = input;
            const mentionMatch = input.match(/^<@!?(\d+)>$/);
            if (mentionMatch) {
                cleanedId = mentionMatch[1];
            }

            if (!/^\d+$/.test(cleanedId)) {
                errors.push(`ID inválido no slot ${i + 1}: \`${input}\`. Use ID numérico ou menção.`);
                continue;
            }

            if (processedUserIdsInSubmission.has(cleanedId)) {
                errors.push(`Usuário <@${cleanedId}> (${input}) duplicado no formulário. Por favor, insira cada jogador em um slot único.`);
                continue;
            }

            const member = await interaction.guild.members.fetch(cleanedId).catch(() => null);
            if (!member) {
                errors.push(`Usuário com ID \`${cleanedId}\` (slot ${i + 1}) não encontrado neste servidor.`);
                continue;
            }
            
            newProposedRoster.push({ id: member.id, username: member.user.username });
            processedUserIdsInSubmission.add(cleanedId);
        }

        if (errors.length > 0) {
            console.log(`[DIAGNÓSTICO SLOT] handleGuildPanelTrocarJogador_RosterSubmit: Erros de validação na submissão:`, errors);
            return interaction.editReply({ content: `❌ Erros na submissão:\n• ${errors.join('\n• ')}` });
        }

        const allOldGuildMembers = new Set([...oldMainRoster.map(p => p.id), ...oldSubRoster.map(p => p.id)]);
        const allNewGuildMembers = new Set([...newProposedRoster.map(p => p.id), ... (rosterType === 'main' ? oldSubRoster : oldMainRoster).map(p => p.id)]); 

        const playersTrulyRemovedFromGuild = []; 
        const playersMovedWithinGuild = [];     
        const playersAddedToGuild = [];         

        for (const oldPlayer of allOldGuildMembers) {
            if (!allNewGuildMembers.has(oldPlayer)) {
                const isLeader = guild.leader?.id === oldPlayer;
                const isCoLeader = guild.coLeader?.id === oldPlayer;
                if (!isLeader && !isCoLeader) {
                    playersTrulyRemovedFromGuild.push(oldPlayer); 
                }
            }
        }

        for (const newPlayer of processedUserIdsInSubmission) { 
            const wasInOldMain = oldMainRoster.some(p => p.id === newPlayer);
            const wasInOldSub = oldSubRoster.some(p => p.id === newPlayer);

            if (!wasInOldMain && !wasInOldSub) {
                playersAddedToGuild.push(newPlayer);
            } else if ((rosterType === 'main' && wasInOldSub && !oldMainRoster.some(p => p.id === newPlayer)) || 
                       (rosterType === 'sub' && wasInOldMain && !oldSubRoster.some(p => p.id === newPlayer))) {
                playersMovedWithinGuild.push(newPlayer);
            }
        }


        const now = new Date(); // CORRIGIDO: new Date() para ter toISOString()
        for (const removedPlayerId of playersTrulyRemovedFromGuild) {
            globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== removedPlayerId); 
            globalConfig.recentlyLeftUsers.push({ userId: removedPlayerId, leaveTimestamp: now.toISOString() });
            console.log(`[DIAGNÓSTICO SLOT] Cooldown aplicado para ${removedPlayerId} (removido da guilda).`);
        }

        const newPlayersWithCooldownChecks = [];
        for (const addedPlayerId of playersAddedToGuild) {
            const member = await client.users.fetch(addedPlayerId).catch(() => null);
            if (!member) {
                errors.push(`Usuário com ID \`${addedPlayerId}\` (adicionado) não encontrado neste servidor.`);
                continue;
            }

            const userInAnotherGuild = await isUserInAnyGuild(addedPlayerId);
            if (userInAnotherGuild && userInAnotherGuild.name !== guild.name) {
                errors.push(`Usuário ${member.toString()} já está na guilda "${userInAnotherGuild.name}" e não pode ser adicionado.`);
                continue;
            }

            const recentlyLeftUser = globalConfig.recentlyLeftUsers.find(u => u.userId === addedPlayerId);
            if (recentlyLeftUser) {
                const leaveTime = new Date(recentlyLeftUser.leaveTimestamp).getTime();
                const diffTime = now.getTime() - leaveTime;
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays < COOLDOWN_DAYS) {
                    errors.push(`Usuário ${member.toString()} precisa esperar ${COOLDOWN_DAYS - diffDays} dia(s) para entrar em uma nova guilda.`);
                    continue;
                }
            }
            globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== addedPlayerId);
            newPlayersWithCooldownChecks.push(addedPlayerId); 
        }

        const threeDaysAgo = new Date(now.getTime() - (COOLDOWN_DAYS * 24 * 60 * 60 * 1000)); 
        globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => new Date(u.leaveTimestamp) > threeDaysAgo);
        
        await saveConfig(globalConfig); 

        if (rosterType === 'main') {
            guild.mainRoster = newProposedRoster;
        } else {
            guild.subRoster = newProposedRoster;
        }

        guild.updatedAt = new Date().toISOString();
        guild.updatedBy = interaction.user.id;

        await saveGuildData(guild);
        
        // NOVO: Atualizar o post no fórum da guilda
        await manageGuildForumPost(client, guild, globalConfig, 'update', interaction);

        client.emit('updateLeaderboard');

        let replyMessage = `✅ Rosters da guilda **${guild.name}** atualizados:\n`;

        const currentMainRosterDisplay = guild.mainRoster.length > 0
            ? guild.mainRoster.map((p, idx) => `${idx + 1}. <@${p.id}>`).join('\n')
            : '*Vazio*';
        
        const currentSubRosterDisplay = guild.subRoster.length > 0
            ? guild.subRoster.map((p, idx) => `${idx + 1}. <@${p.id}>`).join('\n')
            : '*Vazio*';

        replyMessage += `\n**🛡️ Roster Principal (${guild.mainRoster.length}/${MAX_ROSTER_SIZE}):**\n${currentMainRosterDisplay}\n`;
        replyMessage += `\n**⚔️ Roster Reserva (${guild.subRoster.length}/${MAX_ROSTER_SIZE}):**\n${currentSubRosterDisplay}\n`;

        if (playersTrulyRemovedFromGuild.length > 0) {
            const removedTags = await Promise.all(playersTrulyRemovedFromGuild.map(async id => {
                const user = await client.users.fetch(id).catch(() => null);
                return user ? user.tag : `ID:${id}`;
            }));
            replyMessage += `\n**Jogadores Removidos (cooldown aplicado):** ${removedTags.join(', ')}\n`;
        }
        if (playersMovedWithinGuild.length > 0) {
            const movedTags = await Promise.all(playersMovedWithinGuild.map(async id => {
                const user = await client.users.fetch(id).catch(() => null);
                return user ? user.tag : `ID:${id}`;
            }));
            replyMessage += `\n**Jogadores Movidos (sem cooldown):** ${movedTags.join(', ')}\n`;
        }
        if (newPlayersWithCooldownChecks.length > 0) {
             const addedTags = await Promise.all(newPlayersWithCooldownChecks.map(async id => {
                const user = await client.users.fetch(id).catch(() => null);
                return user ? user.tag : `ID:${id}`;
            }));
            replyMessage += `\n**Jogadores Adicionados:** ${addedTags.join(', ')}\n`;
        }


        if (errors.length > 0) {
            replyMessage += `\n**⚠️ Erros encontrados durante a atualização:**\n• ${errors.join('\n• ')}\n`;
        }
        
        await sendLogMessage(
            client, globalConfig, interaction, 
            'Edição de Roster por Slot', 
            `Rosters da guilda **${guild.name}** atualizados por slot.`,
            [
                { name: 'Guilda', value: guild.name, inline: true },
                { name: 'Tipo de Roster Editado', value: rosterType === 'main' ? 'Principal' : 'Reserva', inline: true },
                { name: 'Membros no Roster Principal (novo)', value: `${guild.mainRoster.length}`, inline: true },
                { name: 'Membros no Roster Reserva (novo)', value: `${guild.subRoster.length}`, inline: true },
                { name: 'Jogadores Removidos (Cooldown)', value: `${playersTrulyRemovedFromGuild.length}`, inline: true },
                { name: 'Jogadores Movidos', value: `${playersMovedWithinGuild.length}`, inline: true },
                { name: 'Jogadores Adicionados (novos)', value: `${newPlayersWithCooldownChecks.length}`, inline: true },
                { name: 'Detalhes de Erros', value: errors.length > 0 ? errors.join('\n') : '*Nenhum*', inline: false },
            ]
        );

        await interaction.editReply({ content: replyMessage });
    } catch (error) {
        console.error(`❌ [DIAGNÓSTICO SLOT] ERRO FATAL em handleGuildPanelTrocarJogador_RosterSubmit:`, error);
        await interaction.editReply({ content: `❌ Ocorreu um erro ao processar a submissão do formulário. Detalhes: ${error.message}`, flags: MessageFlags.Ephemeral });
    }
}
// --- NOVO FLUXO: GERENCIAR ROSTERS VIA DROPDOWN (SUBSTITUI GERENCIAR MEMBRO DIRETO E EDITAR POR SLOT) ---

// handler para o botão "Gerenciar Rosters" no painel da guilda
async function handleGuildPanelManageRosters_Initial(interaction, guildIdSafe, globalConfig, client) { 
    console.log(`[DIAGNÓSTICO DROPDOWN] handleGuildPanelManageRosters_Initial INICIADO para guilda: ${guildIdSafe}`);
    try {
        const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, false, true);
        if (!guild) {
            console.log(`[DIAGNÓSTICO DROPDOWN] handleGuildPanelManageRosters_Initial: Guilda inválida ou sem permissão.`);
            return; 
        }

        // ---- CORREÇÃO AQUI ----
        // Criamos o menu e já definimos todas as suas propriedades, incluindo as opções, de uma só vez.
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`manage_rosters_action_select_${guildIdSafe}`)
            .setPlaceholder('Escolha uma ação de gerenciamento de roster...')
            .addOptions(
                {
                    label: 'Adicionar Membro (Selecionar)',
                    description: 'Adiciona um novo membro à guilda (via seleção de usuário).',
                    value: 'add_member_select',
                    emoji: '➕',
                },
                {
                    label: 'Remover Membro (Selecionar)',
                    description: 'Remove um membro da guilda (via seleção de usuário).',
                    value: 'remove_member_select',
                    emoji: '➖',
                },
                {
                    label: 'Mover Membro (Principal/Reserva)',
                    description: 'Move um membro entre o roster principal e reserva.',
                    value: 'move_member_select',
                    emoji: '↔️',
                },
                {
                    label: 'Editar Rosters por Slot (Manual)',
                    description: 'Edita rosters slot a slot, usando IDs ou menções.',
                    value: 'edit_by_slot',
                    emoji: '📝',
                },
                {
                    label: 'Adicionar Membros em Massa (IDs)',
                    description: 'Adiciona múltiplos membros de uma vez, via lista de IDs.',
                    value: 'bulk_add',
                    emoji: '📤',
                }
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: `Qual operação de roster você deseja realizar para **${guild.name}**?`,
            components: [row],
            flags: MessageFlags.Ephemeral, 
        });

        console.log(`[DIAGNÓSTICO DROPDOWN] handleGuildPanelManageRosters_Initial: Menu de seleção de ação enviado.`);
    } catch (error) {
        // Log do erro completo para depuração
        console.error('❌ [DIAGNÓSTICO DROPDOWN] ERRO FATAL em handleGuildPanelManageRosters_Initial:', error);
        
        // Tenta responder ao usuário se a interação ainda não foi respondida
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ Ocorreu um erro ao gerar o menu de gerenciamento de rosters. Por favor, tente novamente.',
                ephemeral: true
            }).catch(e => console.error("Falha ao enviar mensagem de erro de fallback:", e));
        } else {
             await interaction.followUp({
                content: '❌ Ocorreu um erro ao gerar o menu de gerenciamento de rosters. Por favor, tente novamente.',
                ephemeral: true
            }).catch(e => console.error("Falha ao enviar mensagem de erro de fallback (followUp):", e));
        }
    }
}


// handler para a seleção do dropdown "Gerenciar Rosters"
// Substitua a função inteira em handlers/panel/rosterHandlers.js

// Substitua esta função também em rosterHandlers.js

async function handleGuildPanelManageRosters_SelectAction(interaction, guildIdSafe, globalConfig, client) {
    console.log(`[DIAGNÓSTICO DROPDOWN] Ação selecionada: ${interaction.values[0]}`);
    const action = interaction.values[0];

    try {
        // Ação de modal é tratada sem defer
        if (action === 'bulk_add') {
            const bulkAddResult = await handleGuildPanelBulkaddmember(interaction, guildIdSafe, globalConfig, client);
            if (bulkAddResult && bulkAddResult.type === 'modal') {
                return await interaction.showModal(bulkAddResult.data);
            }
        }
        
        // Para todas as outras ações, usamos deferUpdate.
        await interaction.deferUpdate();

        // Para "Editar por Slot", agora chamamos a função que retorna os componentes.
        if (action === 'edit_by_slot') {
            // Esta função retorna os componentes do próximo passo (selecionar main/sub)
            const slotResult = await handleGuildPanelTrocarJogador_Initial(interaction, guildIdSafe, globalConfig, client);
            if (slotResult && !slotResult.error) {
                return await interaction.editReply(slotResult);
            } else if (slotResult && slotResult.error) {
                return await interaction.editReply({ content: slotResult.content, components: [] });
            }
        }
        
        // Lógica para os menus de seleção de usuário.
        const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, false, true);
        if (!guild) return;

        let responseOptions = { content: '', components: [], embeds: [], flags: MessageFlags.Ephemeral };

        switch(action) {
            case 'add_member_select':
                responseOptions.content = `Selecione o membro para **adicionar** à guilda **${guild.name}**:`;
                responseOptions.components.push(new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(`manageplayer_user_select_add_${guildIdSafe}`).setPlaceholder('Selecione o membro para adicionar')));
                break;
            case 'remove_member_select':
                responseOptions.content = `Selecione o membro para **remover** da guilda **${guild.name}**:`;
                responseOptions.components.push(new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(`manageplayer_user_select_remove_${guildIdSafe}`).setPlaceholder('Selecione o membro para remover')));
                break;
            case 'move_member_select':
                responseOptions.content = `Selecione o membro para **mover** na guilda **${guild.name}**:`;
                responseOptions.components.push(new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(`manageplayer_user_select_move_${guildIdSafe}`).setPlaceholder('Selecione o membro para mover')));
                break;
        }

        if (responseOptions.components.length > 0) {
            await interaction.editReply(responseOptions);
        }

    } catch (error) {
        console.error(`❌ [DIAGNÓSTICO DROPDOWN] ERRO FATAL em handleGuildPanelManageRosters_SelectAction:`, error);
        if (interaction.deferred && !interaction.replied) {
            await interaction.followUp({ content: '❌ Ocorreu um erro ao processar sua seleção.', ephemeral: true }).catch(() => {});
        }
    }
}

// --- FLUXO DE GERENCIAR MEMBRO DIRETO (ADICIONAR/REMOVER/MOVER UM ÚNICO MEMBRO) ---
// Estas funções são as mesmas que antes, mas agora são acionadas por dentro do fluxo de dropdown.
async function handleGuildPanelManagePlayer_SelectUser(interaction, client, globalConfig, customId) { 
    // customId format: manageplayer_user_select_ACTION_GUILDIDSAFE
    const parts = customId.split('_');
    if (parts.length < 5) {
        console.error(`[DIAGNÓSTICO JOGADOR] Invalid customId format for manageplayer_user_select: ${customId}`);
        return interaction.reply({ content: '❌ Erro interno: ID de seleção de usuário inválido.', flags: MessageFlags.Ephemeral });
    }
    const actionType = parts[3];
    const guildIdSafe = parts.slice(4).join('_');

    console.log(`[DIAGNÓSTICO JOGADOR] handleGuildPanelManagePlayer_SelectUser INICIADO. Ação: ${actionType}, Usuário ID: ${interaction.users.first()?.id}`);
    try {
        const selectedUserId = interaction.users.first().id; 
        const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, false, true); // guildIdSafe is now correctly parsed
        if (!guild) {
            console.log(`[DIAGNÓSTICO JOGADOR] handleGuildPanelManagePlayer_SelectUser: Guilda inválida ou sem permissão.`);
            return; // getAndValidateGuild já respondeu
        }

        await interaction.update({ components: [] }); // Remove o menu de seleção de usuário

        const member = await interaction.guild.members.fetch(selectedUserId).catch(() => null);
        if (!member) {
            console.log(`[DIAGNÓSTICO JOGADOR] Usuário selecionado (${selectedUserId}) não encontrado neste servidor.`);
            return interaction.followUp({ content: `❌ Usuário selecionado (${selectedUserId}) não encontrado neste servidor.`, flags: MessageFlags.Ephemeral });
        }

        let replyMessage = '';
        let playerObj = { id: member.id, username: member.user.username };

        switch (actionType) {
            case 'add':
                const userInGuild = await isUserInAnyGuild(selectedUserId);
                if (userInGuild) {
                    if (userInGuild.name === guild.name) {
                        console.log(`[DIAGNÓSTICO JOGADOR] ${member.user.tag} já está na guilda ${guild.name}.`);
                        return interaction.followUp({ content: `❌ ${member.toString()} já está na guilda **${guild.name}**!`, flags: MessageFlags.Ephemeral });
                    } else {
                        console.log(`[DIAGNÓSTICO JOGADOR] ${member.user.tag} já está na outra guilda ${userInGuild.name}.`);
                        return interaction.followUp({ content: `❌ ${member.toString()} já está na guilda **${userInGuild.name}** e não pode ser adicionado a esta!`, flags: MessageFlags.Ephemeral });
                    }
                }
                const recentlyLeftUser = globalConfig.recentlyLeftUsers.find(u => u.userId === member.id);
                if (recentlyLeftUser) {
                    const leaveTime = new Date(recentlyLeftUser.leaveTimestamp).getTime();
                    const now = new Date(); // CORRIGIDO: new Date() para ter toISOString()
                    const diffTime = now.getTime() - leaveTime;
                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays < COOLDOWN_DAYS) {
                        const remainingDays = COOLDOWN_DAYS - diffDays;
                        console.log(`[DIAGNÓSTICO JOGADOR] ${member.user.tag} em cooldown. Dias restantes: ${remainingDays}.`);
                        return interaction.followUp({ content: `❌ ${member.toString()} deixou uma guilda há ${diffDays} dia(s) e precisa esperar ${remainingDays} dia(s) para entrar em uma nova guilda!`, flags: MessageFlags.Ephemeral });
                    }
                }

                if (guild.mainRoster.length < MAX_ROSTER_SIZE) {
                    guild.mainRoster.push(playerObj);
                    replyMessage = `✅ ${member.toString()} adicionado ao **Roster Principal** da guilda **${guild.name}**!`;
                    console.log(`[DIAGNÓSTICO JOGADOR] ${member.user.tag} adicionado ao Main Roster.`);
                } else if (guild.subRoster.length < MAX_ROSTER_SIZE) {
                    guild.subRoster.push(playerObj);
                    replyMessage = `✅ ${member.toString()} adicionado ao **Roster Reserva** da guilda **${guild.name}**!`;
                    console.log(`[DIAGNÓSTICO JOGADOR] ${member.user.tag} adicionado ao Sub Roster.`);
                } else {
                    console.log(`[DIAGNÓSTICO JOGADOR] Ambos os rosters estão cheios para ${member.user.tag}.`);
                    return interaction.followUp({ content: `❌ Ambos os rosters (Principal e Reserva) da guilda **${guild.name}** estão cheios. Não é possível adicionar o membro.`, flags: MessageFlags.Ephemeral });
                }

                globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== selectedUserId);
                await saveConfig(globalConfig);
                console.log(`[DIAGNÓSTICO JOGADOR] Cooldown de ${member.user.tag} limpo.`);
                break;

            case 'remove':
                console.log(`[DIAGNÓSTICO JOGADOR] Ação 'remove': Tentando remover ${member.user.tag}.`);
                const isLeader = guild.leader?.id === selectedUserId;
                const isCoLeader = guild.coLeader?.id === selectedUserId;
                const wasInMain = guild.mainRoster.some(p => p.id === selectedUserId);
                const wasInSub = guild.subRoster.some(p => p.id === selectedUserId);

                if (isLeader || isCoLeader) {
                    console.log(`[DIAGNÓSTICO JOGADOR] ${member.user.tag} é líder/co-líder. Não pode ser removido por aqui.`);
                    return interaction.followUp({ content: `❌ ${member.toString()} é líder ou vice-líder da guilda. Use "Trocar Líder" ou "Trocar Vice-Líder" para gerenciar.`, flags: MessageFlags.Ephemeral });
                }
                if (!wasInMain && !wasInSub) {
                    console.log(`[DIAGNÓSTICO JOGADOR] ${member.user.tag} não está nos rosters.`);
                    return interaction.followUp({ content: `❌ ${member.toString()} não está em nenhum roster da guilda **${guild.name}**.`, flags: MessageFlags.Ephemeral });
                }

                guild.mainRoster = guild.mainRoster.filter(p => p.id !== selectedUserId);
                guild.subRoster = guild.subRoster.filter(p => p.id !== selectedUserId);
                
                const now = new Date(); // CORRIGIDO: new Date() para ter toISOString()
                globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== selectedUserId);
                globalConfig.recentlyLeftUsers.push({ userId: selectedUserId, leaveTimestamp: now.toISOString() });
                const threeDaysAgo = new Date(now.getTime() - (COOLDOWN_DAYS * 24 * 60 * 60 * 1000)); 
                globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => new Date(u.leaveTimestamp) > threeDaysAgo);
                await saveConfig(globalConfig);
                console.log(`[DIAGNÓSTICO JOGADOR] ${member.user.tag} removido dos rosters e cooldown aplicado.`);

                replyMessage = `✅ ${member.toString()} removido da guilda **${guild.name}** e entrou em cooldown de 3 dias.`;
                break;

            case 'move':
                console.log(`[DIAGNÓSTICO JOGADOR] Ação 'move': Tentando mover ${member.user.tag}.`);
                const currentMain = guild.mainRoster.some(p => p.id === selectedUserId);
                const currentSub = guild.subRoster.some(p => p.id === selectedUserId);
                if (!currentMain && !currentSub) {
                    console.log(`[DIAGNÓSTICO JOGADOR] ${member.user.tag} não está nos rosters para ser movido.`);
                    return interaction.followUp({ content: `❌ ${member.toString()} não está em nenhum roster da guilda **${guild.name}** para ser movido.`, flags: MessageFlags.Ephemeral });
                }
                const isLeaderMove = guild.leader?.id === selectedUserId;
                const isCoLeaderMove = guild.coLeader?.id === selectedUserId;
                if (isLeaderMove || isCoLeaderMove) {
                    console.log(`[DIAGNÓSTICO JOGADOR] ${member.user.tag} é líder/co-líder. Não pode ser movido por aqui.`);
                    return interaction.followUp({ content: `❌ ${member.toString()} é líder ou vice-líder da guilda e não pode ser movido entre rosters por aqui.`, flags: MessageFlags.Ephemeral });
                }

                const moveSelectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`manageplayer_roster_type_select_${selectedUserId}_${guildIdSafe}`) // guildIdSafe is correctly parsed now
                    .setPlaceholder(`Mover ${member.user.username} para qual roster?`);
                
                if (currentMain && guild.subRoster.length < MAX_ROSTER_SIZE) { 
                    moveSelectMenu.addOptions({
                        label: 'Roster Reserva',
                        description: `Move ${member.user.username} para o Roster Reserva.`,
                        value: 'sub',
                        emoji: '⚔️'
                    });
                }
                if (currentSub && guild.mainRoster.length < MAX_ROSTER_SIZE) { 
                     moveSelectMenu.addOptions({
                        label: 'Roster Principal',
                        description: `Move ${member.user.username} para o Roster Principal.`,
                        value: 'main',
                        emoji: '🛡️'
                    });
                }

                if (moveSelectMenu.options.length === 0) {
                    let fullRoster = '';
                    if (currentMain) fullRoster = 'reserva';
                    else if (currentSub) fullRoster = 'principal';
                    console.log(`[DIAGNÓSTICO JOGADOR] Rosters cheios para mover ${member.user.tag}.`);
                    return interaction.followUp({ content: `❌ Não há espaço no roster ${fullRoster} para mover ${member.toString()}. O roster está cheio.`, flags: MessageFlags.Ephemeral });
                }

                const moveRow = new ActionRowBuilder().addComponents(moveSelectMenu);
                console.log(`[DIAGNÓSTICO JOGADOR] Enviando menu de seleção de tipo de roster para mover.`);
                return interaction.followUp({ 
                    content: `Selecione o destino para ${member.toString()}:`,
                    components: [moveRow],
                    flags: MessageFlags.Ephemeral
                });
        }
        
        guild.updatedAt = new Date().toISOString();
        guild.updatedBy = interaction.user.id;
        await saveGuildData(guild);
        client.emit('updateLeaderboard');
        await sendLogMessage(
            client, globalConfig, interaction,
            `Gerenciamento Direto de Membro (${actionType.toUpperCase()})`,
            `${actionType.charAt(0).toUpperCase() + actionType.slice(1)} de ${member.user.tag} na guilda **${guild.name}**.`,
            [
                { name: 'Guilda', value: guild.name, inline: true },
                { name: 'Membro', value: `<@${member.id}>`, inline: true },
                { name: 'Ação', value: actionType.charAt(0).toUpperCase() + actionType.slice(1), inline: true },
            ]
        );
        if (replyMessage) { 
            await interaction.followUp({ content: replyMessage, flags: MessageFlags.Ephemeral });
        }
        console.log(`[DIAGNÓSTICO JOGADOR] managePlayer_SelectUser concluído para ${member.user.tag}.`);

    } catch (error) {
        console.error(`❌ [DIAGNÓSTICO JOGADOR] ERRO FATAL em handleGuildPanelManagePlayer_SelectUser (ação ${actionType}):`, error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: `❌ Ocorreu um erro ao ${actionType} o membro. Detalhes: ${error.message}`, flags: MessageFlags.Ephemeral });
        } else {
            await interaction.followUp({ content: `❌ Ocorreu um erro ao ${actionType} o membro. Detalhes: ${error.message}`, flags: MessageFlags.Ephemeral });
        }
    }
}

// Lida com a seleção do tipo de roster para mover
async function handleGuildPanelManagePlayer_SelectRosterType(interaction, client, globalConfig, customId) { 
    // customId format: manageplayer_roster_type_select_USERID_GUILDIDSAFE
    const parts = customId.split('_');
    if (parts.length < 6) { // manageplayer_roster_type_select_USERID_GUILDIDSAFE (at least 6 parts)
        console.error(`[DIAGNÓSTICO MOVER] Invalid customId format for manageplayer_roster_type_select: ${customId}`);
        return interaction.reply({ content: '❌ Erro interno: ID de seleção de tipo de roster inválido.', flags: MessageFlags.Ephemeral });
    }
    const selectedUserId = parts[4];
    const guildIdSafe = parts.slice(5).join('_');
    console.log(`[DIAGNÓSTICO MOVER] handleGuildPanelManagePlayer_SelectRosterType INICIADO. Usuário: ${selectedUserId}, Roster Destino: ${interaction.values[0]}`);
    try {
        const targetRosterType = interaction.values[0]; 
        const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, false, true); // guildIdSafe is now correctly parsed
        if (!guild) {
            console.log(`[DIAGNÓSTICO MOVER] Guilda inválida ou sem permissão.`);
            return; // getAndValidateGuild já respondeu
        }

        await interaction.update({ components: [] }); 

        const member = await interaction.guild.members.fetch(selectedUserId).catch(() => null);
        if (!member) {
            console.log(`[DIAGNÓSTICO MOVER] Usuário (${selectedUserId}) não encontrado.`);
            return interaction.followUp({ content: `❌ Usuário (${selectedUserId}) não encontrado.`, flags: MessageFlags.Ephemeral });
        }

        const isCurrentlyInMain = guild.mainRoster.some(p => p.id === selectedUserId);
        const isCurrentlyInSub = guild.subRoster.some(p => p.id === selectedUserId);

        if (!isCurrentlyInMain && !isCurrentlyInSub) {
            console.log(`[DIAGNÓSTICO MOVER] ${member.user.tag} não está em nenhum roster.`);
            return interaction.followUp({ content: `❌ ${member.toString()} não está em nenhum roster da guilda **${guild.name}**.`, flags: MessageFlags.Ephemeral });
        }
        if ((targetRosterType === 'main' && isCurrentlyInMain) || (targetRosterType === 'sub' && isCurrentlyInSub)) {
            console.log(`[DIAGNÓSTICO MOVER] ${member.user.tag} já está no roster de destino.`);
            return interaction.followUp({ content: `❌ ${member.toString()} já está no Roster ${targetRosterType === 'main' ? 'Principal' : 'Reserva'}.`, flags: MessageFlags.Ephemeral });
        }
        if ((targetRosterType === 'main' && guild.mainRoster.length >= MAX_ROSTER_SIZE && !isCurrentlyInMain) ||
            (targetRosterType === 'sub' && guild.subRoster.length >= MAX_ROSTER_SIZE && !isCurrentlyInSub)) {
            console.log(`[DIAGNÓSTICO MOVER] Roster de destino (${targetRosterType}) cheio para ${member.user.tag}.`);
            return interaction.followUp({ content: `❌ O Roster ${targetRosterType === 'main' ? 'Principal' : 'Reserva'} da guilda **${guild.name}** está cheio. Não é possível mover.`, flags: MessageFlags.Ephemeral });
        }

        console.log(`[DIAGNÓSTICO MOVER] Movendo ${member.user.tag} para o roster ${targetRosterType}.`);
        guild.mainRoster = guild.mainRoster.filter(p => p.id !== selectedUserId);
        guild.subRoster = guild.subRoster.filter(p => p.id !== selectedUserId);

        const playerObj = { id: member.id, username: member.user.username };
        if (targetRosterType === 'main') {
            guild.mainRoster.push(playerObj);
        } else {
            guild.subRoster.push(playerObj);
        }

        guild.updatedAt = new Date().toISOString();
        guild.updatedBy = interaction.user.id;
        await saveGuildData(guild);
        client.emit('updateLeaderboard');

        await sendLogMessage(
            client, globalConfig, interaction,
            'Movimentação de Membro',
            `${member.user.tag} foi movido para o Roster ${targetRosterType === 'main' ? 'Principal' : 'Reserva'} da guilda **${guild.name}**.`,
            [
                { name: 'Guilda', value: guild.name, inline: true },
                { name: 'Membro', value: `<@${member.id}>`, inline: true },
                { name: 'Roster Destino', value: targetRosterType === 'main' ? 'Principal' : 'Reserva', inline: true },
            ]
        );
        await interaction.followUp({ content: `✅ ${member.toString()} movido para o **Roster ${targetRosterType === 'main' ? 'Principal' : 'Reserva'}** da guilda **${guild.name}**!`, flags: MessageFlags.Ephemeral });
        console.log(`[DIAGNÓSTICO MOVER] Movimentação de ${member.user.tag} concluída.`);
    } catch (error) {
        console.error(`❌ [DIAGNÓSTICO MOVER] ERRO FATAL em handleGuildPanelManagePlayer_SelectRosterType:`, error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: `❌ Ocorreu um erro ao mover o membro. Detalhes: ${error.message}`, flags: MessageFlags.Ephemeral });
        } else {
            await interaction.followUp({ content: `❌ Ocorreu um erro ao mover o membro. Detalhes: ${error.message}`, flags: MessageFlags.Ephemeral });
        }
    }
}

/**
 * Lida com o clique do usuário no botão "Sair da Guilda" em seu próprio perfil.
 * @param {ButtonInteraction} interaction - A interação do botão.
 * @param {string} guildMongoId - O ID da guilda do qual o usuário quer sair.
 * @param {Object} globalConfig - A configuração global do bot.
 * @param {Client} client - A instância do bot.
 */
async function handleProfileLeaveGuild(interaction, guildMongoId, globalConfig, client) {
    // Carrega a guilda pelo ID passado no customId do botão
    const guild = await loadGuildById(guildMongoId);

    // Validações
    if (!guild) {
        return interaction.reply({ content: '❌ A guilda da qual você está tentando sair não foi encontrada. Ela pode ter sido deletada.', ephemeral: true });
    }
    if (interaction.user.id === guild.leader?.id) {
        return interaction.reply({ content: '❌ Você é o Líder desta guilda! Você não pode sair. Transfira a liderança primeiro usando o `/guilda-painel`.', ephemeral: true });
    }
    if (interaction.user.id === guild.coLeader?.id) {
        return interaction.reply({ content: '❌ Você é o Vice-Líder desta guilda! Você não pode sair. Peça ao líder para removê-lo ou transferir o cargo.', ephemeral: true });
    }

    const isInMainRoster = guild.mainRoster.some(m => m.id === interaction.user.id);
    const isInSubRoster = guild.subRoster.some(m => m.id === interaction.user.id);

    if (!isInMainRoster && !isInSubRoster) {
        return interaction.reply({ content: '❌ Você não está nos rosters desta guilda para poder sair. Contate um líder.', ephemeral: true });
    }

    // Se passou em todas as validações, mostra a confirmação final
    const confirmButton = new ButtonBuilder().setCustomId(`confirm_leave_guild_${guildMongoId}`).setLabel('Sim, Quero Sair').setStyle(ButtonStyle.Danger);
    const cancelButton = new ButtonBuilder().setCustomId('cancel_leave_guild').setLabel('Cancelar').setStyle(ButtonStyle.Secondary);
    const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

    await interaction.reply({
        content: `Você tem certeza que deseja sair da guilda **${guild.name}**? Você entrará em um cooldown de 3 dias e não poderá se juntar a outra guilda neste período.`,
        components: [row],
        ephemeral: true,
    });
}

// Adicione esta função também ao handlers/panel/rosterHandlers.js

async function handleConfirmLeaveGuild(interaction, guildMongoId, globalConfig, client) {
    await interaction.deferUpdate(); // Acknowledge o clique no botão

    const guild = await loadGuildById(guildMongoId);
    if (!guild) {
        return interaction.editReply({ content: '❌ A guilda não foi encontrada. Ação cancelada.', components: [] });
    }

    // Remove o usuário dos rosters
    guild.mainRoster = guild.mainRoster.filter(m => m.id !== interaction.user.id);
    guild.subRoster = guild.subRoster.filter(m => m.id !== interaction.user.id);
    guild.updatedAt = new Date().toISOString();
    guild.updatedBy = interaction.user.id;

    // Aplica o cooldown
    const COOLDOWN_DAYS = 3;
    const now = new Date();
    globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== interaction.user.id);
    globalConfig.recentlyLeftUsers.push({ userId: interaction.user.id, leaveTimestamp: now.toISOString() });
    const threeDaysAgo = new Date(now.getTime() - (COOLDOWN_DAYS * 24 * 60 * 60 * 1000));
    globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => new Date(u.leaveTimestamp) > threeDaysAgo);
    
    // Salva tudo
    await saveGuildData(guild);
    await saveConfig(globalConfig);

    // Atualiza os painéis públicos
    await manageGuildForumPost(client, guild, globalConfig, 'update', interaction);
    client.emit('updateLeaderboard');

    // Loga a ação
    await sendLogMessage(
        client, globalConfig, interaction,
        'Saída de Guilda (Voluntária)',
        `${interaction.user.tag} saiu da guilda **${guild.name}**.`,
        [
            { name: 'Guilda', value: guild.name, inline: true },
            { name: 'Membro', value: interaction.user.toString(), inline: true },
        ]
    );

    // Notifica o usuário e o líder da guilda (DM)
    await interaction.editReply({ content: `✅ Você saiu da guilda **${guild.name}**.`, components: [] });
    const leader = await client.users.fetch(guild.leader.id).catch(() => null);
    if (leader) {
        await leader.send(`ℹ️ O membro **${interaction.user.tag}** saiu voluntariamente da sua guilda, **${guild.name}**.`).catch(e => console.error("Não foi possível enviar DM para o líder.", e.message));
    }
}

module.exports = {
    processRosterInput, 

    // MANTIDO: Funções que ainda podem ser chamadas internamente ou por outros meios
    handleGuildPanelAddmember,
    handleGuildPanelAddmemberSubmit, 
    handleGuildPanelRemovemember,
    handleGuildPanelRemovememberSubmit,
    handleGuildPanelBulkaddmember,
    handleGuildPanelBulkaddmemberSubmit,

    // MANTIDO: Fluxo de troca de jogador por slot
    handleGuildPanelTrocarJogador_Initial,     
    handleGuildPanelTrocarJogador_RosterSelect, 
    handleGuildPanelTrocarJogador_RosterSubmit, 

    // NOVO FLUXO: Gerenciar Rosters via Dropdown (ponto de entrada)
    handleGuildPanelManageRosters_Initial,      
    handleGuildPanelManageRosters_SelectAction, 

    // SUB-FUNÇÕES DO FLUXO DE GERENCIAMENTO DIRETO
    handleGuildPanelManagePlayer_SelectUser,    
    handleGuildPanelManagePlayer_SelectRosterType, 

    // Handler de sair da guilda pessoalmente
    handleProfileLeaveGuild, // <-- ADICIONE ESTA LINHA
    handleConfirmLeaveGuild // <-- ADICIONE ESTA LINHA
};