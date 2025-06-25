// interactionHandler.js
// Módulo central para o tratamento e roteamento de todas as interações do Discord.
const { InteractionType, MessageFlags } = require('discord.js');
const { handleError } = require('../../utils/errorHandler'); // Importa o handler de erros (caminho relativo à raiz)

/**
 * Capitaliza a primeira letra de uma string.
 * @param {string} str - A string a ser capitalizada.
 * @returns {string} A string com a primeira letra maiúscula.
 */
function capitalize(str) {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// --- Mapeamento de Handlers por Prefixo de CustomId ---
// Isso torna o roteamento mais explícito e fácil de gerenciar.
// Cada entrada mapeia um prefixo de customId para a função handler correspondente.
// A função handler será chamada com (interaction, client, globalConfig, ...argsExtraidosDoCustomId)

const buttonHandlers = new Map([
    // War Ticket Buttons
    ['pull_war_ticket', 'handleWarTicketButton'],
    ['war_accept', 'handleWarAcceptButton'],
    ['war_request_dodge', 'handleWarRequestDodgeButton'],
    // War Round Buttons (handled by a single function based on prefix)
    ['war_round_win_', 'handleWarRoundButton'], // Final handler: handleWarRoundButton
    // Guild Edit Buttons (handled by a single function based on prefix, which then calls specific modal handlers)
    ['guildedit_button_', 'handleGuildEditButton'], // Intermediate handler: handleGuildEditButton
    // Guild Panel Buttons - Specific ones first
    ['guildpanel_manage_rosters_dropdown_', 'handleGuildPanelManageRosters_Initial'], // Final handler: handleGuildPanelManageRosters_Initial
    // Guild Panel Buttons (handled by a single function based on prefix, which then calls specific panel handlers)
    ['guildpanel_', 'handleGuildPanelButton'], // Roteia para uma função intermediária
]);

const selectMenuHandlers = new Map([
    // Roster Management Select Menus
    ['manage_rosters_action_select_', 'handleGuildPanelManageRosters_SelectAction'],
    ['roster_select_type_', 'handleGuildPanelTrocarJogador_RosterSelect'], // Requires guild validation
    ['manageplayer_user_select_', 'handleGuildPanelManagePlayer_SelectUser'], // Requires guild validation
    ['manageplayer_roster_type_select_', 'handleGuildPanelManagePlayer_SelectRosterType'], // Requires guild validation
    // Add other select menu handlers here...
]);

const modalSubmitHandlers = new Map([
    // War Ticket Modals
    ['modal_war_ticket_submit', 'handleWarTicketModalSubmit'],
    ['modal_war_dodge_select_guild_', 'handleWarDodgeSelectGuildSubmit'],
    // Guild Edit Modals (handled by a single function based on prefix, which then calls specific submit handlers)
    ['guildedit_modal_', 'handleGuildEditModalSubmit'], // Roteia para uma função intermediária
    // Roster Management Modals
    ['roster_edit_modal_', 'handleGuildPanelTrocarJogador_RosterSubmit'], // Requires guild validation
    ['modal_guildpanel_bulkaddmember_', 'handleGuildPanelBulkaddmemberSubmit'], // Requires guild validation
    // Other Guild Panel Modals (handled by a single function based on prefix, which then calls specific submit handlers)
    ['modal_guildpanel_', 'handleGuildPanelModalSubmit'], // Roteia para uma função intermediária
]);

// --- Funções de Roteamento Específicas por Tipo de Interação ---

async function routeButtonInteraction(interaction, client, globalConfig) {
    const customId = interaction.customId;

    for (const [prefix, handlerName] of buttonHandlers.entries()) {
        if (customId.startsWith(prefix)) {
            const handler = client.guildPanelHandlers[handlerName];
            if (typeof handler === 'function') {
                console.log(`[DEBUG InteractionHandler] Routing button "${customId}" to ${handlerName}`);
                // Passa a interação, client, globalConfig e o customId completo para o handler
                // O handler é responsável por extrair os args específicos do customId se necessário
                await handler(interaction, client, globalConfig, customId);
                return true; // Interação tratada
            } else {
                console.error(`[ERROR InteractionHandler] Handler "${handlerName}" not found for button "${customId}".`);
                // Fallback: Tenta responder se não foi deferido/respondido
                 if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: `❌ Erro interno: Handler para este botão não encontrado (${handlerName}).`, flags: MessageFlags.Ephemeral });
                }
                return true; // Considera tratada para evitar o aviso final
            }
        }
    }

    // Se nenhum prefixo correspondeu
    console.warn(`⚠️ CustomId de botão não tratado: ${customId}`);
    // Não responde aqui, pois o handler pode ter deferido/respondido e falhado depois.
    // O try/catch geral ou handlers específicos devem lidar com falhas após defer/reply.
    return false; // Interação não tratada por nenhum handler mapeado
}

