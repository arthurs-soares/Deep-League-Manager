// utils/eloConstants.js
// Constantes e configurações para o sistema de ELO

/**
 * Multiplicadores para diferença de ranks
 * Aplicados quando jogadores de ranks muito diferentes se enfrentam
 */
const RANK_DIFFERENCE_MULTIPLIERS = {
    // Quando um jogador de rank muito superior perde para um de rank inferior
    UPSET_LOSS: {
        EXTREME: 1.5,    // Ex: Grandmaster perdendo para Rank D (4+ ranks de diferença)
        MAJOR: 1.3,      // Ex: Rank A+ perdendo para Rank C (3 ranks de diferença)
        MODERATE: 1.15   // Ex: Rank A perdendo para Rank D (2 ranks de diferença)
    },
    // Quando um jogador de rank inferior vence um de rank muito superior
    UPSET_WIN: {
        EXTREME: 1.5,    // Ex: Rank D vencendo Grandmaster (4+ ranks de diferença)
        MAJOR: 1.3,      // Ex: Rank C vencendo Rank A+ (3 ranks de diferença)
        MODERATE: 1.15   // Ex: Rank D vencendo Rank A (2 ranks de diferença)
    }
};

/**
 * Definição dos ranks baseados no ELO
 */
const ELO_RANKS = {
    RANK_D: {
        name: 'Rank D',
        min: 0,
        max: 299,
        emoji: '🔸',
        color: '#8B4513'
    },
    RANK_C: {
        name: 'Rank C',
        min: 300,
        max: 699,
        emoji: '🥉',
        color: '#CD7F32'
    },
    RANK_B: {
        name: 'Rank B',
        min: 700,
        max: 999,
        emoji: '🥈',
        color: '#C0C0C0'
    },
    RANK_A: {
        name: 'Rank A',
        min: 1000,
        max: 1499,
        emoji: '🥇',
        color: '#FFD700'
    },
    RANK_A_PLUS: {
        name: 'Rank A+',
        min: 1500,
        max: 1999,
        emoji: '💎',
        color: '#E5E4E2'
    },
    GRANDMASTER: {
        name: 'Grandmaster',
        min: 2000,
        max: Infinity,
        emoji: '👑',
        color: '#FF1493'
    }
};

/**
 * Multiplicadores de ELO baseados no rank atual
 */
const ELO_MULTIPLIERS = {
    LOW: {
        min: 0,
        max: 699,
        gainMultiplier: 1.2,
        lossMultiplier: 0.8
    },
    MEDIUM: {
        min: 700,
        max: 1499,
        gainMultiplier: 1.0,
        lossMultiplier: 1.0
    },
    HIGH: {
        min: 1500,
        max: Infinity,
        gainMultiplier: 0.8,
        lossMultiplier: 1.2
    }
};

/**
 * Valores base para cálculo de ELO
 */
const ELO_BASE_VALUES = {
    // Vitória Normal (2-1)
    VICTORY_MVP_NORMAL: { min: 25, max: 35 },
    VICTORY_NORMAL: { min: 15, max: 20 },
    
    // Vitória Flawless (2-0)
    VICTORY_MVP_FLAWLESS: { min: 35, max: 50 },
    VICTORY_NORMAL_FLAWLESS: { min: 20, max: 30 },
    
    // Derrota Normal (1-2)
    DEFEAT_MVP_NORMAL: { min: -10, max: -5 },
    DEFEAT_NORMAL: { min: -20, max: -10 },
    
    // Derrota Flawless (0-2)
    DEFEAT_MVP_FLAWLESS: { min: -15, max: -10 },
    DEFEAT_NORMAL_FLAWLESS: { min: -25, max: -15 },
    
    // Wagers (1v1)
    WAGER_WIN: { min: 20, max: 30 },
    WAGER_WIPE_WIN: { min: 30, max: 45 },
    WAGER_LOSS: { min: -30, max: -20 },
    WAGER_WIPE_LOSS: { min: -45, max: -30 }
};

/**
 * Configurações gerais do sistema
 */
const ELO_CONFIG = {
    STARTING_ELO: 800,
    MIN_ELO: 0,
    MAX_ELO: 3000,
    COOLDOWN_HOURS: 0, // Desabilitado - sem cooldown
    MAX_HISTORY_ENTRIES: 50
};

/**
 * Tipos de razão para mudanças de ELO
 */
const ELO_CHANGE_REASONS = {
    VICTORY_MVP: 'victory_mvp',
    VICTORY_NORMAL: 'victory_normal',
    VICTORY_MVP_FLAWLESS: 'victory_mvp_flawless',
    VICTORY_NORMAL_FLAWLESS: 'victory_normal_flawless',
    DEFEAT_MVP: 'defeat_mvp',
    DEFEAT_NORMAL: 'defeat_normal',
    DEFEAT_MVP_FLAWLESS: 'defeat_mvp_flawless',
    DEFEAT_NORMAL_FLAWLESS: 'defeat_normal_flawless',
    WAGER_WIN: 'wager_win',
    WAGER_WIPE_WIN: 'wager_wipe_win',
    WAGER_LOSS: 'wager_loss',
    WAGER_WIPE_LOSS: 'wager_wipe_loss',
    MANUAL_ADJUSTMENT: 'manual_adjustment',
    ADMIN_SET: 'admin_set',
    RESET: 'reset'
};

/**
 * Resultados possíveis de partida
 */
const MATCH_RESULTS = {
    FLAWLESS_WIN: '2-0',
    NORMAL_WIN: '2-1',
    NORMAL_LOSS: '1-2',
    FLAWLESS_LOSS: '0-2',
    WAGER_WIN: 'wager_win',
    WAGER_WIPE_WIN: 'wager_wipe_win',
    WAGER_LOSS: 'wager_loss',
    WAGER_WIPE_LOSS: 'wager_wipe_loss'
};

module.exports = {
    ELO_RANKS,
    ELO_MULTIPLIERS,
    ELO_BASE_VALUES,
    ELO_CONFIG,
    ELO_CHANGE_REASONS,
    MATCH_RESULTS,
    RANK_DIFFERENCE_MULTIPLIERS
};