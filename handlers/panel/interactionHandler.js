// interactionHandler.js
// Módulo central para o tratamento e roteamento de todas as interações do Discord.
const { InteractionType, MessageFlags } = require('discord.js');
const { handleError } = require('../../utils/errorHandler'); // Importa o handler de erros (caminho relativo à raiz)
const { getAndValidateGuild } = require('../utils/validation');                         

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
    // Botões de siar da guilda
    ['profile_leave_guild_', 'handleProfileLeaveGuild'], 
    ['confirm_leave_guild_', 'handleConfirmLeaveGuild'], 
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
    console.log(`[DEBUG InteractionHandler] Roteando botão: ${customId}`);

    // ---- Roteamento para botões com IDs que terminam em um parâmetro (ex: ID da guilda) ----
    const prefixMap = {
        'profile_leave_guild_': 'handleProfileLeaveGuild',
        'confirm_leave_guild_': 'handleConfirmLeaveGuild',
        'guildpanel_edit_': 'handleGuildPanelEdit', // Exemplo de outro
        'guildpanel_setcoleader_': 'handleGuildPanelSetcoleader', // Exemplo
        'guildpanel_transferleader_': 'handleGuildPanelTransferleader', // Exemplo
        'guildpanel_manage_rosters_dropdown_': 'handleGuildPanelManageRosters_Initial',
        // Adicione outros prefixos que levam a um handler específico aqui
    };

    for (const prefix in prefixMap) {
        if (customId.startsWith(prefix)) {
            const handlerName = prefixMap[prefix];
            const handler = client.guildPanelHandlers[handlerName];
            
            if (typeof handler === 'function') {
                // Extrai o parâmetro do final do customId (ex: o ID da guilda)
                const parameter = customId.substring(prefix.length);
                console.log(`[DEBUG InteractionHandler] Roteando "${customId}" para ${handlerName} com parâmetro "${parameter}"`);
                // Chama o handler com o parâmetro extraído
                await handler(interaction, parameter, globalConfig, client);
                return; // Interação tratada, sai da função
            } else {
                console.error(`[ERROR InteractionHandler] Handler "${handlerName}" não encontrado para o prefixo "${prefix}".`);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: `❌ Erro interno: Handler para esta ação não configurado (${handlerName}).`, ephemeral: true });
                }
                return;
            }
        }
    }

    // ---- Roteamento para botões com IDs exatos (sem parâmetros) ----
    const exactIdMap = {
        'cancel_leave_guild': async (interaction) => {
            await interaction.update({ content: 'ℹ️ Ação de sair da guilda foi cancelada.', components: [], embeds: [] });
        },
        'pull_war_ticket': client.guildPanelHandlers.handleWarTicketButton,
        'war_accept': client.guildPanelHandlers.handleWarAcceptButton,
        'war_request_dodge': client.guildPanelHandlers.handleWarRequestDodgeButton,
        // Adicione outros botões de ID exato aqui
    };

    if (exactIdMap[customId]) {
        const handler = exactIdMap[customId];
        if (typeof handler === 'function') {
            console.log(`[DEBUG InteractionHandler] Roteando ID exato "${customId}"`);
            await handler(interaction, globalConfig, client); // Passa os parâmetros padrão
            return;
        }
    }
    
    // ---- Roteamento Genérico/Fallback (se necessário, como para os rounds de war) ----
    if (customId.startsWith('war_round_win_')) {
        const handler = client.guildPanelHandlers.handleWarRoundButton;
        if (typeof handler === 'function') {
            console.log(`[DEBUG InteractionHandler] Roteando ID genérico de war round: "${customId}"`);
            // Este handler específico sabe como parsear seu próprio customId complexo
            await handler(interaction, client, globalConfig);
            return;
        }
    }


    // Se nenhum handler foi encontrado
    console.warn(`⚠️ CustomId de botão não tratado: ${customId}`);
    if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: `❌ Ação de botão não reconhecida.`, ephemeral: true });
    }
}

