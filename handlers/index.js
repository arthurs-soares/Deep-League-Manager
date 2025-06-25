// handlers/index.js
// Este arquivo agrega e re-exporta todas as funções de handler de subdiretórios,
// criando uma interface unificada para acesso a todas as lógicas de negócio do bot.

// Importações dos módulos de banco de dados (handlers/db)
const { loadConfig, saveConfig } = require('./db/configDb');
const { loadGuildByName, loadAllGuilds, saveGuildData, deleteGuildByName, findGuildByLeader, isUserInAnyGuild } = require('./db/guildDb');
const { saveWarTicket, loadWarTicketByThreadId, deleteWarTicket } = require('./db/warDb');

// Importa as funções de roteamento intermediárias do interactionHandler
// Estas funções serão chamadas pelo handleInteraction principal
// e são responsáveis por extrair os args do customId e chamar os handlers finais.
const { handleGuildEditButton, handleGuildPanelButton, handleGuildEditModalSubmit, handleGuildPanelModalSubmit } = require('./panel/interactionHandler');


// Importações dos módulos do painel (handlers/panel)
const {
    handleGuildPanelEdit,      // Botão principal "Editar Perfil"
    // Novas funções para mostrar modais específicos após clique no botão
    handleGuildShowEditNameModal,
    handleGuildShowEditDescriptionModal,
    handleGuildShowEditLogoModal,
    handleGuildShowEditColorModal,
    handleGuildShowEditBannerModal,
    // handleGuildEditSelect, // Removido, não usamos mais o menu de seleção para edição

    // Handlers de submissão de modais individuais para edição
    handleGuildEditNameSubmit,
    handleGuildEditDescriptionSubmit,
    handleGuildEditLogoSubmit,
    handleGuildEditColorSubmit,
    handleGuildEditBannerSubmit
} = require('./panel/editHandlers');
const { handleGuildPanelSetcoleader, handleGuildPanelSetcoleaderSubmit, handleGuildPanelTransferleader, handleGuildPanelTransferleaderSubmit } = require('./panel/leadershipHandlers');
// Importa todas as funções de rosterHandlers (o módulo mais complexo)
const {
    processRosterInput, // Função auxiliar
    handleGuildPanelAddmember,
    handleGuildPanelAddmemberSubmit,
    handleGuildPanelRemovemember,
    handleGuildPanelRemovememberSubmit,
    handleGuildPanelBulkaddmember,
    handleGuildPanelBulkaddmemberSubmit,
    handleGuildPanelTrocarJogador_Initial,
    handleGuildPanelTrocarJogador_RosterSelect,
    handleGuildPanelTrocarJogador_RosterSubmit,
    handleGuildPanelManageRosters_Initial,
    handleGuildPanelManageRosters_SelectAction,
    handleGuildPanelManagePlayer_SelectUser,
    handleGuildPanelManagePlayer_SelectRosterType,
    handleProfileLeaveGuild,        
    handleConfirmLeaveGuild         
} = require('./panel/rosterHandlers');

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
const { COLOR_MAP, resolveDisplayColor } = require('./utils/constants');
const { sendLogMessage } = require('./utils/logManager');
const { manageLeaderRole, manageCoLeaderRole, cleanUpLeadershipRoles } = require('./utils/roleManager'); // manageCoLeaderRole adicionado
const { getAndValidateGuild } = require('./utils/validation');

// Importa o NOVO módulo de gerenciamento de posts de fórum (agora na raiz 'utils/')
const { manageGuildForumPost } = require('../utils/guildForumPostManager');

// Importa o novo handler de interação (agora em handlers/interactionHandler.js)
const { handleInteraction } = require('./panel/interactionHandler'); // CORRIGIDO: Aponta para o handler dentro da pasta panel

// Importa o handler de eventos de boost
const boostHandler = require('./events/boostHandler');

// Handler do perfil de usuário
const { loadUserProfile, saveUserProfile } = require('./db/userProfileDb');


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
    // Novas funções para mostrar modais específicos
    handleGuildShowEditNameModal,
    handleGuildShowEditDescriptionModal,
    handleGuildShowEditLogoModal,
    handleGuildShowEditColorModal,
    handleGuildShowEditBannerModal,

    // Handlers intermediários para roteamento de botões e modais
    handleGuildEditButton,
    handleGuildPanelButton,         // Adicionado
    handleGuildEditModalSubmit,     // Adicionado
    handleGuildPanelModalSubmit,    // Adicionado
    // As funções handleGuildShowEdit...Modal já estão exportadas acima na seção "Novas funções para mostrar modais específicos"

    handleGuildEditNameSubmit,
    handleGuildEditDescriptionSubmit,
    handleGuildEditLogoSubmit,
    handleGuildEditColorSubmit,
    handleGuildEditBannerSubmit,

    handleGuildPanelSetcoleader,
    handleGuildPanelSetcoleaderSubmit,
    handleGuildPanelTransferleader,
    handleGuildPanelTransferleaderSubmit,

    // Funções de Roster (re-exportando as que são pontos de entrada ou cruciais para o interactionHandler)
    processRosterInput, // Re-exportado para uso direto em comandos como editar.js
    handleGuildPanelAddmember,
    handleGuildPanelAddmemberSubmit,
    handleGuildPanelRemovemember,
    handleGuildPanelRemovememberSubmit,
    handleGuildPanelBulkaddmember,
    handleGuildPanelBulkaddmemberSubmit,
    handleGuildPanelTrocarJogador_Initial,
    handleGuildPanelTrocarJogador_RosterSelect,
    handleGuildPanelTrocarJogador_RosterSubmit,
    handleGuildPanelManageRosters_Initial,
    handleGuildPanelManageRosters_SelectAction,
    handleGuildPanelManagePlayer_SelectUser,
    handleGuildPanelManagePlayer_SelectRosterType,

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
    sendLogMessage,
    manageLeaderRole,
    manageCoLeaderRole, // Re-exportado
    cleanUpLeadershipRoles, // Re-exportado
    getAndValidateGuild,

    // NOVO: Gerenciamento de Posts de Fórum
    manageGuildForumPost,

    // Handler de Interações (centralizado)
    handleInteraction,

    // Event Handlers
    ...boostHandler, // Garante que handleBoostUpdate seja exportado
    loadUserProfile, // Handler de carregar o perfil do usuário
    saveUserProfile, // Handler de salvar o perfil do usuário

    // Handlers para sair da guilda
    handleProfileLeaveGuild,        
    handleConfirmLeaveGuild 
};
