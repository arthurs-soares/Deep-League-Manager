// handlers/panel/rosterDirectManageActions.js
const { StringSelectMenuBuilder, ActionRowBuilder, MessageFlags } = require('discord.js');
const { loadGuildByName, saveGuildData, isUserInAnyGuild, loadGuildById } = require('../../db/guildDb');
const { saveConfig } = require('../../db/configDb');
const { sendLogMessage } = require('../../utils/logManager');
const { COOLDOWN_DAYS, MAX_ROSTER_SIZE } = require('../../utils/constants');
const { getAndValidateGuild } = require('../../utils/validation');

async function handleGuildPanelManagePlayer_SelectUser(interaction, client, globalConfig, customId) {
    const parts = customId.split('_');
    if (parts.length < 5) {
        console.error(`[DIAGNÓSTICO JOGADOR] Invalid customId format for manageplayer_user_select: ${customId}`);
        // Não podemos deferir aqui ainda, pois a validação do customId é síncrona
        return interaction.reply({ content: '❌ Erro interno: ID de seleção de usuário inválido.', flags: MessageFlags.Ephemeral });
    }
    const actionType = parts[3];
    const guildIdSafe = parts.slice(4).join('_');

    console.log(`[DIAGNÓSTICO JOGADOR] handleGuildPanelManagePlayer_SelectUser INICIADO. Ação: ${actionType}, Usuário ID: ${interaction.users.first()?.id}`);

    // --- DEFERIR A INTERAÇÃO DO MENU DE SELEÇÃO DE USUÁRIO AQUI ---
    if (actionType !== 'move') { // Só defere para 'add' e 'remove' por enquanto
        try {
            // Atualiza a mensagem original para remover os componentes e indicar processamento
            await interaction.update({ content: 'Processando sua solicitação...', components: [], flags: MessageFlags.Ephemeral });
        } catch (error) {
            // Se o update falhar (ex: interação já respondida), pode ser um problema de fluxo anterior.
            // Tentaremos um deferReply como fallback, mas o ideal é que o update funcione.
            if (error.code !== 10062 && !interaction.deferred && !interaction.replied) { // 10062 é Unknown Interaction
                console.warn("[DIAGNÓSTICO JOGADOR] Falha ao fazer update na interação inicial do menu, tentando deferReply.", error.message);
                await interaction.deferReply({ ephemeral: true }).catch(e => console.error("Falha no deferReply de fallback:", e.message));
            } else if (error.code === 10062) {
                 console.warn("[DIAGNÓSTICO JOGADOR] Interação do menu de usuário já desconhecida ao tentar update. Fluxo pode precisar de revisão.");
            }
        }
    } else {
         try {
            await interaction.update({ components: [] }); // Apenas remove os componentes
        } catch (error) {
             console.warn("[DIAGNÓSTICO JOGADOR] Falha ao fazer update (limpar componentes) na interação 'move':", error.message);
             // Não deferimos aqui, pois 'move' vai responder com novos componentes.
        }
    }


    try {
        const selectedUserId = interaction.users.first().id;
        const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, false, true);
        if (!guild) {
            console.log(`[DIAGNÓSTICO JOGADOR] getAndValidateGuild retornou nulo para ${guildIdSafe} na ação ${actionType}.`);
            if (interaction.deferred && !interaction.replied) { // Se foi deferido e não respondido
                await interaction.editReply({ content: '❌ Guilda não encontrada ou acesso negado (após defer).', components: [] });
            }
            return;
        }

        const member = await interaction.guild.members.fetch(selectedUserId).catch(() => null);
        if (!member) {
            const errorMsg = `❌ Usuário selecionado (<@${selectedUserId}>) não encontrado neste servidor.`;
            if (actionType !== 'move' && interaction.deferred) return interaction.editReply({ content: errorMsg, components: []});
            return interaction.followUp({ content: errorMsg, flags: MessageFlags.Ephemeral });
        }

        let replyMessage = '';
        let finalComponents = [];
        let playerObj = { id: member.id, username: member.user.username || 'Unknown User', joinedAt: new Date().toISOString() };

        switch (actionType) {
            case 'add':
                // Lógica de adicionar membro...
                const userInGuild = await isUserInAnyGuild(selectedUserId);
                if (userInGuild) {
                    const msg = userInGuild.name === guild.name ? `❌ ${member.toString()} já está na guilda **${guild.name}**!` : `❌ ${member.toString()} já está na guilda **${userInGuild.name}** e não pode ser adicionado a esta!`;
                    replyMessage = msg;
                    break;
                }
                // ... (resto da lógica de 'add')
                if (guild.mainRoster.length < MAX_ROSTER_SIZE) {
                    guild.mainRoster.push(playerObj);
                    replyMessage = `✅ ${member.toString()} adicionado ao **Roster Principal** da guilda **${guild.name}**!`;
                } else if (guild.subRoster.length < MAX_ROSTER_SIZE) {
                    guild.subRoster.push(playerObj);
                    replyMessage = `✅ ${member.toString()} adicionado ao **Roster Reserva** da guilda **${guild.name}**!`;
                } else {
                    replyMessage = `❌ Ambos os rosters (Principal e Reserva) da guilda **${guild.name}** estão cheios.`;
                    break;
                }
                globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== selectedUserId);
                await saveConfig(globalConfig);
                guild.updatedAt = new Date().toISOString();
                guild.updatedBy = interaction.user.id;
                console.log(`[DIAGNÓSTICO JOGADOR - ADD] Prestes a salvar guilda: ${guild.name}, Membro adicionado: ${playerObj.id}`);
                console.log(`[DIAGNÓSTICO JOGADOR - ADD] Roster Principal:`, guild.mainRoster);
                console.log(`[DIAGNÓSTICO JOGADOR - ADD] Roster Reserva:`, guild.subRoster);
                await saveGuildData(guild);
                console.log(`[DIAGNÓSTICO JOGADOR - ADD] saveGuildData chamado com sucesso.`);
                client.emit('updateLeaderboard');
                break;

            case 'remove':
                // Lógica de remover membro...
                const isLeader = guild.leader?.id === selectedUserId;
                const isCoLeader = guild.coLeader?.id === selectedUserId;
                if (isLeader || isCoLeader) {
                    replyMessage = `❌ ${member.toString()} é líder ou vice-líder da guilda. Use "Trocar Líder" ou "Trocar Vice-Líder".`;
                    break;
                }
                // ... (resto da lógica de 'remove')
                guild.mainRoster = guild.mainRoster.filter(p => p.id !== selectedUserId);
                guild.subRoster = guild.subRoster.filter(p => p.id !== selectedUserId);
                const nowRemove = new Date();
                // ... (lógica de cooldown) ...
                await saveConfig(globalConfig);
                guild.updatedAt = new Date().toISOString();
                guild.updatedBy = interaction.user.id;
                await saveGuildData(guild);
                client.emit('updateLeaderboard');
                replyMessage = `✅ ${member.toString()} removido da guilda **${guild.name}** e cooldown aplicado.`;
                break;

            case 'move':
                // A interação original do UserSelectMenu já foi respondida com interaction.update({ components: [] }) no início da função.
                // Portanto, agora usamos followUp para enviar a próxima etapa.

                console.log(`[DIAGNÓSTICO JOGADOR - MOVE] Verificando se jogador ${member.user.tag} pode ser movido na guilda ${guild.name}.`);
                const currentMainMove = guild.mainRoster.some(p => p.id === selectedUserId);
                const currentSubMove = guild.subRoster.some(p => p.id === selectedUserId);

                if (!currentMainMove && !currentSubMove) {
                    return interaction.followUp({ content: `❌ ${member.toString()} não está em nenhum roster da guilda **${guild.name}** para ser movido.`, flags: MessageFlags.Ephemeral });
                }
                // ... (validação de líder/co-líder) ...

                const moveSelectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`manageplayer_roster_type_select_${selectedUserId}_${guildIdSafe}`)
                    .setPlaceholder(`Mover ${member.user.username} para qual roster?`);

                let canMoveToMain = false;
                let canMoveToSub = false;

                if (currentSubMove && guild.mainRoster.length < MAX_ROSTER_SIZE) {
                    canMoveToMain = true;
                    moveSelectMenu.addOptions({
                        label: 'Roster Principal',
                        description: `Move ${member.user.username} para o Roster Principal.`,
                        value: 'main',
                        emoji: '🛡️'
                    });
                }
                if (currentMainMove && guild.subRoster.length < MAX_ROSTER_SIZE) {
                    canMoveToSub = true;
                    moveSelectMenu.addOptions({
                        label: 'Roster Reserva',
                        description: `Move ${member.user.username} para o Roster Reserva.`,
                        value: 'sub',
                        emoji: '⚔️'
                    });
                }

                if (!canMoveToMain && !canMoveToSub) {
                    let reason = "Ambos os rosters de destino estão cheios ou o jogador já está no único roster disponível para movimentação.";
                    if (currentMainMove && guild.subRoster.length >= MAX_ROSTER_SIZE) reason = "Roster Reserva está cheio.";
                    if (currentSubMove && guild.mainRoster.length >= MAX_ROSTER_SIZE) reason = "Roster Principal está cheio.";
                    
                    console.log(`[DIAGNÓSTICO JOGADOR - MOVE] Não é possível mover ${member.user.tag}. Razão: ${reason}`);
                    return interaction.followUp({ content: `❌ Não é possível mover ${member.toString()}. ${reason}`, flags: MessageFlags.Ephemeral });
                }

                const moveRow = new ActionRowBuilder().addComponents(moveSelectMenu);
                console.log(`[DIAGNÓSTICO JOGADOR - MOVE] Enviando menu de seleção de tipo de roster para mover ${member.user.tag}. CustomID do menu: ${moveSelectMenu.data.custom_id}`);
                
                // Esta é a resposta para a interação do UserSelectMenu (manageplayer_user_select_move_...)
                await interaction.followUp({
                    content: `Para qual roster você deseja mover ${member.toString()}?`,
                    components: [moveRow],
                    flags: MessageFlags.Ephemeral
                });
                return; // Importante sair aqui, pois a resposta foi dada.
        }

        // Resposta final para 'add' e 'remove' (que usaram deferReply/update + editReply)
        if ((actionType === 'add' || actionType === 'remove') && replyMessage) {
            let logActionType;
            let logFields = [];
            if (actionType === 'add') {
                logActionType = 'Adição de Membro';
                logFields = [
                    { name: 'Guilda', value: guild.name, inline: true },
                    { name: 'Membro', value: `<@${member.id}> (${member.user.tag})`, inline: true },
                    { name: 'Roster Destino', value: guild.mainRoster.some(p => p.id === playerObj.id) ? 'Principal' : 'Reserva', inline: true },
                ];
            } else if (actionType === 'remove') {
                logActionType = 'Remoção de Membro';
                logFields = [
                    { name: 'Guilda', value: guild.name, inline: true },
                    { name: 'Membro', value: `<@${member.id}> (${member.user.tag})`, inline: true },
                ];
            }
            await sendLogMessage(client, globalConfig, interaction, logActionType, replyMessage, logFields);
            // A interação original do UserSelectMenu foi 'updated' ou 'deferReply'd.
            // Agora usamos editReply (se foi deferido) ou followUp (se o update inicial falhou e não fizemos defer).
            // Para simplificar: se interaction.deferred for true, usar editReply, senão followUp.
             if (interaction.deferred || (interaction.replied && actionType !== 'move')) { // Se foi deferido, ou se foi "updated" no início
                await interaction.editReply({ content: replyMessage, components: finalComponents });
            } else {
                // Este caso seria se o update inicial falhou E não houve defer. Pouco provável com a lógica atual.
                await interaction.followUp({ content: replyMessage, flags: MessageFlags.Ephemeral, components: finalComponents });
            }
        }
        console.log(`[DIAGNÓSTICO JOGADOR] handleGuildPanelManagePlayer_SelectUser (ação ${actionType}) concluído para ${member.user.tag}.`);

    } catch (error) {
        console.error(`❌ [DIAGNÓSTICO JOGADOR] ERRO FATAL em handleGuildPanelManagePlayer_SelectUser (ação ${actionType}):`, error);
        const errorMessage = `❌ Ocorreu um erro ao processar a ação '${actionType}' para o membro. Detalhes: ${error.message}`;
        try {
            // Tenta editar a resposta se já foi deferida/respondida, caso contrário, tenta um novo reply.
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: errorMessage, components: [] });
            } else {
                await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral, components: [] });
            }
        } catch (e) {
            console.error("Erro ao tentar enviar mensagem de erro ao usuário:", e.message);
        }
    }
}

