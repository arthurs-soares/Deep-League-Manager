// handlers/interactionHandler.js
// Módulo central para o tratamento e roteamento de todas as interações do Discord.

const { InteractionType, MessageComponentInteraction } = require('discord.js'); 
const { handleError } = require('../utils/errorHandler'); // Importa o handler de erros (caminho relativo à raiz)

/**
 * Manipula todas as interações do Discord (comandos slash, botões, menus de seleção, modais).
 * Este é o ponto central para rotear as interações para os handlers corretos na lógica de negócio.
 * @param {Interaction} interaction - O objeto de interação do Discord.
 * @param {Client} client - A instância do bot Discord.js.
 * @param {Object} globalConfig - Objeto de configuração global do bot.
 */
async function handleInteraction(interaction, client, globalConfig) {
    try {
        // --- Comandos Slash ---
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) {
                console.warn(`Comando ${interaction.commandName} não encontrado.`);
                return;
            }
            await command.execute(interaction, client, globalConfig); 
        }
        // --- Botões ---
        else if (interaction.isButton()) {
            // Roteamento baseado no Custom ID do botão. A ordem é importante para IDs mais específicos.

            // 1. Botão de puxar war (inicial)
            if (interaction.customId === 'pull_war_ticket') {
                if (typeof client.guildPanelHandlers.handleWarTicketButton === 'function') {
                    await client.guildPanelHandlers.handleWarTicketButton(interaction, globalConfig, client);
                } else {
                    console.warn(`⚠️ Handler para pull_war_ticket não encontrado.`);
                    await interaction.reply({ content: '❌ Funcionalidade de ticket de guerra não configurada corretamente.', ephemeral: true });
                }
            } 
            // 2. Botão de Aceitar War
            else if (interaction.customId === 'war_accept') {
                if (typeof client.guildPanelHandlers.handleWarAcceptButton === 'function') {
                    await client.guildPanelHandlers.handleWarAcceptButton(interaction, globalConfig, client);
                } else {
                    console.warn(`⚠️ Handler para aceitar war não encontrado.`);
                    await interaction.reply({ content: '❌ Funcionalidade de aceitação de guerra não configurada corretamente.', ephemeral: true });
                }
            }
            // 3. Botão de Solicitar Dodge (novo botão genérico)
            else if (interaction.customId === 'war_request_dodge') { 
                if (typeof client.guildPanelHandlers.handleWarRequestDodgeButton === 'function') {
                    await client.guildPanelHandlers.handleWarRequestDodgeButton(interaction, globalConfig, client);
                } else {
                    console.warn(`⚠️ Handler para solicitar Dodge de war não encontrado.`);
                    await interaction.reply({ content: '❌ Funcionalidade de Dodge de guerra não configurada corretamente.', ephemeral: true });
                }
            }
            // 4. Botões de pontuação de Round
            else if (interaction.customId.startsWith('war_round_win_')) {
                if (typeof client.guildPanelHandlers.handleWarRoundButton === 'function') {
                    await client.guildPanelHandlers.handleWarRoundButton(interaction, globalConfig, client);
                } else {
                    console.warn(`⚠️ Handler para botões de round de war não encontrado.`);
                    await interaction.reply({ content: '❌ Funcionalidade de round de guerra não configurada corretamente.', ephemeral: true });
                }
            }
            // 5. Botão "Gerenciar Rosters" (ponto de entrada do dropdown principal de rosters)
            else if (interaction.customId.startsWith('guildpanel_manage_rosters_dropdown_')) { 
                const guildIdSafe = interaction.customId.replace('guildpanel_manage_rosters_dropdown_', '');
                if (typeof client.guildPanelHandlers.handleGuildPanelManageRosters_Initial === 'function') { 
                    await client.guildPanelHandlers.handleGuildPanelManageRosters_Initial(interaction, guildIdSafe, globalConfig, client);
                } else {
                    console.warn(`⚠️ Handler para guildpanel_manage_rosters_dropdown não encontrado.`);
                    await interaction.reply({ content: '❌ Funcionalidade de gerenciamento de rosters (dropdown) não configurada corretamente.', ephemeral: true });
                }
            }
            // 6. Outros botões (do painel de guilda, ex: editar perfil, liderança)
            else if (interaction.customId.startsWith('guildpanel_')) { 
                const parts = interaction.customId.split('_');
                const action = parts[1]; 
                const guildIdSafe = parts.slice(2).join('_'); 

                const handlerName = `handleGuildPanel${action.charAt(0).toUpperCase() + action.slice(1)}`;
                if (typeof client.guildPanelHandlers[handlerName] === 'function') {
                    await client.guildPanelHandlers[handlerName](interaction, guildIdSafe, globalConfig, client); 
                } else {
                    console.warn(`⚠️ Handler de botão não encontrado para: ${handlerName} (${interaction.customId})`);
                    await interaction.reply({ content: '❌ Esta ação de botão não possui um handler válido.', ephemeral: true });
                }
            } else {
                console.warn(`⚠️ CustomId de botão inválido ou inesperado: ${interaction.customId}`);
            }
        }
        // --- Menus de Seleção (StringSelectMenu e UserSelectMenu) ---
        else if (interaction.isStringSelectMenu() || interaction.isUserSelectMenu()) { 
            // 1. Menu de seleção de ação para "Gerenciar Rosters" (StringSelectMenu)
            if (interaction.customId.startsWith('manage_rosters_action_select_')) { 
                const guildIdSafe = interaction.customId.replace('manage_rosters_action_select_', '');
                if (typeof client.guildPanelHandlers.handleGuildPanelManageRosters_SelectAction === 'function') { 
                    await client.guildPanelHandlers.handleGuildPanelManageRosters_SelectAction(interaction, guildIdSafe, globalConfig, client);
                } else {
                    console.warn(`⚠️ Handler para manage_rosters_action_select não encontrado.`);
                    await interaction.reply({ content: '❌ Funcionalidade de seleção de ação de rosters não configurada corretamente.', ephemeral: true });
                }
            }
            // 2. Menu de seleção de tipo de roster para "Trocar Jogador" (StringSelectMenu) - agora chamado de "Editar Rosters por Slot"
            else if (interaction.customId.startsWith('roster_select_type_')) { 
                const guildIdSafe = interaction.customId.replace('roster_select_type_', '');
                if (typeof client.guildPanelHandlers.handleGuildPanelTrocarJogador_RosterSelect === 'function') {
                    // Esta função agora RETORNA o modal. O interactionHandler DEVE exibi-lo.
                    const modalResult = await client.guildPanelHandlers.handleGuildPanelTrocarJogador_RosterSelect(interaction, guildIdSafe, globalConfig, client);
                    if (modalResult && modalResult.type === 'modal') {
                        await interaction.showModal(modalResult.data); // <-- CORREÇÃO AQUI! EXIBE O MODAL
                    } else if (modalResult && modalResult.content) { // Para erros retornados como mensagens
                        await interaction.reply(modalResult);
                    } else {
                        console.error(`❌ handleGuildPanelTrocarJogador_RosterSelect retornou algo inesperado:`, modalResult);
                        await interaction.reply({ content: '❌ Erro ao exibir formulário de edição por slot.', ephemeral: true });
                    }
                } else {
                    console.warn(`⚠️ Handler para roster_select_type não encontrado.`);
                    await interaction.reply({ content: '❌ Funcionalidade de seleção de roster (por slot) não configurada corretamente.', ephemeral: true });
                }
            }
            // 3. Menu de seleção de usuário para "Gerenciar Membro Direto" (UserSelectMenu)
            else if (interaction.customId.startsWith('manageplayer_user_select_')) { 
                const parts = interaction.customId.split('_');
                const actionType = parts[3]; 
                const guildIdSafe = parts[parts.length - 1];
                
                if (typeof client.guildPanelHandlers.handleGuildPanelManagePlayer_SelectUser === 'function') {
                    await client.guildPanelHandlers.handleGuildPanelManagePlayer_SelectUser(interaction, guildIdSafe, actionType, globalConfig, client);
                } else {
                    console.warn(`⚠️ Handler para manageplayer_user_select não encontrado.`);
                    await interaction.reply({ content: '❌ Funcionalidade de seleção de usuário de membro não configurada corretamente.', ephemeral: true });
                }
            }
            // 4. Menu de seleção de tipo de roster para "Mover Jogador" (StringSelectMenu)
            else if (interaction.customId.startsWith('manageplayer_roster_type_select_')) { 
                const parts = interaction.customId.split('_');
                const selectedUserId = parts[4]; 
                const guildIdSafe = parts[parts.length - 1]; 

                if (typeof client.guildPanelHandlers.handleGuildPanelManagePlayer_SelectRosterType === 'function') {
                    await client.guildPanelHandlers.handleGuildPanelManagePlayer_SelectRosterType(interaction, guildIdSafe, selectedUserId, globalConfig, client);
                } else {
                    console.warn(`⚠️ Handler para manageplayer_roster_type_select não encontrado.`);
                    await interaction.reply({ content: '❌ Funcionalidade de seleção de tipo de roster para mover não configurada corretamente.', ephemeral: true });
                }
            }
            // Outros menus de seleção, se houver
        }
        // --- Modais (Envio de Formulários) ---
        else if (interaction.type === InteractionType.ModalSubmit) {
            // 1. Modal de submissão de ticket de war
            if (interaction.customId === 'modal_war_ticket_submit') {
                if (typeof client.guildPanelHandlers.handleWarTicketModalSubmit === 'function') {
                    await client.guildPanelHandlers.handleWarTicketModalSubmit(interaction, globalConfig, client);
                } else {
                    console.warn(`⚠️ Handler para modal_war_ticket_submit não encontrado.`);
                    await interaction.reply({ content: '❌ Funcionalidade de ticket de guerra não configurada corretamente.', ephemeral: true });
                }
            } 
            // 2. Modal de seleção de guilda para Dodge
            else if (interaction.customId.startsWith('modal_war_dodge_select_guild_')) { 
                if (typeof client.guildPanelHandlers.handleWarDodgeSelectGuildSubmit === 'function') {
                    await client.guildPanelHandlers.handleWarDodgeSelectGuildSubmit(interaction, globalConfig, client);
                } else {
                    console.warn(`⚠️ Handler para modal_war_dodge_select_guild não encontrado.`);
                    await interaction.reply({ content: '❌ Funcionalidade de Dodge de guerra não configurada corretamente.', ephemeral: true });
                }
            }
            // 3. Modal de edição de roster por slot (agora chamado de "Editar Rosters por Slot")
            else if (interaction.customId.startsWith('roster_edit_modal_')) { 
                const parts = interaction.customId.split('_');
                const guildIdSafe = parts[parts.length - 1]; 
                if (typeof client.guildPanelHandlers.handleGuildPanelTrocarJogador_RosterSubmit === 'function') {
                    await client.guildPanelHandlers.handleGuildPanelTrocarJogador_RosterSubmit(interaction, guildIdSafe, globalConfig, client);
                } else {
                    console.warn(`⚠️ Handler para roster_edit_modal não encontrado.`);
                    await interaction.reply({ content: '❌ Funcionalidade de edição de roster por slot não configurada corretamente.', ephemeral: true });
                }
            }
            // 4. Modais de bulk add (agora dentro do fluxo de "Gerenciar Rosters")
            else if (interaction.customId.startsWith('modal_guildpanel_bulkaddmember_')) {
                const guildIdSafe = interaction.customId.replace('modal_guildpanel_bulkaddmember_', '');
                if (typeof client.guildPanelHandlers.handleGuildPanelBulkaddmemberSubmit === 'function') {
                    await client.guildPanelHandlers.handleGuildPanelBulkaddmemberSubmit(interaction, guildIdSafe, globalConfig, client);
                } else {
                    console.warn(`⚠️ Handler para modal_guildpanel_bulkaddmember não encontrado.`);
                    await interaction.reply({ content: '❌ Funcionalidade de adição em massa não configurada corretamente.', ephemeral: true });
                }
            }
            // 5. Outros modais (geral do painel de guilda, ex: editar perfil, liderança)
            else if (interaction.customId.startsWith('modal_guildpanel_')) { 
                const parts = interaction.customId.split('_');
                const action = parts[2]; 
                const guildIdSafe = parts.slice(3).join('_'); 

                const handlerName = `handleGuildPanel${action.charAt(0).toUpperCase() + action.slice(1)}Submit`;
                if (typeof client.guildPanelHandlers[handlerName] === 'function') {
                    await client.guildPanelHandlers[handlerName](interaction, guildIdSafe, globalConfig, client); 
                } else {
                    console.warn(`⚠️ Handler de submissão de modal não encontrado para: ${handlerName} (${interaction.customId})`);
                    await interaction.reply({ content: '❌ Este formulário não possui um handler válido para submissão.', ephemeral: true });
                }
            } else {
                console.warn(`⚠️ CustomId de modal inválido ou inesperado: ${interaction.customId}`);
            }
        }
    } catch (error) {
        // Envia o erro para o handler de erros centralizado.
        await handleError(error, interaction.customId || interaction.commandName || "interação desconhecida", interaction); 
    }
}

module.exports = {
    handleInteraction,
};