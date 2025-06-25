// handlers/panel/rosterManageDirect.js
const { StringSelectMenuBuilder, UserSelectMenuBuilder, ActionRowBuilder, MessageFlags } = require('discord.js');
const { loadGuildByName, saveGuildData, isUserInAnyGuild } = require('../db/guildDb');
const { saveConfig } = require('../db/configDb');
const { sendLogMessage } = require('../utils/logManager');
const { getAndValidateGuild } = require('../utils/validation');
// Funções e constantes do nosso rosterUtils.js
const { validateMemberEligibility, applyLeaveCooldown, COOLDOWN_DAYS: MANAGE_DIRECT_COOLDOWN_DAYS } = require('./rosterUtils');

const MAX_ROSTER_SIZE = 5; // Usado para verificar se rosters estão cheios ao adicionar/mover

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

async function handleGuildPanelManageRosters_SelectAction(interaction, guildIdSafe, globalConfig, client) {
    console.log(`[DIAGNÓSTICO DROPDOWN] Ação selecionada: ${interaction.values[0]}`);
    const action = interaction.values[0];

    try {
        if (action === 'bulk_add') {
            const bulkAddResult = await handleGuildPanelBulkaddmember(interaction, guildIdSafe, globalConfig, client);
            if (bulkAddResult && bulkAddResult.type === 'modal') {
                return await interaction.showModal(bulkAddResult.data);
            }
        }
        
        await interaction.deferUpdate();

        if (action === 'edit_by_slot') {
            const slotResult = await handleGuildPanelTrocarJogador_Initial(interaction, guildIdSafe, globalConfig, client);
            if (slotResult && !slotResult.error) {
                return await interaction.editReply(slotResult);
            } else if (slotResult && slotResult.error) {
                return await interaction.editReply({ content: slotResult.content, components: [] });
            }
        }
        
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
                const validation = await validateMemberEligibility(selectedUserId, guild, globalConfig, member.user);
                if (!validation.elegible) {
                    console.log(`[DIAGNÓSTICO JOGADOR] Validação falhou para ${member.user.tag}: ${validation.error}`);
                    return interaction.followUp({ content: validation.error, flags: MessageFlags.Ephemeral });
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
                
            applyLeaveCooldown(selectedUserId, globalConfig);
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

module.exports = {
    handleGuildPanelManageRosters_Initial,
    handleGuildPanelManageRosters_SelectAction,
    handleGuildPanelManagePlayer_SelectUser,
    handleGuildPanelManagePlayer_SelectRosterType,
};
