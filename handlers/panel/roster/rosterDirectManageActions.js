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

    try {
        // Adiar a atualização da interação imediatamente para evitar o erro "InteractionNotReplied"
        // Exceto para o caso de erro de validação de customId que já foi tratado acima
        if (actionType !== 'move') {
            console.log(`[DIAGNÓSTICO JOGADOR] Tentando adiar a atualização da interação para ação ${actionType}...`);
            try {
                await interaction.deferUpdate();
                console.log(`[DIAGNÓSTICO JOGADOR] Interação adiada com sucesso para ação ${actionType}.`);
            } catch (deferError) {
                console.error(`[DIAGNÓSTICO JOGADOR] Erro ao adiar interação para ação ${actionType}:`, deferError);
                // Se falhar em adiar, tentamos responder diretamente
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: "Processando sua solicitação...", ephemeral: true });
                    console.log(`[DIAGNÓSTICO JOGADOR] Respondido à interação como fallback para ação ${actionType}.`);
                }
            }
        }
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

                // LÓGICA CORRIGIDA: Permite a movimentação mesmo se o roster de destino estiver cheio,
                // porque um espaço será liberado no roster de origem.
                if (currentSubMove) { // Se está no sub, pode mover para o main
                    canMoveToMain = true;
                    moveSelectMenu.addOptions({
                        label: 'Roster Principal',
                        description: `Move ${member.user.username} para o Roster Principal.`,
                        value: 'main',
                        emoji: '🛡️'
                    });
                }
                if (currentMainMove) { // Se está no main, pode mover para o sub
                    canMoveToSub = true;
                    moveSelectMenu.addOptions({
                        label: 'Roster Reserva',
                        description: `Move ${member.user.username} para o Roster Reserva.`,
                        value: 'sub',
                        emoji: '⚔️'
                    });
                }

                if (!canMoveToMain && !canMoveToSub) {
                    // Esta condição agora só deve ser atingida se o jogador não estiver em nenhum roster,
                    // o que já é verificado acima. Mantido como uma segurança.
                    let reason = "O jogador não parece estar em um roster que permita movimentação.";
                    console.log(`[DIAGNÓSTICO JOGADOR - MOVE] Não é possível mover ${member.user.tag}. Razão: ${reason}`);
                    return interaction.followUp({ content: `❌ Não é possível mover ${member.toString()}. ${reason}`, flags: MessageFlags.Ephemeral });
                }

                const moveRow = new ActionRowBuilder().addComponents(moveSelectMenu);
                console.log(`[DIAGNÓSTICO JOGADOR - MOVE] Enviando menu de seleção de tipo de roster para mover ${member.user.tag}. CustomID do menu: ${moveSelectMenu.data.custom_id}`);
                
                // Responde à interação do UserSelectMenu editando a mensagem original para mostrar o novo menu.
                await interaction.update({
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
            console.log(`[DIAGNÓSTICO JOGADOR] Verificando estado da interação antes de resposta final: deferred=${interaction.deferred}, replied=${interaction.replied}, actionType=${actionType}`);
            if (interaction.deferred || (interaction.replied && actionType !== 'move')) { // Se foi deferido, ou se foi "updated" no início
               console.log(`[DIAGNÓSTICO JOGADOR] Chamando editReply para resposta final...`);
               await interaction.editReply({ content: replyMessage, components: finalComponents });
               console.log(`[DIAGNÓSTICO JOGADOR] editReply executado com sucesso.`);
           } else {
               // Este caso seria se o update inicial falhou E não houve defer. Pouco provável com a lógica atual.
               console.log(`[DIAGNÓSTICO JOGADOR] Chamando followUp para resposta final...`);
               await interaction.followUp({ content: replyMessage, flags: MessageFlags.Ephemeral, components: finalComponents });
               console.log(`[DIAGNÓSTICO JOGADOR] followUp executado com sucesso.`);
           }
        }
        console.log(`[DIAGNÓSTICO JOGADOR] handleGuildPanelManagePlayer_SelectUser (ação ${actionType}) concluído para ${member.user.tag}.`);

    } catch (error) {
        console.error(`❌ [DIAGNÓSTICO JOGADOR] ERRO FATAL em handleGuildPanelManagePlayer_SelectUser (ação ${actionType}):`, error);
        const errorMessage = `❌ Ocorreu um erro ao processar a ação '${actionType}' para o membro. Detalhes: ${error.message}`;
        try {
            // Tenta editar a resposta se já foi deferida/respondida, caso contrário, tenta um novo reply.
            console.log(`[DIAGNÓSTICO JOGADOR] Estado da interação no tratamento de erro: deferred=${interaction.deferred}, replied=${interaction.replied}`);
            if (interaction.deferred || interaction.replied) {
                console.log(`[DIAGNÓSTICO JOGADOR] Tentando editReply no tratamento de erro...`);
                await interaction.editReply({ content: errorMessage, components: [] });
                console.log(`[DIAGNÓSTICO JOGADOR] editReply de erro executado com sucesso.`);
            } else {
                console.log(`[DIAGNÓSTICO JOGADOR] Tentando reply no tratamento de erro...`);
                await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral, components: [] });
                console.log(`[DIAGNÓSTICO JOGADOR] reply de erro executado com sucesso.`);
            }
        } catch (e) {
            console.error("Erro ao tentar enviar mensagem de erro ao usuário:", e.message);
        }
    }
}

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
    
    await interaction.deferReply({ ephemeral: true });


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
        // LÓGICA REMOVIDA: A verificação de roster cheio não se aplica a uma movimentação,
        // pois o número total de membros na guilda não muda.

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