async function routeSelectMenuInteraction(interaction, client, globalConfig) {
    const customId = interaction.customId;
    console.log(`[DEBUG InteractionHandler] Roteando select menu "${customId}"`);

    const prefixMap = {
        'manage_rosters_action_select_': 'handleGuildPanelManageRosters_SelectAction',
        'roster_select_type_': 'handleGuildPanelTrocarJogador_RosterSelect',
        'manageplayer_user_select_': 'handleGuildPanelManagePlayer_SelectUser',
        'manageplayer_roster_type_select_': 'handleGuildPanelManagePlayer_SelectRosterType',
    };

    for (const prefix in prefixMap) {
        if (customId.startsWith(prefix)) {
            const handlerName = prefixMap[prefix];
            const handler = client.guildPanelHandlers[handlerName];
            
            if (typeof handler === 'function') {
                const parameter = customId.substring(prefix.length);
                console.log(`[DEBUG InteractionHandler] Roteando "${customId}" para ${handlerName} com parâmetro "${parameter}"`);
                await handler(interaction, parameter, globalConfig, client);
                return;
            } else {
                console.error(`[ERROR InteractionHandler] Handler "${handlerName}" não encontrado para o prefixo de menu "${prefix}".`);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: `❌ Erro interno: Handler para este menu não encontrado (${handlerName}).`, ephemeral: true });
                }
                return;
            }
        }
    }

    console.warn(`⚠️ CustomId de menu de seleção não tratado: ${customId}`);
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
function capitalize(str) {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
}

