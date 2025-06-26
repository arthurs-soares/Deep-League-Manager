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
const {
    handleGuildPanelEdit,
    handleGuildShowEditNameModal,
    handleGuildShowEditDescriptionModal,
    handleGuildShowEditLogoModal,
    handleGuildShowEditColorModal,
    handleGuildShowEditBannerModal,
    handleGuildEditNameSubmit,
    handleGuildEditDescriptionSubmit,
    handleGuildEditLogoSubmit,
    handleGuildEditColorSubmit,
    handleGuildEditBannerSubmit
} = require('./panel/editHandlers');
const { handleGuildPanelSetcoleader, handleGuildPanelSetcoleaderSubmit, handleGuildPanelTransferleader, handleGuildPanelTransferleaderSubmit } = require('./panel/leadershipHandlers');

// // REMOVA ESTE BLOCO INTEIRO:
// const {
//     processRosterInput, 
//     handleGuildPanelAddmember,
//     // ... e todas as outras funções que estavam em rosterHandlers.js
//     handleConfirmLeaveGuild         
// } = require('./panel/rosterHandlers'); // <--- LINHA PROBLEMÁTICA


// Importações dos handlers de War Ticket (do indexador de War Ticket)
const {
    handleWarTicketButton,
    handleWarTicketModalSubmit,
    handleWarAcceptButton,
    handleWarRequestDodgeButton,
    handleWarDodgeSelectGuildSubmit,
    handleWarRoundButton,
} = require('./panel/warTicketHandlers');

// Importações dos módulos utilitários (handlers/utils)
const { COLOR_MAP, resolveDisplayColor, COOLDOWN_DAYS, MAX_ROSTER_SIZE } = require('./utils/constants'); // Adicionado COOLDOWN_DAYS, MAX_ROSTER_SIZE se você os moveu para cá
const { sendLogMessage } = require('./utils/logManager');
const { manageLeaderRole, manageCoLeaderRole, cleanUpLeadershipRoles } = require('./utils/roleManager');
const { getAndValidateGuild } = require('./utils/validation');
const { autocompleteGuilds } = require('./utils/autocompleteHelper'); // Adicionado para autocomplete


// Importa o NOVO módulo de gerenciamento de posts de fórum (agora na raiz 'utils/')
const { manageGuildForumPost } = require('../utils/guildForumPostManager');

// Importa o novo handler de interação (agora em handlers/interactionHandler.js)
const { handleInteraction } = require('./panel/interactionHandler');

// Importa o handler de eventos de boost
const boostHandler = require('./events/boostHandler');

// Handler do perfil de usuário
const { loadUserProfile, saveUserProfile } = require('./db/userProfileDb');

// Importa o handler de times
const { loadTeamByName, loadAllTeams, saveTeamData, deleteTeamByName, isUserInAnyTeam } = require('./db/teamDb');

// NOVAS IMPORTAÇÕES DOS MÓDULOS DE ROSTER REATORADOS
const rosterUtils = require('./panel/rosterUtils');
const rosterIndividualActions = require('./panel/rosterIndividualActions');
const rosterBulkActions = require('./panel/rosterBulkActions');
const rosterSlotEditActions = require('./panel/rosterSlotEditActions');
const rosterDropdownFlow = require('./panel/rosterDropdownFlow');
const rosterDirectManageActions = require('./panel/rosterDirectManageActions');
const rosterLeaveActions = require('./panel/rosterLeaveActions');

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

    // Funções de Handlers do Painel
    handleGuildPanelEdit,
    handleGuildShowEditNameModal,
    handleGuildShowEditDescriptionModal,
    handleGuildShowEditLogoModal,
    handleGuildShowEditColorModal,
    handleGuildShowEditBannerModal,
    handleGuildEditNameSubmit,
    handleGuildEditDescriptionSubmit,
    handleGuildEditLogoSubmit,
    handleGuildEditColorSubmit,
    handleGuildEditBannerSubmit,
    handleGuildPanelSetcoleader,
    handleGuildPanelSetcoleaderSubmit,
    handleGuildPanelTransferleader,
    handleGuildPanelTransferleaderSubmit,

    // Handlers intermediários para roteamento de botões e modais
    handleGuildEditButton,
    handleGuildPanelButton,
    handleGuildEditModalSubmit,
    handleGuildPanelModalSubmit,

    // Funções de War Ticket
    handleWarTicketButton,
    handleWarTicketModalSubmit,
    handleWarAcceptButton,
    handleWarRequestDodgeButton,
    handleWarDodgeSelectGuildSubmit,
    handleWarRoundButton,

    // Funções Utilitárias
    COLOR_MAP,
    resolveDisplayColor,
    COOLDOWN_DAYS,      // Exportando
    MAX_ROSTER_SIZE,    // Exportando
    sendLogMessage,
    manageLeaderRole,
    manageCoLeaderRole,
    cleanUpLeadershipRoles,
    getAndValidateGuild,
    autocompleteGuilds, // Exportando autocomplete helper

    // Gerenciamento de Posts de Fórum
    manageGuildForumPost,

    // Handler de Interações (centralizado)
    handleInteraction,

    // Event Handlers
    ...boostHandler,
    loadUserProfile,
    saveUserProfile,

    // Funções do banco de dados para times
    loadTeamByName,
    loadAllTeams,
    saveTeamData,
    deleteTeamByName,
    isUserInAnyTeam,
    
    // NOVAS EXPORTAÇÕES DOS MÓDULOS DE ROSTER REATORADOS
    ...rosterUtils,
    ...rosterIndividualActions,
    ...rosterBulkActions,
    ...rosterSlotEditActions,
    ...rosterDropdownFlow,
    ...rosterDirectManageActions,
    ...rosterLeaveActions,
};