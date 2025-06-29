// handlers/index.js
// Este arquivo agrega e re-exporta todas as funções de handler de subdiretórios,
// criando uma interface unificada para acesso a todas as lógicas de negócio do bot.

// Importações dos módulos de banco de dados (handlers/db)
const { loadConfig, saveConfig } = require('./db/configDb');
const { loadGuildByName, loadAllGuilds, saveGuildData, deleteGuildByName, findGuildByLeader, isUserInAnyGuild } = require('./db/guildDb');
const { saveWarTicket, loadWarTicketByThreadId, deleteWarTicket } = require('./db/warDb');
const { getDb } = require('../utils/database'); // <<< CORRETO                     

// Importa as funções de roteamento intermediárias do interactionHandler
const { handleGuildEditButton, handleGuildPanelButton, handleGuildEditModalSubmit, handleGuildPanelModalSubmit } = require('./panel/common/interactionHandler');

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
} = require('./panel/common/editHandlers');
const { handleGuildPanelSetcoleader, handleGuildPanelSetcoleaderSubmit, handleGuildPanelTransferleader, handleGuildPanelTransferleaderSubmit } = require('./panel/common/leadershipHandlers');

// Importações dos handlers de War Ticket (do indexador de War Ticket)
const { handleWarTicketButton, handleWarTicketModalSubmit } = require('./war/warTicketHandlers');
const { handleWarRequestDodgeButton } = require('./war/core/warDodgeHandler');
const { handleWarDodgeSelectGuildSubmit } = require('./war/core/warDodgeHandler');
const { handleWarRoundButton } = require('./war/core/warRoundHandler')
const { handleWarAcceptButton } = require('./war/core/warAcceptHandler');

// Importações dos módulos utilitários (handlers/utils)
const { COLOR_MAP, resolveDisplayColor, COOLDOWN_DAYS, MAX_ROSTER_SIZE } = require('./utils/constants');
const { sendLogMessage } = require('./utils/logManager');
const { manageLeaderRole, manageCoLeaderRole, cleanUpLeadershipRoles } = require('./utils/roleManager');
const { getAndValidateGuild } = require('./utils/validation');
const { autocompleteGuilds } = require('./utils/autocompleteHelper'); // Adicionado para autocomplete


// Importa o NOVO módulo de gerenciamento de posts de fórum (agora na raiz 'utils/')
const { manageGuildForumPost } = require('../utils/guildForumPostManager');

// Importa o novo handler de interação (agora em handlers/interactionHandler.js)
const { handleInteraction } = require('./panel/common/interactionHandler');

// Importa o handler de eventos de boost
const boostHandler = require('./events/boostHandler');

// Handler do perfil de usuário
const { loadUserProfile, saveUserProfile } = require('./db/userProfileDb');

// Importa o handler de times
const { loadTeamByName, loadAllTeams, saveTeamData, deleteTeamByName, isUserInAnyTeam } = require('./db/teamDb');

// NOVAS IMPORTAÇÕES DOS MÓDULOS DE ROSTER REATORADOS
const rosterUtils = require('./panel/roster/rosterUtils');
const rosterIndividualActions = require('./panel/roster/rosterIndividualActions');
const rosterBulkActions = require('./panel/roster/rosterBulkActions');
const rosterSlotEditActions = require('./panel/roster/rosterSlotEditActions');
const rosterDropdownFlow = require('./panel/roster/rosterDropdownFlow');
const rosterDirectManageActions = require('./panel/roster/rosterDirectManageActions');
const rosterLeaveActions = require('./panel/roster/rosterLeaveActions');
const teamPanelHandlers = require('./panel/team/teamPanelHandlers');

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
    ...teamPanelHandlers
};