async function handleInteraction(interaction, client, globalConfig) {
    try {
        const customId = interaction.customId; // Para botões, menus, modais

        // --- Comandos Slash ---
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) {
                console.warn(`Comando ${interaction.commandName} não encontrado.`);
                await interaction.reply({ content: `❌ Comando "${interaction.commandName}" não encontrado.`, flags: MessageFlags.Ephemeral });
                return;
            }
            await command.execute(interaction, client, globalConfig);
        }
        // --- Botões ---
        else if (interaction.isButton()) {
            console.log(`[DEBUG InteractionHandler] Roteando botão: ${customId}`);

            if (customId.startsWith('guildedit_button_')) {
                await client.guildPanelHandlers.handleGuildEditButton(interaction, client, globalConfig, customId);
            } else if (customId.startsWith('profile_leave_guild_')) {
                const guildMongoId = customId.replace('profile_leave_guild_', '');
                await client.guildPanelHandlers.handleProfileLeaveGuild(interaction, guildMongoId, globalConfig, client);
            } else if (customId.startsWith('confirm_leave_guild_')) {
                const guildMongoId = customId.replace('confirm_leave_guild_', '');
                await client.guildPanelHandlers.handleConfirmLeaveGuild(interaction, guildMongoId, globalConfig, client);
            } else if (customId === 'cancel_leave_guild') {
                 await interaction.update({ content: 'ℹ️ Ação de sair da guilda foi cancelada.', components: [], embeds: [] });
            }
            // War Ticket Buttons
            else if (customId === 'pull_war_ticket') {
                await client.guildPanelHandlers.handleWarTicketButton(interaction, globalConfig, client);
            } else if (customId === 'war_accept') {
                await client.guildPanelHandlers.handleWarAcceptButton(interaction, globalConfig, client);
            } else if (customId === 'war_request_dodge') {
                await client.guildPanelHandlers.handleWarRequestDodgeButton(interaction, globalConfig, client);
            } else if (customId.startsWith('war_round_win_')) {
                await client.guildPanelHandlers.handleWarRoundButton(interaction, client, globalConfig);
            }
            // Guild Panel Buttons
            else if (customId.startsWith('guildpanel_manage_rosters_dropdown_')) {
                const guildIdSafe = customId.replace('guildpanel_manage_rosters_dropdown_', '');
                await client.guildPanelHandlers.handleGuildPanelManageRosters_Initial(interaction, guildIdSafe, globalConfig, client);
            }
            // NOVO: Roteamento para botões do painel de time (mais específicos primeiro)
            else if (customId.startsWith('teampanel_editprofile_')) {
                const teamIdSafe = customId.replace('teampanel_editprofile_', '');
                await client.guildPanelHandlers.handleTeamPanelEditProfile(interaction, teamIdSafe, globalConfig, client);
            } else if (customId.startsWith('teampanel_manageroster_')) {
                const teamIdSafe = customId.replace('teampanel_manageroster_', '');
                await client.guildPanelHandlers.handleTeamPanelManageRoster(interaction, teamIdSafe, globalConfig, client);
            }
            // Roteamento genérico para outros botões 'guildpanel_' (deve vir depois dos mais específicos de guilda e time)
            else if (customId.startsWith('guildpanel_')) {
                await client.guildPanelHandlers.handleGuildPanelButton(interaction, client, globalConfig, customId);
            }
            // Fallback para botões não tratados
            else {
                // Verifica se são botões de paginação do /visualizar (ranking_guilds_prev/next)
                // ou ranking_prev/next (se você simplificou o ID ou tem outra paginação)
                if (customId !== 'ranking_guilds_prev' && customId !== 'ranking_guilds_next' &&
                    customId !== 'ranking_teams_prev' && customId !== 'ranking_teams_next' && // Adicionar estes
                    customId !== 'ranking_prev' && customId !== 'ranking_next') {
                    console.warn(`[InteractionHandler GLOBAL] CustomId de botão não tratado globalmente e não esperado por coletores: ${customId}`);
                    if (!interaction.replied && !interaction.deferred) {
                    }
            } else {
                    console.log(`[InteractionHandler GLOBAL] Botão de paginação ${customId} detectado, esperando que o coletor do comando /visualizar o trate.`);
            }

            }
        } // Fim do else if (interaction.isButton())

        // --- Menus de Seleção (StringSelectMenu e UserSelectMenu) ---
        else if (interaction.isStringSelectMenu() || interaction.isUserSelectMenu()) {
            console.log(`[DEBUG InteractionHandler] Roteando select menu "${customId}"`);

            if (customId.startsWith('manage_rosters_action_select_')) {
                const guildIdSafe = customId.replace('manage_rosters_action_select_', '');
                await client.guildPanelHandlers.handleGuildPanelManageRosters_SelectAction(interaction, guildIdSafe, globalConfig, client);
            } else if (customId.startsWith('roster_select_type_')) {
                const guildIdSafe = customId.replace('roster_select_type_', '');
                await client.guildPanelHandlers.handleGuildPanelTrocarJogador_RosterSelect(interaction, guildIdSafe, globalConfig, client);
            } else if (customId.startsWith('manageplayer_user_select_')) {
                await client.guildPanelHandlers.handleGuildPanelManagePlayer_SelectUser(interaction, client, globalConfig, customId);
            } else if (customId.startsWith('manageplayer_roster_type_select_')) {
                await client.guildPanelHandlers.handleGuildPanelManagePlayer_SelectRosterType(interaction, client, globalConfig, customId);
            } else if (customId === 'help_select_menu') {
                console.log(`[DEBUG InteractionHandler] Menu 'help_select_menu' coletado, será tratado pelo coletor do comando /ajuda.`);
            }
            else {
                console.warn(`⚠️ CustomId de menu de seleção não tratado: ${customId}`);
                 if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: `❌ Ação de menu não reconhecida. (ID: ${customId})`, ephemeral: true });
                }
            }
        } // Fim do else if (interaction.isStringSelectMenu() || interaction.isUserSelectMenu())

        // --- Modais (Envio de Formulários) ---
        else if (interaction.type === InteractionType.ModalSubmit) {
            console.log(`[DEBUG InteractionHandler] Routing modal submit "${customId}"`);

            if (customId.startsWith('guildedit_modal_')) {
                await client.guildPanelHandlers.handleGuildEditModalSubmit(interaction, client, globalConfig, customId);
            } else if (customId === 'modal_war_ticket_submit') {
                await client.guildPanelHandlers.handleWarTicketModalSubmit(interaction, client, globalConfig, customId);
            } else if (customId.startsWith('modal_war_dodge_select_guild_')) {
                await client.guildPanelHandlers.handleWarDodgeSelectGuildSubmit(interaction, client, globalConfig, customId);
            } else if (customId.startsWith('roster_edit_modal_')) {
                const parts = customId.split('_');
                const guildIdSafe = parts.slice(4).join('_');
                await client.guildPanelHandlers.handleGuildPanelTrocarJogador_RosterSubmit(interaction, guildIdSafe, globalConfig, client);
            } else if (customId.startsWith('modal_guildpanel_bulkaddmember_')) {
                const guildIdSafe = customId.replace('modal_guildpanel_bulkaddmember_', '');
                await client.guildPanelHandlers.handleGuildPanelBulkaddmemberSubmit(interaction, guildIdSafe, globalConfig, client);
            }
            // NOVO: Roteamento para modais do painel de time
            else if (customId.startsWith('modal_teampanel_editprofile_')) {
                const teamIdSafe = customId.replace('modal_teampanel_editprofile_', '');
                await client.guildPanelHandlers.handleTeamPanelEditProfileSubmit(interaction, teamIdSafe, globalConfig, client);
            } else if (customId.startsWith('modal_teampanel_manageroster_')) {
                const teamIdSafe = customId.replace('modal_teampanel_manageroster_', '');
                await client.guildPanelHandlers.handleTeamPanelManageRosterSubmit(interaction, teamIdSafe, globalConfig, client);
            }
            // Roteamento genérico para outros modais 'modal_guildpanel_'
            else if (customId.startsWith('modal_guildpanel_')) {
                await client.guildPanelHandlers.handleGuildPanelModalSubmit(interaction, client, globalConfig, customId);
            }
            else {
                 console.warn(`⚠️ CustomId de modal não tratado: ${customId}`);
                 if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: `❌ Envio de formulário não reconhecido. (ID: ${customId})`, ephemeral: true });
                }
            }
        } // Fim do else if (interaction.type === InteractionType.ModalSubmit)

        // --- Autocomplete ---
        else if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);
            if (!command || typeof command.autocomplete !== 'function') {
                console.warn(`Autocomplete não encontrado ou não é uma função para o comando ${interaction.commandName}`);
                await interaction.respond([]).catch(() => {});
                return;
            }
            try {
                await command.autocomplete(interaction, client, globalConfig);
            } catch (error) {
                console.error(`Erro durante autocomplete para ${interaction.commandName}:`, error);
                await interaction.respond([]).catch(() => {});
            }
        } // Fim do else if (interaction.isAutocomplete())

    } catch (error) {
        await handleError(error, interaction.customId || interaction.commandName || "interação desconhecida", interaction);
    }
} // Fim da função handleInteraction

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
        // A lógica do manipulador para extrair o guildId precisa ser robusta.
        // Vamos passar o ID extraído diretamente.
        await finalHandler(interaction, guildIdSafeOrMongoId, globalConfig, client);
    } else {
        // Tenta um manipulador mais genérico que pode lidar com o prefixo
        const genericHandlerName = `handle${capitalize(parts[0])}${capitalize(action)}`;
        const genericHandler = client.guildPanelHandlers[genericHandlerName];
        if (typeof genericHandler === 'function') {
            await genericHandler(interaction, guildIdSafeOrMongoId, globalConfig, client);
        } else {
            console.error(`[ERROR handleGuildPanelButton] Final handler "${finalHandlerName}" or "${genericHandlerName}" not found for customId "${customId}".`);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: `❌ Erro interno: Handler final para ação de painel "${action}" não configurado.`, flags: MessageFlags.Ephemeral });
            }
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