async function routeSelectMenuInteraction(interaction, client, globalConfig) {
    const customId = interaction.customId;
    console.log(`[DEBUG InteractionHandler] Routing select menu "${customId}"`);

    for (const [prefix, handlerName] of selectMenuHandlers.entries()) {
        if (customId.startsWith(prefix)) {
            const handler = client.guildPanelHandlers[handlerName];
            if (typeof handler === 'function') {
                 console.log(`[DEBUG InteractionHandler] Routing select menu "${customId}" to ${handlerName}`);
                // Passa a interação, client, globalConfig e o customId completo
                await handler(interaction, client, globalConfig, customId);
                return true; // Interação tratada
            } else {
                console.error(`[ERROR InteractionHandler] Handler "${handlerName}" not found for select menu "${customId}".`);
                 if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: `❌ Erro interno: Handler para este menu não encontrado (${handlerName}).`, flags: MessageFlags.Ephemeral });
                }
                return true; // Considera tratada
            }
        }
    }

    console.warn(`⚠️ CustomId de menu de seleção não tratado: ${customId}`);
     if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: `❌ Ação de menu não reconhecida: ${customId}. (IH_SM_UT)`, flags: MessageFlags.Ephemeral });
    }
    return false;
}

async function routeModalSubmitInteraction(interaction, client, globalConfig) {
    const customId = interaction.customId;
    console.log(`[DEBUG InteractionHandler] Routing modal submit "${customId}"`);

    for (const [prefix, handlerName] of modalSubmitHandlers.entries()) {
        if (customId.startsWith(prefix)) {
            const handler = client.guildPanelHandlers[handlerName];
            if (typeof handler === 'function') {
                 console.log(`[DEBUG InteractionHandler] Routing modal submit "${customId}" to ${handlerName}`);
                // Passa a interação, client, globalConfig e o customId completo
                await handler(interaction, client, globalConfig, customId);
                return true; // Interação tratada
            } else {
                console.error(`[ERROR InteractionHandler] Handler "${handlerName}" not found for modal "${customId}".`);
                 if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: `❌ Erro interno: Handler para este formulário não encontrado (${handlerName}).`, flags: MessageFlags.Ephemeral });
                }
                return true; // Considera tratada
            }
        }
    }

    console.warn(`⚠️ CustomId de modal não tratado: ${customId}`);
     if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: `❌ Formulário não reconhecido: ${customId}. (IH_MODAL_UT)`, flags: MessageFlags.Ephemeral });
    }
    return false;
}

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
        // Comandos Slash já têm um sistema de roteamento em client.commands
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) {
                console.warn(`Comando ${interaction.commandName} não encontrado.`);
                await interaction.reply({ content: `❌ Comando "${interaction.commandName}" não encontrado.`, flags: MessageFlags.Ephemeral });
                return;
            }
            // Executa o comando, passando interaction, client e globalConfig
            await command.execute(interaction, client, globalConfig);
        }
        // --- Botões ---
        else if (interaction.isButton()) {
            // Roteia interações de botão usando o novo sistema de mapeamento
            await routeButtonInteraction(interaction, client, globalConfig);
        }
        // --- Menus de Seleção (StringSelectMenu e UserSelectMenu) ---
        else if (interaction.isStringSelectMenu() || interaction.isUserSelectMenu()) {
             // Roteia interações de menu de seleção usando o novo sistema de mapeamento
            await routeSelectMenuInteraction(interaction, client, globalConfig);
        }
        // --- Modais (Envio de Formulários) ---
        else if (interaction.type === InteractionType.ModalSubmit) {
             // Roteia interações de submissão de modal usando o novo sistema de mapeamento
            await routeModalSubmitInteraction(interaction, client, globalConfig);
        }
    } catch (error) {
        // Envia o erro para o handler de erros centralizado.
        await handleError(error, interaction.customId || interaction.commandName || "interação desconhecida", interaction);
    }
}

// --- Intermediate Handler Functions ---
// These functions are called by the routing logic above.
// They parse the customId further and call the final, specific handlers.

async function handleGuildEditButton(interaction, client, globalConfig, customId) {
    // customId format: guildedit_button_FIELD_MONGOID
    const parts = customId.split('_');
    if (parts.length < 4) {
        console.error(`[ERROR handleGuildEditButton] Invalid customId format: ${customId}`);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Erro interno: Formato de ID de botão de edição inválido.', flags: MessageFlags.Ephemeral });
        }
        return;
    }
    const fieldToEdit = parts[2];
    const guildMongoId = parts.slice(3).join('_'); // Handles cases where guildMongoId might have underscores (though unlikely for ObjectId)
    const finalHandlerName = `handleGuildShowEdit${capitalize(fieldToEdit)}Modal`;
    const finalHandler = client.guildPanelHandlers[finalHandlerName];

    if (typeof finalHandler === 'function') {
        await finalHandler(interaction, guildMongoId, globalConfig, client);
    } else {
        console.error(`[ERROR handleGuildEditButton] Final handler "${finalHandlerName}" not found for customId "${customId}".`);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: `❌ Erro interno: Handler final para edição de "${fieldToEdit}" não configurado.`, flags: MessageFlags.Ephemeral });
        }
    }
}

