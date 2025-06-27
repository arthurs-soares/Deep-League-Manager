// handlers/panel/warTicketActions.js
// Este arquivo agora atua como um agregador (barrel file) para os handlers de war refatorados.

const { handleWarAcceptButton } = require('./war/warAcceptHandler');
const { handleWarRequestDodgeButton, handleWarDodgeSelectGuildSubmit } = require('./war/warDodgeHandler');
const { handleWarRoundButton } = require('./war/warRoundHandler');

// Re-exporta todos os handlers para que possam ser importados de um único local, mantendo a compatibilidade.
module.exports = {
    handleWarAcceptButton,
    handleWarRequestDodgeButton,
    handleWarDodgeSelectGuildSubmit,
    handleWarRoundButton,
};