async function handleGuildEditButton(interaction, client, globalConfig, customId) {
    // customId format: guildedit_button_FIELD_MONGOID
    const parts = customId.split('_');
    if (parts.length < 4) {
        console.error(`[ERROR handleGuildEditButton] Invalid customId format: ${customId}`);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Erro interno: Formato de ID de botão de edição inválido.', ephemeral: true });
        }
        return;
    }
    const fieldToEdit = parts[2];
    const guildMongoId = parts.slice(3).join('_');
    const finalHandlerName = `handleGuildShowEdit${capitalize(fieldToEdit)}Modal`;
    const finalHandler = client.guildPanelHandlers[finalHandlerName];

    if (typeof finalHandler === 'function') {
        await finalHandler(interaction, guildMongoId, globalConfig, client);
    } else {
        console.error(`[ERROR handleGuildEditButton] Final handler "${finalHandlerName}" not found for customId "${customId}".`);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: `❌ Erro interno: Handler final para edição de "${fieldToEdit}" não configurado.`, ephemeral: true });
        }
    }
}

async function handleGuildPanelButton(interaction, client, globalConfig, customId) {
    // customId format: guildpanel_ACTION_GUILDIDSAFE_OR_MONGOID
    const parts = customId.split('_');
     if (parts.length < 3) {
        console.error(`[ERROR handleGuildPanelButton] Invalid customId format: ${customId}`);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Erro interno: Formato de ID de botão de painel inválido.', ephemeral: true });
        }
        return;
    }
    const action = parts[1];
    const guildIdSafeOrMongoId = parts.slice(2).join('_');
    const finalHandlerName = `handleGuildPanel${capitalize(action)}`;
    const finalHandler = client.guildPanelHandlers[finalHandlerName];

    if (typeof finalHandler === 'function') {
        await finalHandler(interaction, guildIdSafeOrMongoId, globalConfig, client);
    } else {
        console.error(`[ERROR handleGuildPanelButton] Final handler "${finalHandlerName}" not found for customId "${customId}".`);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: `❌ Erro interno: Handler final para ação de painel "${action}" não configurado.`, ephemeral: true });
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
         if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: `❌ Erro interno: Handler para submissão de formulário de "${fieldToEdit}" não configurado.`, ephemeral: true });
        }
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
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: `❌ Erro interno: Handler para submissão de formulário de painel "${action}" não configurado.`, ephemeral: true });
        }
    }
}

module.exports = {
    handleInteraction,
    handleGuildEditButton,
    handleGuildPanelButton,
    handleGuildEditModalSubmit,
    handleGuildPanelModalSubmit,
    getAndValidateGuild
};