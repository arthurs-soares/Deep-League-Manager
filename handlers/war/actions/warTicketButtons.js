// handlers/panel/warTicketButtons.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { MAX_ROUNDS } = require('../../utils/constants'); // Importar de constants.js é a melhor prática

/**
 * Constrói as ActionRows com os botões de pontuação para os rounds.
 * AGORA USA NOMES DE ENTIDADES PARA OS CUSTOMIDs.
 * @param {string} yourEntityName - Nome de exibição da sua entidade.
 * @param {string} enemyEntityName - Nome de exibição da entidade inimiga.
 * @param {number} currentRound - O round atual (para rótulos e IDs dos botões).
 * @returns {Array<ActionRowBuilder>} Array de ActionRows com botões de round.
 */
function createRoundScoreButtons(yourEntityName, enemyEntityName, currentRound) {
    if (currentRound > MAX_ROUNDS) return [];

    // Substitui espaços por underscores para criar um customId válido.
    const yourEntityIdForButton = yourEntityName.replace(/\s+/g, '_');
    const enemyEntityIdForButton = enemyEntityName.replace(/\s+/g, '_');

    const row = new ActionRowBuilder();
    row.addComponents(
        new ButtonBuilder()
            // Formato do ID: war_round_win_{NOME_DA_ENTIDADE_COM_UNDERSCORES}_{ROUND}
            .setCustomId(`war_round_win_${yourEntityIdForButton}_${currentRound}`)
            .setLabel(`Round ${currentRound} - ${yourEntityName} Vence`)
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`war_round_win_${enemyEntityIdForButton}_${currentRound}`)
            .setLabel(`Round ${currentRound} - ${enemyEntityName} Vence`)
            .setStyle(ButtonStyle.Danger)
    );
    return [row];
}

/**
 * Constrói a ActionRow com o botão único de Solicitar Dodge.
 */
function createRequestDodgeButton() {
    const row = new ActionRowBuilder();
    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`war_request_dodge`)
            .setLabel(`Declarar Dodge`)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🏃')
    );
    return [row];
}

/**
 * Constrói as ActionRows com os botões de controle inicial (Aceitar/Dodge).
 */
function createInitialControlButtons() {
    const row1 = new ActionRowBuilder();
    row1.addComponents(
        new ButtonBuilder()
            .setCustomId(`war_accept`)
            .setLabel('✅ Aceitar War')
            .setStyle(ButtonStyle.Success)
    );

    const requestDodgeButtonRow = createRequestDodgeButton();
    return [row1, ...requestDodgeButtonRow];
}

/**
 * Função central para determinar e criar os botões da war com base no seu status.
 * USA A ESTRUTURA GENERALIZADA yourEntity/enemyEntity.
 * @param {Object} warData - Os dados da guerra.
 * @returns {Array<ActionRowBuilder>} Os componentes (botões) para a mensagem da war.
 */
function createWarCurrentButtons(warData) {
    // Adicione o log aqui para ter certeza que MAX_ROUNDS está correto
    console.log(`[DEBUG createWarCurrentButtons] Verificando condição: Status='${warData.status}', Round=${warData.currentRound}, MAX_ROUNDS=${MAX_ROUNDS}`);

    if (warData.status === 'Aguardando Aceitação') {
        return createInitialControlButtons();
    } else if (warData.status === 'Aceita' && warData.currentRound <= MAX_ROUNDS) {
        // Esta condição agora deve ser verdadeira
        const roundButtons = createRoundScoreButtons(
            warData.yourEntity.name,
            warData.enemyEntity.name,
            warData.currentRound
        );
        const requestDodgeButton = createRequestDodgeButton();
        return [...roundButtons, ...requestDodgeButton];
    } else {
        return [];
    }
}

module.exports = {
    createRoundScoreButtons,
    createRequestDodgeButton,
    createInitialControlButtons,
    createWarCurrentButtons,
};
