// handlers/elo/eloValidation.js
// Validações para o sistema de ELO

const { ELO_CONFIG, MATCH_RESULTS } = require('../../utils/eloConstants');

/**
 * Valida se um usuário tem permissão para gerenciar ELO
 * @param {Object} member - Objeto member do Discord
 * @param {Object} globalConfig - Configuração global
 * @returns {boolean} Se tem permissão
 */
function hasEloPermission(member, globalConfig) {
    if (!member || !globalConfig) return false;
    
    const userRoles = member.roles.cache.map(role => role.id);
    const allowedRoles = [
        ...globalConfig.scoreOperatorRoles,
        ...globalConfig.moderatorRoles
    ];
    
    return userRoles.some(roleId => allowedRoles.includes(roleId));
}

/**
 * Valida os parâmetros de uma partida
 * @param {Object} matchData - Dados da partida
 * @returns {Object} Resultado da validação
 */
function validateMatchData(matchData) {
    const errors = [];
    
    // Validar resultado
    if (!matchData.result || !Object.values(MATCH_RESULTS).includes(matchData.result)) {
        errors.push('Resultado da partida inválido. Use: 2-0, 2-1, 1-2, 0-2');
    }
    
    // Validar times
    if (!matchData.winnerTeam || typeof matchData.winnerTeam !== 'string') {
        errors.push('Time vencedor deve ser especificado');
    }
    
    if (!matchData.loserTeam || typeof matchData.loserTeam !== 'string') {
        errors.push('Time perdedor deve ser especificado');
    }
    
    // Validar MVPs
    if (!matchData.winnerMvp || typeof matchData.winnerMvp !== 'string') {
        errors.push('MVP do time vencedor deve ser especificado');
    }
    
    if (!matchData.loserMvp || typeof matchData.loserMvp !== 'string') {
        errors.push('MVP do time perdedor deve ser especificado');
    }
    
    // Validar se os MVPs são diferentes
    if (matchData.winnerMvp === matchData.loserMvp) {
        errors.push('MVP do time vencedor e perdedor não podem ser a mesma pessoa');
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

/**
 * Valida um valor de ELO
 * @param {number} elo - Valor de ELO
 * @returns {Object} Resultado da validação
 */
function validateEloValue(elo) {
    if (typeof elo !== 'number' || isNaN(elo)) {
        return {
            isValid: false,
            error: 'ELO deve ser um número válido'
        };
    }
    
    if (elo < ELO_CONFIG.MIN_ELO) {
        return {
            isValid: false,
            error: `ELO não pode ser menor que ${ELO_CONFIG.MIN_ELO}`
        };
    }
    
    if (elo > ELO_CONFIG.MAX_ELO) {
        return {
            isValid: false,
            error: `ELO não pode ser maior que ${ELO_CONFIG.MAX_ELO}`
        };
    }
    
    return { isValid: true };
}

/**
 * Valida uma mudança manual de ELO
 * @param {number} currentElo - ELO atual
 * @param {number} change - Mudança desejada
 * @returns {Object} Resultado da validação
 */
function validateEloChange(currentElo, change) {
    if (typeof change !== 'number' || isNaN(change)) {
        return {
            isValid: false,
            error: 'Mudança de ELO deve ser um número válido'
        };
    }
    
    if (change === 0) {
        return {
            isValid: false,
            error: 'Mudança de ELO não pode ser zero'
        };
    }
    
    const newElo = currentElo + change;
    
    if (newElo < ELO_CONFIG.MIN_ELO) {
        return {
            isValid: false,
            error: `Esta mudança resultaria em ELO abaixo do mínimo (${ELO_CONFIG.MIN_ELO})`
        };
    }
    
    if (newElo > ELO_CONFIG.MAX_ELO) {
        return {
            isValid: false,
            error: `Esta mudança resultaria em ELO acima do máximo (${ELO_CONFIG.MAX_ELO})`
        };
    }
    
    // Validar mudanças muito extremas (mais de 500 pontos)
    if (Math.abs(change) > 500) {
        return {
            isValid: false,
            error: 'Mudanças de ELO não podem ser maiores que 500 pontos de uma vez'
        };
    }
    
    return { isValid: true };
}

/**
 * Valida se um usuário existe e pode receber ELO
 * @param {Object} user - Usuário do Discord
 * @param {Object} guild - Guild do Discord
 * @returns {Object} Resultado da validação
 */
function validateUserForElo(user, guild) {
    if (!user) {
        return {
            isValid: false,
            error: 'Usuário não encontrado'
        };
    }
    
    if (user.bot) {
        return {
            isValid: false,
            error: 'Bots não podem ter ELO'
        };
    }
    
    // Verificar se o usuário está na guild
    if (guild && !guild.members.cache.has(user.id)) {
        return {
            isValid: false,
            error: 'Usuário não está neste servidor'
        };
    }
    
    return { isValid: true };
}

/**
 * Valida um histórico de ELO
 * @param {Array} history - Array do histórico
 * @returns {Object} Resultado da validação
 */
function validateEloHistory(history) {
    if (!Array.isArray(history)) {
        return {
            isValid: false,
            error: 'Histórico deve ser um array'
        };
    }
    
    // Verificar se o histórico não está muito grande
    if (history.length > ELO_CONFIG.MAX_HISTORY_ENTRIES) {
        return {
            isValid: false,
            error: `Histórico não pode ter mais de ${ELO_CONFIG.MAX_HISTORY_ENTRIES} entradas`
        };
    }
    
    // Validar estrutura das entradas
    for (let i = 0; i < history.length; i++) {
        const entry = history[i];
        
        if (!entry.date || !entry.eloChange || !entry.newElo || !entry.reason) {
            return {
                isValid: false,
                error: `Entrada ${i + 1} do histórico está incompleta`
            };
        }
        
        // Validar data
        if (isNaN(new Date(entry.date).getTime())) {
            return {
                isValid: false,
                error: `Data da entrada ${i + 1} é inválida`
            };
        }
    }
    
    return { isValid: true };
}

/**
 * Valida parâmetros de consulta de ranking
 * @param {Object} params - Parâmetros da consulta
 * @returns {Object} Resultado da validação
 */
function validateRankingParams(params) {
    const errors = [];
    
    if (params.limit && (typeof params.limit !== 'number' || params.limit < 1 || params.limit > 50)) {
        errors.push('Limite deve ser um número entre 1 e 50');
    }
    
    if (params.offset && (typeof params.offset !== 'number' || params.offset < 0)) {
        errors.push('Offset deve ser um número não negativo');
    }
    
    if (params.minElo && typeof params.minElo !== 'number') {
        errors.push('ELO mínimo deve ser um número');
    }
    
    if (params.maxElo && typeof params.maxElo !== 'number') {
        errors.push('ELO máximo deve ser um número');
    }
    
    if (params.minElo && params.maxElo && params.minElo > params.maxElo) {
        errors.push('ELO mínimo não pode ser maior que ELO máximo');
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

/**
 * Sanitiza uma string para uso em logs
 * @param {string} str - String a ser sanitizada
 * @returns {string} String sanitizada
 */
function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[<>@#&]/g, '').trim().substring(0, 100);
}

module.exports = {
    hasEloPermission,
    validateMatchData,
    validateEloValue,
    validateEloChange,
    validateUserForElo,
    validateEloHistory,
    validateRankingParams,
    sanitizeString
};