async function handleGuildPanelButton(interaction, client, globalConfig, customId) {
    // customId format: guildpanel_ACTION_GUILDIDSAFE_OR_MONGOID
    // Examples: guildpanel_edit_my-guild-name, guildpanel_setcoleader_another-guild
    const parts = customId.split('_');
     if (parts.length < 3) {
        console.error(`[ERROR handleGuildPanelButton] Invalid customId format: ${customId}`);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Erro interno: Formato de ID de botão de painel inválido.', flags: MessageFlags.Ephemeral });
        }
        return;
    }
    const action = parts[1];
    const guildIdSafeOrMongoId = parts.slice(2).join('_');
    const finalHandlerName = `handleGuildPanel${capitalize(action)}`;
    const finalHandler = client.guildPanelHandlers[finalHandlerName];

    if (typeof finalHandler === 'function') {
        // The final handler (e.g., handleGuildPanelEdit, handleGuildPanelSetcoleader)
        // expects (interaction, guildIdSafeOrMongoId, globalConfig, client)
        await finalHandler(interaction, guildIdSafeOrMongoId, globalConfig, client);
    } else {
        console.error(`[ERROR handleGuildPanelButton] Final handler "${finalHandlerName}" not found for customId "${customId}".`);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: `❌ Erro interno: Handler final para ação de painel "${action}" não configurado.`, flags: MessageFlags.Ephemeral });
        }
    }
}

async function handleGuildEditModalSubmit(interaction, client, globalConfig, customId) {
    // customId format: guildedit_modal_FIELD_MONGOID
    const parts = customId.split('_');
    const fieldToEdit = parts[2];
    const guildMongoId = parts.slice(3).join('_');
    const finalHandlerName = `handleGuildEdit${capitalize(fieldToEdit)}Submit`;
    const finalHandler = client.guildPanelHandlers[finalHandlerName];

    if (typeof finalHandler === 'function') {
        await finalHandler(interaction, guildMongoId, globalConfig, client);
    } else {
        console.error(`[ERROR handleGuildEditModalSubmit] Final handler "${finalHandlerName}" not found for modal submit "${customId}".`);
        // Modal submissions are replied to by the final handler. If it's not found, the interaction will likely time out.
        // A generic error reply here might conflict if the interaction was already replied to by Discord's timeout.
    }
}

async function handleGuildPanelModalSubmit(interaction, client, globalConfig, customId) {
    // customId format: modal_guildpanel_ACTION_GUILDIDSAFE
    const parts = customId.split('_');
    const action = parts[2];
    const guildIdSafe = parts.slice(3).join('_');
    const finalHandlerName = `handleGuildPanel${capitalize(action)}Submit`;
    const finalHandler = client.guildPanelHandlers[finalHandlerName];

    if (typeof finalHandler === 'function') {
        await finalHandler(interaction, guildIdSafe, globalConfig, client);
    } else {
        console.error(`[ERROR handleGuildPanelModalSubmit] Final handler "${finalHandlerName}" not found for modal submit "${customId}".`);
    }
}

module.exports = {
    handleInteraction,
    // Exporta as funções de roteamento intermediárias para serem usadas pelos handlers específicos
    // (Embora o ideal seja que os handlers específicos sejam chamados diretamente pelo interactionHandler)
    // Se a lógica de extração de args for complexa, pode ser útil manter essas funções intermediárias
    // Por enquanto, vamos assumir que os handlers mapeados sabem como extrair seus args do customId completo.
    // Se necessário, podemos adicionar funções como handleGuildEditButton(interaction, client, globalConfig, customId)
    // que extrai fieldToEdit e guildMongoId e chama handleGuildShowEdit${capitalize(fieldToEdit)}Modal.
    // Para simplificar AGORA, vamos fazer o mapeamento direto para as funções finais onde possível.
    // A estrutura de mapeamento acima já faz isso.

    // Para que o mapeamento direto funcione, os handlers mapeados precisam ter a assinatura:
    // async function handlerName(interaction, client, globalConfig, customId) { ... }
    // E extrair seus próprios argumentos (guildId, field, etc.) do customId.
    // Isso simplifica o interactionHandler, mas move a lógica de parsing para cada handler.
    // É um trade-off. A versão com funções intermediárias (comentada acima) centraliza o parsing.
    // Vamos seguir com o mapeamento direto por enquanto, pois é mais limpo no interactionHandler.
    // Isso significa que handleWarTicketButton, handleGuildShowEditNameModal, handleGuildPanelManageRosters_Initial, etc.
    // precisarão ser atualizados para aceitar (interaction, client, globalConfig, customId)
    // e fazer o split(customId, '_') internamente.

    // Exportando os handlers intermediários que foram definidos acima.
    handleGuildEditButton,
    handleGuildPanelButton,
    handleGuildEditModalSubmit,
    handleGuildPanelModalSubmit,
};