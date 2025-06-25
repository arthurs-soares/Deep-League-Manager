// handlers/panel/warTicketButtons.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const MAX_ROUNDS = 3; // Importado ou definido aqui para consistência

/**
 * Constrói as ActionRows com os botões de pontuação para os rounds.
 * @param {string} yourGuildIdSafe - ID seguro da guilda solicitante (nome formatado).
 * @param {string} yourGuildName - Nome de exibição da guilda solicitante.
 * @param {string} enemyGuildIdSafe - ID seguro da guilda inimiga (nome formatado).
 * @param {string} enemyGuildName - Nome de exibição da guilda inimiga.
 * @param {number} currentRound - O round atual (para rótulos dos botões).
 * @returns {Array<ActionRowBuilder>} Array de ActionRows com botões de round.
 */
function createRoundScoreButtons(yourGuildIdSafe, yourGuildName, enemyGuildIdSafe, enemyGuildName, currentRound) {
    if (currentRound > MAX_ROUNDS) return []; 

    const row = new ActionRowBuilder();
    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`war_round_win_${yourGuildIdSafe}_${currentRound}`)
            .setLabel(`Round ${currentRound} - ${yourGuildName} Vence`)
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`war_round_win_${enemyGuildIdSafe}_${currentRound}`)
            .setLabel(`Round ${currentRound} - ${enemyGuildName} Vence`)
            .setStyle(ButtonStyle.Danger)
    );
    return [row];
}

/**
 * Constrói a ActionRow com o botão único de Solicitar Dodge.
 * @returns {Array<ActionRowBuilder>} Array de ActionRows com o botão de Solicitar Dodge.
 */
function createRequestDodgeButton() {
    const row = new ActionRowBuilder();
    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`war_request_dodge`) // ID CUSTOMIZADO para o botão de solicitar dodge
            .setLabel(`Solicitar Dodge`)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🏃')
    );
    return [row];
}

/**
 * Constrói as ActionRows com os botões de controle inicial (Aceitar/WO/Dodge).
 * @returns {Array<ActionRowBuilder>} Array de ActionRows com botões de controle.
 */
function createInitialControlButtons() {
    const row1 = new ActionRowBuilder();
    row1.addComponents(
        new ButtonBuilder()
            .setCustomId(`war_accept`) // Botão único para aceitar a war
            .setLabel('✅ Aceitar War')
            .setStyle(ButtonStyle.Success)
    );

    const requestDodgeButton = createRequestDodgeButton();
    return [row1, ...requestDodgeButton];
}

/**
 * Função central para determinar e criar os botões da war com base no seu status.
 * @param {Object} warData - Os dados da guerra.
 * @returns {Array<ActionRowBuilder>} Os componentes (botões) para a mensagem da war.
 */
function createWarCurrentButtons(warData) {
    if (warData.status === 'Aguardando Aceitação') {
        return createInitialControlButtons(); 
    } else if (warData.status === 'Aceita' && warData.currentRound <= MAX_ROUNDS) {
        // Se a war foi aceita e ainda tem rounds, mostre botões de round E o de solicitar dodge
        const roundButtons = createRoundScoreButtons(warData.yourGuild.idSafe, warData.yourGuild.name, warData.enemyGuild.idSafe, warData.enemyGuild.name, warData.currentRound);
        const requestDodgeButton = createRequestDodgeButton(); 
        return [...roundButtons, ...requestDodgeButton];
    } else {
        // Se a war está Concluída, WO ou Dodge, não mostra botões
        return [];
    }
}

module.exports = {
    createRoundScoreButtons,
    createRequestDodgeButton,
    createInitialControlButtons,
    createWarCurrentButtons,
};