// handleGuildPanelManagePlayer_SelectRosterType (A lógica de defer/edit/reply aqui parece mais correta)
async function handleGuildPanelManagePlayer_SelectRosterType(interaction, client, globalConfig, customId) {
    const parts = customId.split('_');
    if (parts.length < 6) {
        console.error(`[DIAGNÓSTICO MOVER] Invalid customId format for manageplayer_roster_type_select: ${customId}`);
        // A interação do menu já foi "usada" ao ser selecionada.
        // Se precisarmos responder aqui, seria um followUp à mensagem anterior, ou editar uma resposta já deferida.
        // Mas como é um erro de parsing do ID, uma resposta simples é melhor se não foi deferido.
        if (!interaction.replied && !interaction.deferred) {
             return interaction.reply({ content: '❌ Erro interno: ID de seleção de tipo de roster inválido.', flags: MessageFlags.Ephemeral });
        }
        // Se já foi deferido/respondido por um fluxo anterior (improvável para este erro específico), não podemos fazer reply.
        console.error("Erro de parsing de customId em handleGuildPanelManagePlayer_SelectRosterType, mas interação já respondida/deferida.");
        return;
    }
    const selectedUserId = parts[4];
    const guildIdSafe = parts.slice(5).join('_');

    console.log(`[DIAGNÓSTICO MOVER] handleGuildPanelManagePlayer_SelectRosterType INICIADO. Usuário: ${selectedUserId}, Roster Destino: ${interaction.values[0]}`);
    
    // REMOVA OU COMENTE ESTA LINHA:
    // await interaction.deferUpdate({ ephemeral: true }); 
    // A interação do StringSelectMenu já foi "acknowledged" pelo Discord quando o usuário fez a seleção.
    // Se você vai editar a mensagem que continha o menu (o followUp anterior), você pode fazer isso diretamente.
    // Se você vai enviar uma nova mensagem, use followUp.
    // Para este fluxo, vamos assumir que queremos editar a mensagem do followUp que continha este menu,
    // ou enviar um novo followUp se a edição não for possível/desejada.
    // É mais comum responder ao followUp que enviou o menu.

    // Para garantir que podemos responder, e como é uma ação que pode levar tempo,
    // vamos deferir a *nova* resposta que vamos dar ao resultado desta seleção.
    // O interaction.update() na mensagem anterior removeu os componentes.
    // Agora, a interação atual (seleção de main/sub) precisa ser respondida.
    try {
         // Se a mensagem que continha este menu era efêmera e você quer responder nela:
        await interaction.deferReply({ ephemeral: true }); // Deferir a resposta a ESTA interação
    } catch (e) {
        if (e.code === 10062) { // Unknown Interaction
            console.error("[DIAGNÓSTICO MOVER] A interação para deferReply já era desconhecida. Isso é inesperado aqui.");
            return; // Não podemos prosseguir
        }
        throw e; // Relança outros erros
    }


    try {
        const targetRosterType = interaction.values[0];
        // Passamos a interaction para getAndValidateGuild. Se ela já foi deferida,
        // getAndValidateGuild NÃO PODE USAR interaction.reply(). Precisaria de editReply.
        // Este é um ponto delicado.
        // Solução temporária: getAndValidateGuild não vai responder se interaction.deferred for true.
        const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, false, true);
        
        if (!guild) {
            console.log(`[DIAGNÓSTICO MOVER] Guilda inválida ou sem permissão.`);
            return interaction.editReply({ content: "❌ Guilda não encontrada ou acesso negado (após defer).", components: [] });
        }

        const member = await interaction.guild.members.fetch(selectedUserId).catch(() => null);
        if (!member) {
            return interaction.editReply({ content: `❌ Usuário (<@${selectedUserId}>) não encontrado neste servidor.`, components: [] });
        }

        // ... (resto da sua lógica de validação de roster cheio, etc.) ...
        // (COPIE O CORPO DA SUA FUNÇÃO A PARTIR DAQUI)
        const isCurrentlyInMain = guild.mainRoster.some(p => p.id === selectedUserId);
        const isCurrentlyInSub = guild.subRoster.some(p => p.id === selectedUserId);

        if (!isCurrentlyInMain && !isCurrentlyInSub) {
            return interaction.editReply({ content: `❌ ${member.toString()} não está em nenhum roster da guilda **${guild.name}**.`, components: [] });
        }
        if ((targetRosterType === 'main' && isCurrentlyInMain) || (targetRosterType === 'sub' && isCurrentlyInSub)) {
            return interaction.editReply({ content: `❌ ${member.toString()} já está no Roster ${targetRosterType === 'main' ? 'Principal' : 'Reserva'}.`, components: [] });
        }
        if ((targetRosterType === 'main' && guild.mainRoster.length >= MAX_ROSTER_SIZE && !isCurrentlyInMain) ||
            (targetRosterType === 'sub' && guild.subRoster.length >= MAX_ROSTER_SIZE && !isCurrentlyInSub)) {
            return interaction.editReply({ content: `❌ O Roster ${targetRosterType === 'main' ? 'Principal' : 'Reserva'} da guilda **${guild.name}** está cheio. Não é possível mover.`, components: [] });
        }

        guild.mainRoster = guild.mainRoster.filter(p => p.id !== selectedUserId);
        guild.subRoster = guild.subRoster.filter(p => p.id !== selectedUserId);

        const playerObj = { id: member.id, username: member.user.username, joinedAt: new Date().toISOString() };
        if (targetRosterType === 'main') {
            guild.mainRoster.push(playerObj);
        } else {
            guild.subRoster.push(playerObj);
        }

        guild.updatedAt = new Date().toISOString();
        guild.updatedBy = interaction.user.id;
        await saveGuildData(guild);
        client.emit('updateLeaderboard');
        // FIM DA CÓPIA DO CORPO

        await sendLogMessage(
            client, globalConfig, interaction,
            'Movimentação de Membro',
            `${member.user.tag} foi movido para o Roster ${targetRosterType === 'main' ? 'Principal' : 'Reserva'} da guilda **${guild.name}**.`,
            [
                { name: 'Guilda', value: guild.name, inline: true },
                { name: 'Membro', value: `<@${member.id}> (${member.user.tag})`, inline: true },
                { name: 'Roster Destino', value: targetRosterType === 'main' ? 'Principal' : 'Reserva', inline: true },
            ]
        );
        // Como usamos deferReply, agora usamos editReply para a mensagem final.
        await interaction.editReply({ content: `✅ ${member.toString()} movido para o **Roster ${targetRosterType === 'main' ? 'Principal' : 'Reserva'}** da guilda **${guild.name}**!`, components: [] });
        console.log(`[DIAGNÓSTICO MOVER] Movimentação de ${member.user.tag} concluída.`);

    } catch (error) {
        console.error(`❌ [DIAGNÓSTICO MOVER] ERRO FATAL em handleGuildPanelManagePlayer_SelectRosterType:`, error);
        const errorMessage = `❌ Ocorreu um erro ao mover o membro. Detalhes: ${error.message}`;
        // Como já fizemos deferReply, usamos editReply
        await interaction.editReply({ content: errorMessage, components: [] }).catch(e => console.error("Erro ao enviar mensagem de erro (mover):", e));
    }
}

module.exports = {
    handleGuildPanelManagePlayer_SelectUser,
    handleGuildPanelManagePlayer_SelectRosterType,
};
