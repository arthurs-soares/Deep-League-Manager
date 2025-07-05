// handlers/panel/warTicketHandlers.js
// Este arquivo agrega e re-exporta todas as funções de handler de War Ticket de subdiretórios.

const { handleWarTicketButton, handleWarTicketModalSubmit } = require('./actions/warTicketModals');
const { handleWarAcceptButton, handleWarRequestDodgeButton, handleWarDodgeSelectGuildSubmit, handleWarRoundButton } = require('./actions/warTicketActions');
const { createRoundScoreButtons, createRequestDodgeButton, createInitialControlButtons, createWarCurrentButtons } = require('./actions/warTicketButtons');


module.exports = {
    // Funções de Modal (abrir/submeter o formulário de ticket)
    handleWarTicketButton,
    handleWarTicketModalSubmit,

    // Funções de Ação (botões dentro da thread do ticket)
    handleWarAcceptButton,
    handleWarRequestDodgeButton,
    handleWarDodgeSelectGuildSubmit,
    handleWarRoundButton,

    // Funções de Criação de Botões (se precisar ser acessado diretamente de fora)
    createRoundScoreButtons,
    createRequestDodgeButton,
    createInitialControlButtons,
    createWarCurrentButtons,
};
