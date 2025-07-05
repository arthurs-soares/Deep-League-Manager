// handlers/panel/rosterDropdownFlow.js
const { StringSelectMenuBuilder, UserSelectMenuBuilder, ActionRowBuilder, MessageFlags } = require('discord.js');
const { loadGuildByName } = require('../../db/guildDb');
const { getAndValidateGuild } = require('../../utils/validation');
const { handleGuildPanelBulkaddmember } = require('./rosterBulkActions');
const { handleGuildPanelTrocarJogador_Initial } = require('./rosterSlotEditActions');
const { handleGuildPanelSwapMember_Initial } = require('./rosterSwapActions');


// --- NOVO FLUXO: GERENCIAR ROSTERS VIA DROPDOWN ---
async function handleGuildPanelManageRosters_Initial(interaction, guildIdSafe, globalConfig, client) {
    console.log(`[DIAGNÓSTICO DROPDOWN] handleGuildPanelManageRosters_Initial INICIADO para guilda: ${guildIdSafe}`);
    try {
        const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, false, true);
        if (!guild) {
            console.log(`[DIAGNÓSTICO DROPDOWN] handleGuildPanelManageRosters_Initial: Guilda inválida ou sem permissão.`);
            return; 
        }

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
                },
                {
                    label: 'Trocar Membros (Principal <-> Reserva)',
                    description: 'Troca um membro do roster principal por um do reserva.',
                    value: 'swap_members',
                    emoji: '🔄',
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
    // As primeiras linhas seriam:
    console.log(`[DIAGNÓSTICO DROPDOWN] Ação selecionada: ${interaction.values[0]}`);
    const action = interaction.values[0];

    try {
        // Adiar a atualização da interação imediatamente para evitar o erro "InteractionNotReplied"
        console.log(`[DIAGNÓSTICO DROPDOWN] Tentando adiar a atualização da interação...`);
        try {
            await interaction.deferUpdate();
            console.log(`[DIAGNÓSTICO DROPDOWN] Interação adiada com sucesso.`);
        } catch (deferError) {
            console.error(`[DIAGNÓSTICO DROPDOWN] Erro ao adiar interação:`, deferError);
            // Se falhar em adiar, tentamos responder diretamente
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: "Processando sua solicitação...", ephemeral: true });
                console.log(`[DIAGNÓSTICO DROPDOWN] Respondido à interação como fallback.`);
            }
        }
        
        // Ação de modal é tratada sem defer
        if (action === 'bulk_add') {
            const bulkAddResult = await handleGuildPanelBulkaddmember(interaction, guildIdSafe, globalConfig, client);
            if (bulkAddResult && bulkAddResult.type === 'modal') {
                return await interaction.showModal(bulkAddResult.data);
            }
        }
        
        // Anteriormente acreditávamos que a interação do menu de seleção era um "update" implícito,
        // mas na verdade precisamos chamar deferUpdate() explicitamente antes de usar editReply.

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

        if (action === 'swap_members') {
            return await handleGuildPanelSwapMember_Initial(interaction, guildIdSafe, client, globalConfig);
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

        console.log(`[DIAGNÓSTICO DROPDOWN] Verificando estado da interação antes de editReply: deferred=${interaction.deferred}, replied=${interaction.replied}`);
        if (responseOptions.components.length > 0) {
            if (interaction.deferred) {
                console.log(`[DIAGNÓSTICO DROPDOWN] Chamando editReply para atualizar a interação...`);
                await interaction.editReply(responseOptions);
                console.log(`[DIAGNÓSTICO DROPDOWN] editReply executado com sucesso.`);
            } else if (interaction.replied) {
                console.log(`[DIAGNÓSTICO DROPDOWN] Chamando followUp pois a interação já foi respondida...`);
                await interaction.followUp({ ...responseOptions, ephemeral: true });
                console.log(`[DIAGNÓSTICO DROPDOWN] followUp executado com sucesso.`);
            } else {
                console.log(`[DIAGNÓSTICO DROPDOWN] Chamando reply como último recurso...`);
                await interaction.reply({ ...responseOptions, ephemeral: true });
                console.log(`[DIAGNÓSTICO DROPDOWN] reply executado com sucesso.`);
            }
        }

    } catch (error) {
        console.error(`❌ [DIAGNÓSTICO DROPDOWN] ERRO FATAL em handleGuildPanelManageRosters_SelectAction:`, error);
        try {
            // Verificar o estado da interação e responder apropriadamente
            console.log(`[DIAGNÓSTICO DROPDOWN] Estado da interação no tratamento de erro: deferred=${interaction.deferred}, replied=${interaction.replied}`);
            if (!interaction.replied) {
                if (interaction.deferred) {
                    console.log(`[DIAGNÓSTICO DROPDOWN] Tentando editReply no tratamento de erro...`);
                    await interaction.editReply({ content: '❌ Ocorreu um erro ao processar sua seleção.' }).catch((e) => {
                        console.error(`[DIAGNÓSTICO DROPDOWN] Falha no editReply do erro:`, e);
                    });
                } else {
                    console.log(`[DIAGNÓSTICO DROPDOWN] Tentando reply no tratamento de erro...`);
                    await interaction.reply({ content: '❌ Ocorreu um erro ao processar sua seleção.', ephemeral: true }).catch((e) => {
                        console.error(`[DIAGNÓSTICO DROPDOWN] Falha no reply do erro:`, e);
                    });
                }
            } else {
                console.log(`[DIAGNÓSTICO DROPDOWN] Tentando followUp no tratamento de erro...`);
                await interaction.followUp({ content: '❌ Ocorreu um erro ao processar sua seleção.', ephemeral: true }).catch((e) => {
                    console.error(`[DIAGNÓSTICO DROPDOWN] Falha no followUp do erro:`, e);
                });
            }
        } catch (followupError) {
            console.error('Erro ao tentar enviar mensagem de erro:', followupError);
        }
    }
}

module.exports = {
    handleGuildPanelManageRosters_Initial,
    handleGuildPanelManageRosters_SelectAction,
    getAndValidateGuild
};
