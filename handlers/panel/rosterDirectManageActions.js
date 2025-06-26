// handlers/panel/rosterDirectManageActions.js
const { StringSelectMenuBuilder, ActionRowBuilder, MessageFlags } = require('discord.js');
const { loadGuildByName, saveGuildData, isUserInAnyGuild, loadGuildById, getAndValidateGuild } = require('../db/guildDb');
const { saveConfig } = require('../db/configDb');
const { sendLogMessage } = require('../utils/logManager');
// const { getAndValidateGuild } = require('../utils/validation'); // getAndValidateGuild já é de guildDb
const { COOLDOWN_DAYS, MAX_ROSTER_SIZE } = require('../utils/constants');

// --- FLUXO DE GERENCIAR MEMBRO DIRETO (ADICIONAR/REMOVER/MOVER UM ÚNICO MEMBRO) ---
async function handleGuildPanelManagePlayer_SelectUser(interaction, client, globalConfig, customId) {
    // ... (COPIE O CORPO DA FUNÇÃO handleGuildPanelManagePlayer_SelectUser DO SEU rosterHandlers.js ORIGINAL AQUI)
    // As primeiras linhas seriam:
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

async function handleGuildPanelManagePlayer_SelectRosterType(interaction, client, globalConfig, customId) {
    // ... (COPIE O CORPO DA FUNÇÃO handleGuildPanelManagePlayer_SelectRosterType DO SEU rosterHandlers.js ORIGINAL AQUI)
    // As primeiras linhas seriam:
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

module.exports = {
    handleGuildPanelManagePlayer_SelectUser,
    handleGuildPanelManagePlayer_SelectRosterType,
};