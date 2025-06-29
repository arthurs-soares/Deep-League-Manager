// handlers/panel/warTicketActions.js

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
