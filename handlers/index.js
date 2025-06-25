// handlers/index.js
// Este arquivo agrega e re-exporta todas as funções de handler de subdiretórios,
// criando uma interface unificada para acesso a todas as lógicas de negócio do bot.

// Importações dos módulos de banco de dados (handlers/db)
const { loadConfig, saveConfig } = require('./db/configDb');
const { loadGuildByName, loadAllGuilds, saveGuildData, deleteGuildByName, findGuildByLeader, isUserInAnyGuild } = require('./db/guildDb');
const { saveWarTicket, loadWarTicketByThreadId, deleteWarTicket } = require('./db/warDb');

// Importa as funções de roteamento intermediárias do interactionHandler
const { handleGuildEditButton, handleGuildPanelButton, handleGuildEditModalSubmit, handleGuildPanelModalSubmit } = require('./panel/interactionHandler');

// Importações dos módulos do painel (handlers/panel)
const editHandlers = require('./panel/editHandlers'); // Importa o objeto inteiro
const leadershipHandlers = require('./panel/leadershipHandlers'); // Importa o objeto inteiro

// Importações dos handlers de War Ticket (do indexador de War Ticket)
const warTicketHandlers = require('./panel/warTicketHandlers'); // Importa o objeto inteiro

// Importações dos módulos utilitários (handlers/utils)
const { COLOR_MAP, resolveDisplayColor } = require('./utils/constants');
const { sendLogMessage } = require('./utils/logManager');
const { manageLeaderRole, manageCoLeaderRole, cleanUpLeadershipRoles } = require('./utils/roleManager');
const { getAndValidateGuild } = require('./utils/validation');

// Importa o módulo de gerenciamento de posts de fórum
const { manageGuildForumPost } = require('../utils/guildForumPostManager');

// Importa o handler de interação
const { handleInteraction } = require('./panel/interactionHandler'); // Já estava correto

// Importa o handler de eventos de boost
const boostHandler = require('./events/boostHandler');

// Handler do perfil de usuário
const { loadUserProfile, saveUserProfile } = require('./db/userProfileDb');

// Importa o handler de times
const { loadTeamByName, loadAllTeams, saveTeamData, deleteTeamByName, isUserInAnyTeam } = require('./db/teamDb');

// NOVOS IMPORTS DOS ARQUIVOS DE ROSTER DIVIDIDOS
const rosterLeaveHandlers = require('./panel/rosterLeave');
const rosterAddRemoveHandlers = require('./panel/rosterAddRemove');
const rosterSlotEditHandlers = require('./panel/rosterSlotEdit');
const rosterManageDirectHandlers = require('./panel/rosterManageDirect');
// A função processRosterInput agora vem de rosterUtils, não precisa ser importada aqui
// a menos que você queira reexportá-la explicitamente para uso por comandos.
// Por enquanto, vamos assumir que os comandos/handlers que precisam dela a importarão de rosterUtils.js

module.exports = {
    // Funções de Banco de Dados
    loadConfig,
    saveConfig,
    loadGuildByName,
    loadAllGuilds,
    saveGuildData,
    deleteGuildByName,
    findGuildByLeader,
    isUserInAnyGuild,
    saveWarTicket,
    loadWarTicketByThreadId,
    deleteWarTicket,

    // Funções de Handlers do Painel de Edição (usando spread operator)
    ...editHandlers, // Isso exportará handleGuildPanelEdit, handleGuildShowEditNameModal, etc.

    // Handlers intermediários para roteamento de botões e modais
    handleGuildEditButton,
    handleGuildPanelButton,
    handleGuildEditModalSubmit,
    handleGuildPanelModalSubmit,

    // Funções de Handlers de Liderança (usando spread operator)
    ...leadershipHandlers, // Isso exportará handleGuildPanelSetcoleader, Submit, Transferleader, Submit

    // Funções de Roster (AGORA DOS ARQUIVOS DIVIDIDOS)
    ...rosterLeaveHandlers,
    ...rosterAddRemoveHandlers,
    ...rosterSlotEditHandlers,
    ...rosterManageDirectHandlers,
    // processRosterInput não está mais sendo exportado daqui, pois foi movido para rosterUtils.js
    // Se algum comando precisar dele, deve importar de './handlers/panel/rosterUtils'.
    // Se você QUISER exportá-lo centralmente, adicione:
    // processRosterInput: require('./panel/rosterUtils').processRosterInput,

    // Funções de War Ticket (usando spread operator)
    ...warTicketHandlers, // Isso exportará handleWarTicketButton, ModalSubmit, AcceptButton, etc.

    // Funções Utilitárias
    COLOR_MAP,
    resolveDisplayColor,
    sendLogMessage,
    manageLeaderRole,
    manageCoLeaderRole,
    cleanUpLeadershipRoles,
    getAndValidateGuild,

    // Gerenciamento de Posts de Fórum
    manageGuildForumPost,

    // Handler de Interações (centralizado)
    handleInteraction,

    // Event Handlers
    ...boostHandler, // Garante que handleBoostUpdate seja exportado

    // Handler do perfil de usuário
    loadUserProfile,
    saveUserProfile,

    // Funções do banco de dados para times
    loadTeamByName,
    loadAllTeams,
    saveTeamData,
    deleteTeamByName,
    isUserInAnyTeam,
};