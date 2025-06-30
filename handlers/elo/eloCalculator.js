// handlers/elo/eloCalculator.js
// Calculadora principal do sistema ELO

const { 
    ELO_BASE_VALUES, 
    ELO_MULTIPLIERS, 
    ELO_CONFIG, 
    ELO_CHANGE_REASONS,
    MATCH_RESULTS 
} = require('../../utils/eloConstants');

/**
 * Calcula a mudança de ELO para um jogador baseado no resultado da partida
 * @param {Object} params - Parâmetros do cálculo
 * @param {number} params.currentElo - ELO atual do jogador
 * @param {boolean} params.isWinner - Se o jogador está no time vencedor
 * @param {boolean} params.isMvp - Se o jogador foi MVP
 * @param {string} params.matchResult - Resultado da partida (2-0, 2-1, 1-2, 0-2)
 * @returns {Object} Objeto com mudança de ELO e informações
 */
function calculateEloChange({ currentElo, isWinner, isMvp, matchResult, isWager = false }) {
    // Validar parâmetros
    if (typeof currentElo !== 'number' || currentElo < 0) {
        throw new Error('ELO atual deve ser um número válido e não negativo');
    }

    if (!Object.values(MATCH_RESULTS).includes(matchResult)) {
        throw new Error('Resultado da partida inválido');
    }

    // Determinar se foi flawless
    const isFlawless = matchResult === MATCH_RESULTS.FLAWLESS_WIN ||
                       matchResult === MATCH_RESULTS.FLAWLESS_LOSS ||
                       matchResult === MATCH_RESULTS.WAGER_WIPE_WIN ||
                       matchResult === MATCH_RESULTS.WAGER_WIPE_LOSS;
    
    // Obter valores base baseados na situação
    const baseValues = getBaseEloValues(isWinner, isMvp, isFlawless, isWager);
    
    // Calcular ELO base (valor aleatório dentro do range)
    const eloChange = getRandomInRange(baseValues.min, baseValues.max);
    
    // Aplicar multiplicador baseado no ELO atual
    const multiplier = getEloMultiplier(currentElo, isWinner);
    const finalEloChange = Math.round(eloChange * multiplier);
    
    // Calcular novo ELO com limites
    const newElo = Math.max(ELO_CONFIG.MIN_ELO, 
                   Math.min(ELO_CONFIG.MAX_ELO, currentElo + finalEloChange));
    
    // Determinar razão da mudança
    const reason = getChangeReason(isWinner, isMvp, isFlawless, isWager);
    
    return {
        oldElo: currentElo,
        eloChange: finalEloChange,
        newElo: newElo,
        reason: reason,
        matchResult: matchResult,
        multiplier: multiplier,
        baseRange: baseValues,
        details: {
            isWinner,
            isMvp,
            isFlawless,
            wasAtLimit: newElo === ELO_CONFIG.MIN_ELO || newElo === ELO_CONFIG.MAX_ELO
        }
    };
}

/**
 * Obtém os valores base de ELO baseado na situação do jogador
 * @param {boolean} isWinner - Se é vencedor
 * @param {boolean} isMvp - Se é MVP
 * @param {boolean} isFlawless - Se foi flawless
 * @returns {Object} Valores mínimo e máximo
 */
function getBaseEloValues(isWinner, isMvp, isFlawless, isWager = false) {
    // Se for um wager, usar valores específicos para wagers
    if (isWager) {
        if (isWinner) {
            return isFlawless ? ELO_BASE_VALUES.WAGER_WIPE_WIN : ELO_BASE_VALUES.WAGER_WIN;
        } else {
            return isFlawless ? ELO_BASE_VALUES.WAGER_WIPE_LOSS : ELO_BASE_VALUES.WAGER_LOSS;
        }
    }
    
    // Caso contrário, usar valores para partidas normais
    if (isWinner) {
        if (isFlawless) {
            return isMvp ? ELO_BASE_VALUES.VICTORY_MVP_FLAWLESS : ELO_BASE_VALUES.VICTORY_NORMAL_FLAWLESS;
        } else {
            return isMvp ? ELO_BASE_VALUES.VICTORY_MVP_NORMAL : ELO_BASE_VALUES.VICTORY_NORMAL;
        }
    } else {
        if (isFlawless) {
            return isMvp ? ELO_BASE_VALUES.DEFEAT_MVP_FLAWLESS : ELO_BASE_VALUES.DEFEAT_NORMAL_FLAWLESS;
        } else {
            return isMvp ? ELO_BASE_VALUES.DEFEAT_MVP_NORMAL : ELO_BASE_VALUES.DEFEAT_NORMAL;
        }
    }
}

/**
 * Obtém o multiplicador baseado no ELO atual
 * @param {number} currentElo - ELO atual
 * @param {boolean} isWinner - Se é vencedor (para determinar se usar gain ou loss multiplier)
 * @returns {number} Multiplicador a ser aplicado
 */
function getEloMultiplier(currentElo, isWinner) {
    for (const multiplierData of Object.values(ELO_MULTIPLIERS)) {
        if (currentElo >= multiplierData.min && currentElo <= multiplierData.max) {
            return isWinner ? multiplierData.gainMultiplier : multiplierData.lossMultiplier;
        }
    }
    
    // Default para médio se não encontrar
    return 1.0;
}

/**
 * Gera um número aleatório dentro de um range
 * @param {number} min - Valor mínimo
 * @param {number} max - Valor máximo
 * @returns {number} Número aleatório
 */
