// handlers/panel/warTicketActions.js
// Este arquivo agora atua como um agregador (barrel file) para os handlers de war refatorados.

const { handleWarAcceptButton } = require('../core/warAcceptHandler');
const { handleWarRequestDodgeButton, handleWarDodgeSelectGuildSubmit } = require('../core/warDodgeHandler');
const { handleWarRoundButton } = require('../core/warRoundHandler');

// Re-exporta todos os handlers para que possam ser importados de um único local, mantendo a compatibilidade.
module.exports = {
    handleWarAcceptButton,
    handleWarRequestDodgeButton,
    handleWarDodgeSelectGuildSubmit,
    handleWarRoundButton,
};
