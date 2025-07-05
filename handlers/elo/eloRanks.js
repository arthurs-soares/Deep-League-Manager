// handlers/elo/eloRanks.js
// Gerenciamento de ranks baseados no sistema ELO

const { ELO_RANKS } = require('../../utils/eloConstants');

/**
 * Determina o rank de um jogador baseado no seu ELO atual
 * @param {number} elo - ELO atual do jogador
 * @returns {Object} Informações do rank (name, emoji, color, min, max)
 */
function getEloRank(elo) {
    // Garantir que o ELO é um número válido
    if (typeof elo !== 'number' || isNaN(elo)) {
        elo = 0;
    }

    // Verificar cada rank em ordem crescente
    for (const [key, rank] of Object.entries(ELO_RANKS)) {
        if (elo >= rank.min && elo <= rank.max) {
            return {
                key: key,
                name: rank.name,
                emoji: rank.emoji,
                color: rank.color,
                min: rank.min,
                max: rank.max,
                progress: calculateRankProgress(elo, rank)
            };
        }
    }

    // Fallback para Rank D se algo der errado
    return {
        key: 'RANK_D',
        name: ELO_RANKS.RANK_D.name,
        emoji: ELO_RANKS.RANK_D.emoji,
        color: ELO_RANKS.RANK_D.color,
        min: ELO_RANKS.RANK_D.min,
        max: ELO_RANKS.RANK_D.max,
        progress: 0
    };
}

/**
 * Calcula o progresso dentro do rank atual
 * @param {number} elo - ELO atual
 * @param {Object} rank - Informações do rank
 * @returns {number} Progresso de 0 a 100
 */
function calculateRankProgress(elo, rank) {
    if (rank.max === Infinity) {
        // Para Grandmaster, mostrar progresso baseado em marcos de 100 ELO
        const baseProgress = ((elo - rank.min) % 100) / 100;
        return Math.round(baseProgress * 100);
    }
    
    const rankRange = rank.max - rank.min + 1;
    const currentProgress = elo - rank.min;
    return Math.round((currentProgress / rankRange) * 100);
}

/**
 * Retorna o próximo rank baseado no ELO atual
 * @param {number} elo - ELO atual
 * @returns {Object|null} Próximo rank ou null se já estiver no máximo
 */
function getNextRank(elo) {
    const currentRank = getEloRank(elo);
    const ranks = Object.values(ELO_RANKS);
    
    // Encontrar o índice do rank atual
    const currentIndex = ranks.findIndex(rank => rank.name === currentRank.name);
    
    // Se não é o último rank, retornar o próximo
    if (currentIndex < ranks.length - 1) {
        const nextRank = ranks[currentIndex + 1];
        return {
            name: nextRank.name,
            emoji: nextRank.emoji,
            color: nextRank.color,
            requiredElo: nextRank.min,
            eloToNext: nextRank.min - elo
        };
    }
    
    return null; // Já está no rank máximo
}

/**
 * Formata as informações do rank para exibição
 * @param {number} elo - ELO atual
 * @returns {string} String formatada do rank
 */
function formatRankDisplay(elo) {
    const rank = getEloRank(elo);
    return `${rank.emoji} **${rank.name}** (${elo} ELO)`;
}

/**
 * Retorna todos os ranks disponíveis ordenados
 * @returns {Array} Array com todos os ranks
 */
function getAllRanks() {
    return Object.values(ELO_RANKS).sort((a, b) => a.min - b.min);
}

/**
 * Verifica se um ELO resultaria em promoção de rank
 * @param {number} oldElo - ELO anterior
 * @param {number} newElo - Novo ELO
 * @returns {Object} Informações sobre promoção/rebaixamento
 */
function checkRankChange(oldElo, newElo) {
    const oldRank = getEloRank(oldElo);
    const newRank = getEloRank(newElo);
    
    if (oldRank.name !== newRank.name) {
        const isPromotion = newElo > oldElo;
        return {
            changed: true,
            type: isPromotion ? 'promotion' : 'demotion',
            oldRank: oldRank,
            newRank: newRank,
            message: isPromotion 
                ? `🎉 **PROMOÇÃO!** ${oldRank.emoji} ${oldRank.name} → ${newRank.emoji} ${newRank.name}`
                : `📉 **Rebaixamento** ${oldRank.emoji} ${oldRank.name} → ${newRank.emoji} ${newRank.name}`
        };
    }
    
    return {
        changed: false,
        type: null,
        oldRank: oldRank,
        newRank: newRank,
        message: null
    };
}

/**
 * Gera uma barra de progresso visual para o rank
 * @param {number} elo - ELO atual
 * @returns {string} Barra de progresso em formato texto
 */
function generateProgressBar(elo) {
    const rank = getEloRank(elo);
    const progress = rank.progress;
    const filledBars = Math.floor(progress / 10);
    const emptyBars = 10 - filledBars;
    
    const progressChar = '█';
    const emptyChar = '░';
    
    return `${progressChar.repeat(filledBars)}${emptyChar.repeat(emptyBars)} ${progress}%`;
}

module.exports = {
    getEloRank,
    calculateRankProgress,
    getNextRank,
    formatRankDisplay,
    getAllRanks,
    checkRankChange,
    generateProgressBar
};