function getRandomInRange(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Determina a razão da mudança de ELO
 * @param {boolean} isWinner - Se é vencedor
 * @param {boolean} isMvp - Se é MVP
 * @param {boolean} isFlawless - Se foi flawless
 * @returns {string} Razão da mudança
 */
function getChangeReason(isWinner, isMvp, isFlawless, isWager = false) {
    // Se for um wager, usar razões específicas para wagers
    if (isWager) {
        if (isWinner) {
            return isFlawless ? ELO_CHANGE_REASONS.WAGER_WIPE_WIN : ELO_CHANGE_REASONS.WAGER_WIN;
        } else {
            return isFlawless ? ELO_CHANGE_REASONS.WAGER_WIPE_LOSS : ELO_CHANGE_REASONS.WAGER_LOSS;
        }
    }
    
    // Caso contrário, usar razões para partidas normais
    if (isWinner) {
        if (isFlawless) {
            return isMvp ? ELO_CHANGE_REASONS.VICTORY_MVP_FLAWLESS : ELO_CHANGE_REASONS.VICTORY_NORMAL_FLAWLESS;
        } else {
            return isMvp ? ELO_CHANGE_REASONS.VICTORY_MVP : ELO_CHANGE_REASONS.VICTORY_NORMAL;
        }
    } else {
        if (isFlawless) {
            return isMvp ? ELO_CHANGE_REASONS.DEFEAT_MVP_FLAWLESS : ELO_CHANGE_REASONS.DEFEAT_NORMAL_FLAWLESS;
        } else {
            return isMvp ? ELO_CHANGE_REASONS.DEFEAT_MVP : ELO_CHANGE_REASONS.DEFEAT_NORMAL;
        }
    }
}

/**
 * Calcula mudanças de ELO para um time inteiro
 * @param {Object} params - Parâmetros do cálculo
 * @param {Array} params.players - Array de jogadores [{ userId, currentElo }]
 * @param {string} params.mvpUserId - ID do usuário MVP
 * @param {boolean} params.isWinnerTeam - Se é o time vencedor
 * @param {string} params.matchResult - Resultado da partida
 * @returns {Array} Array com mudanças para cada jogador
 */
function calculateTeamEloChanges({ players, mvpUserId, isWinnerTeam, matchResult }) {
    if (!Array.isArray(players) || players.length === 0) {
        throw new Error('Lista de jogadores inválida');
    }

    return players.map(player => {
        const isMvp = player.userId === mvpUserId;
        
        return {
            userId: player.userId,
            ...calculateEloChange({
                currentElo: player.currentElo,
                isWinner: isWinnerTeam,
                isMvp: isMvp,
                matchResult: matchResult
            })
        };
    });
}

/**
 * Formata o resultado do cálculo para exibição
 * @param {Object} eloResult - Resultado do cálculo de ELO
 * @returns {string} String formatada
 */
function formatEloChange(eloResult) {
    const changeStr = eloResult.eloChange > 0 ? `+${eloResult.eloChange}` : `${eloResult.eloChange}`;
    const arrow = eloResult.eloChange > 0 ? '↗️' : '↘️';
    
    return `${arrow} **${changeStr} ELO** (${eloResult.oldElo} → ${eloResult.newElo})`;
}

/**
 * Valida se um jogador pode receber mudança de ELO (cooldown)
 * @param {Object} userProfile - Perfil do usuário
 * @returns {Object} Resultado da validação
 */
function validateEloCooldown(userProfile) {
    // Se cooldown está desabilitado (0 horas), sempre permitir
    if (ELO_CONFIG.COOLDOWN_HOURS <= 0) {
        return { canUpdate: true, timeRemaining: 0 };
    }

    if (!userProfile.eloData || !userProfile.eloData.lastEloUpdate) {
        return { canUpdate: true, timeRemaining: 0 };
    }

    const lastUpdate = new Date(userProfile.eloData.lastEloUpdate);
    const cooldownEnd = new Date(lastUpdate.getTime() + (ELO_CONFIG.COOLDOWN_HOURS * 60 * 60 * 1000));
    const now = new Date();

    if (now < cooldownEnd) {
        return {
            canUpdate: false,
            timeRemaining: cooldownEnd.getTime() - now.getTime(),
            cooldownEnd: cooldownEnd
        };
    }

    return { canUpdate: true, timeRemaining: 0 };
}

/**
 * Calcula mudanças de ELO para um wager (1v1)
 * @param {Object} params - Parâmetros do cálculo
 * @param {number} params.winnerElo - ELO atual do vencedor
 * @param {number} params.loserElo - ELO atual do perdedor
 * @param {boolean} params.isWipe - Se foi um wipe completo
 * @returns {Object} Objeto com mudanças para vencedor e perdedor
 */
function calculateWagerEloChanges({ winnerElo, loserElo, isWipe }) {
    const winnerChange = calculateEloChange({
        currentElo: winnerElo,
        isWinner: true,
        isMvp: false, // Não há MVP em wagers
        matchResult: isWipe ? MATCH_RESULTS.WAGER_WIPE_WIN : MATCH_RESULTS.WAGER_WIN,
        isWager: true
    });
    
    const loserChange = calculateEloChange({
        currentElo: loserElo,
        isWinner: false,
        isMvp: false,
        matchResult: isWipe ? MATCH_RESULTS.WAGER_WIPE_LOSS : MATCH_RESULTS.WAGER_LOSS,
        isWager: true
    });
    
    return { winnerChange, loserChange };
}

module.exports = {
    calculateEloChange,
    calculateTeamEloChanges,
    calculateWagerEloChanges,
    formatEloChange,
    validateEloCooldown,
    getBaseEloValues,
    getEloMultiplier
};