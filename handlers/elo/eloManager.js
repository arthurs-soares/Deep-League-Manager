// handlers/elo/eloManager.js
// Gerenciador principal do sistema de ELO

const { loadUserProfile, saveUserProfile } = require('../db/userProfileDb');
const { calculateEloChange, calculateTeamEloChanges, calculateWagerEloChanges, validateEloCooldown } = require('./eloCalculator');
const { getEloRank, checkRankChange } = require('./eloRanks');
const { validateMatchData, validateEloChange, validateUserForElo } = require('./eloValidation');
const { ELO_CONFIG, ELO_CHANGE_REASONS } = require('../../utils/eloConstants');

/**
 * Atualiza o ELO de um jogador individual
 * @param {string} userId - ID do usuário
 * @param {Object} eloChangeData - Dados da mudança de ELO
 * @param {string} operatorId - ID do operador que fez a mudança
 * @param {string} reason - Razão da mudança (opcional)
 * @returns {Promise<Object>} Resultado da atualização
 */
async function updatePlayerElo(userId, eloChangeData, operatorId, reason = null) {
    try {
        // Carregar perfil do usuário
        const userProfile = await loadUserProfile(userId);
        
        // Inicializar dados de ELO se não existirem
        if (!userProfile.eloData) {
            userProfile.eloData = {
                currentElo: ELO_CONFIG.STARTING_ELO,
                peakElo: ELO_CONFIG.STARTING_ELO,
                eloHistory: [],
                mvpCount: 0,
                flawlessWins: 0,
                flawlessLosses: 0,
                lastEloUpdate: null
            };
        }

        const oldElo = userProfile.eloData.currentElo;
        const newElo = eloChangeData.newElo;
        
        // Atualizar ELO atual
        userProfile.eloData.currentElo = newElo;
        
        // Atualizar peak ELO se necessário
        if (newElo > userProfile.eloData.peakElo) {
            userProfile.eloData.peakElo = newElo;
        }
        
        // Atualizar contadores especiais
        if (eloChangeData.details && eloChangeData.details.isMvp) {
            userProfile.eloData.mvpCount++;
        }
        
        if (eloChangeData.details && eloChangeData.details.isFlawless) {
            if (eloChangeData.details.isWinner) {
                userProfile.eloData.flawlessWins++;
            } else {
                userProfile.eloData.flawlessLosses++;
            }
        }
        
        // Adicionar entrada ao histórico
        const historyEntry = {
            matchId: eloChangeData.matchId || `manual_${Date.now()}`,
            date: new Date().toISOString(),
            eloChange: eloChangeData.eloChange,
            newElo: newElo,
            reason: reason || eloChangeData.reason,
            matchResult: eloChangeData.matchResult || null,
            guildName: eloChangeData.guildName || null,
            operatorId: operatorId
        };
        
        // Adicionar ao histórico e manter apenas as últimas entradas
        userProfile.eloData.eloHistory.unshift(historyEntry);
        if (userProfile.eloData.eloHistory.length > ELO_CONFIG.MAX_HISTORY_ENTRIES) {
            userProfile.eloData.eloHistory = userProfile.eloData.eloHistory.slice(0, ELO_CONFIG.MAX_HISTORY_ENTRIES);
        }
        
        // Atualizar timestamp da última atualização
        userProfile.eloData.lastEloUpdate = new Date().toISOString();
        
        // Salvar perfil
        await saveUserProfile(userProfile);
        
        // Verificar mudança de rank
        const rankChange = checkRankChange(oldElo, newElo);
        
        return {
            success: true,
            userId: userId,
            oldElo: oldElo,
            newElo: newElo,
            eloChange: eloChangeData.eloChange,
            rankChange: rankChange,
            newRank: getEloRank(newElo),
            historyEntry: historyEntry
        };
        
    } catch (error) {
        console.error(`Erro ao atualizar ELO do jogador ${userId}:`, error);
        return {
            success: false,
            error: error.message,
            userId: userId
        };
    }
}

/**
 * Processa o resultado de uma partida completa
 * @param {Object} matchData - Dados da partida
 * @param {string} operatorId - ID do operador
 * @returns {Promise<Object>} Resultado do processamento
 */
async function processMatchResult(matchData, operatorId) {
    try {
        // Validar dados da partida
        const validation = validateMatchData(matchData);
        if (!validation.isValid) {
            return {
                success: false,
                errors: validation.errors
            };
        }

        const results = {
            success: true,
            matchId: matchData.threadId || `match_${Date.now()}`,
            updates: [],
            errors: []
        };

        // Processar time vencedor
        if (matchData.winnerPlayers && matchData.winnerPlayers.length > 0) {
            const winnerResults = await processTeamElo({
                players: matchData.winnerPlayers,
                mvpUserId: matchData.winnerMvp,
                isWinnerTeam: true,
                matchResult: matchData.result,
                guildName: matchData.winnerTeam,
                matchId: results.matchId,
                operatorId: operatorId
            });
            
            results.updates.push(...winnerResults.updates);
            results.errors.push(...winnerResults.errors);
        }

        // Processar time perdedor
        if (matchData.loserPlayers && matchData.loserPlayers.length > 0) {
            const loserResults = await processTeamElo({
                players: matchData.loserPlayers,
                mvpUserId: matchData.loserMvp,
                isWinnerTeam: false,
                matchResult: matchData.result,
                guildName: matchData.loserTeam,
                matchId: results.matchId,
                operatorId: operatorId
            });
            
            results.updates.push(...loserResults.updates);
            results.errors.push(...loserResults.errors);
        }

        // Log da partida processada
        console.log(`[ELO] Partida processada: ${results.matchId}, ${results.updates.length} jogadores atualizados`);

        return results;

    } catch (error) {
        console.error('Erro ao processar resultado da partida:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Processa ELO para um time inteiro
 * @param {Object} teamData - Dados do time
 * @returns {Promise<Object>} Resultado do processamento
 */
async function processTeamElo({ players, mvpUserId, isWinnerTeam, matchResult, guildName, matchId, operatorId, specificPlayerIds = null }) {
    const results = {
        updates: [],
        errors: []
    };

    try {
        // Carregar ELOs atuais dos jogadores
        const playersWithElo = [];
        for (const player of players) {
            // Se specificPlayerIds for fornecido, verificar se este jogador está na lista
            if (specificPlayerIds && !specificPlayerIds.includes(player.userId)) {
                continue; // Pular jogadores que não estão na lista específica
            }
            
            try {
                const userProfile = await loadUserProfile(player.userId);
                const currentElo = userProfile.eloData?.currentElo || ELO_CONFIG.STARTING_ELO;
                
                playersWithElo.push({
                    userId: player.userId,
                    currentElo: currentElo
                });
            } catch (error) {
                results.errors.push(`Erro ao carregar ELO de ${player.userId}: ${error.message}`);
            }
        }

        // Calcular mudanças de ELO para o time
        const eloChanges = calculateTeamEloChanges({
            players: playersWithElo,
            mvpUserId: mvpUserId,
            isWinnerTeam: isWinnerTeam,
            matchResult: matchResult
        });

        // Aplicar mudanças individuais
        for (const change of eloChanges) {
            // Adicionar informações extras ao objeto de mudança
            change.guildName = guildName;
            change.matchId = matchId;

            // Atualizar ELO do jogador
            const updateResult = await updatePlayerElo(change.userId, change, operatorId);
            
            if (updateResult.success) {
                results.updates.push(updateResult);
            } else {
                results.errors.push(`Erro ao atualizar ${change.userId}: ${updateResult.error}`);
            }
        }

    } catch (error) {
        results.errors.push(`Erro geral no processamento do time: ${error.message}`);
    }

    return results;
}

/**
 * Aplica mudança manual de ELO
 * @param {string} userId - ID do usuário
 * @param {number} eloChange - Mudança de ELO
 * @param {string} operatorId - ID do operador
 * @param {string} reason - Razão da mudança
 * @returns {Promise<Object>} Resultado da operação
 */
async function applyManualEloChange(userId, eloChange, operatorId, reason = 'Ajuste manual') {
    try {
        const userProfile = await loadUserProfile(userId);
        const currentElo = userProfile.eloData?.currentElo || ELO_CONFIG.STARTING_ELO;
        
        // Validar mudança
        const validation = validateEloChange(currentElo, eloChange);
        if (!validation.isValid) {
            return {
                success: false,
                error: validation.error
            };
        }

        const newElo = Math.max(ELO_CONFIG.MIN_ELO, 
                       Math.min(ELO_CONFIG.MAX_ELO, currentElo + eloChange));

        const manualChangeData = {
            oldElo: currentElo,
            eloChange: eloChange,
            newElo: newElo,
            reason: ELO_CHANGE_REASONS.MANUAL_ADJUSTMENT,
            details: {}
        };

        return await updatePlayerElo(userId, manualChangeData, operatorId, reason);

    } catch (error) {
        console.error(`Erro ao aplicar mudança manual para ${userId}:`, error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Define ELO diretamente (comando admin)
 * @param {string} userId - ID do usuário
 * @param {number} newElo - Novo ELO
 * @param {string} operatorId - ID do operador
 * @param {string} reason - Razão da mudança
 * @returns {Promise<Object>} Resultado da operação
 */
async function setPlayerElo(userId, newElo, operatorId, reason = 'Definição administrativa') {
    try {
        const userProfile = await loadUserProfile(userId);
        const currentElo = userProfile.eloData?.currentElo || ELO_CONFIG.STARTING_ELO;
        
        const eloChange = newElo - currentElo;

        const setChangeData = {
            oldElo: currentElo,
            eloChange: eloChange,
            newElo: newElo,
            reason: ELO_CHANGE_REASONS.ADMIN_SET,
            details: {}
        };

        return await updatePlayerElo(userId, setChangeData, operatorId, reason);

    } catch (error) {
        console.error(`Erro ao definir ELO para ${userId}:`, error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Reseta o ELO de um jogador
 * @param {string} userId - ID do usuário
 * @param {string} operatorId - ID do operador
 * @param {string} reason - Razão do reset
 * @returns {Promise<Object>} Resultado da operação
 */
async function resetPlayerElo(userId, operatorId, reason = 'Reset administrativo') {
    return await setPlayerElo(userId, ELO_CONFIG.STARTING_ELO, operatorId, reason);
}

/**
 * Desfaz a última mudança de ELO de um jogador
 * @param {string} userId - ID do usuário
 * @param {string} operatorId - ID do operador
 * @returns {Promise<Object>} Resultado da operação
 */
async function undoLastEloChange(userId, operatorId) {
    try {
        const userProfile = await loadUserProfile(userId);
        
        if (!userProfile.eloData || !userProfile.eloData.eloHistory || userProfile.eloData.eloHistory.length === 0) {
            return {
                success: false,
                error: 'Nenhum histórico de ELO encontrado para desfazer'
            };
        }

        const lastEntry = userProfile.eloData.eloHistory[0];
        const previousElo = lastEntry.newElo - lastEntry.eloChange;
        
        const undoChange = lastEntry.eloChange * -1;

        const undoChangeData = {
            oldElo: userProfile.eloData.currentElo,
            eloChange: undoChange,
            newElo: previousElo,
            reason: 'Desfazer última mudança',
            details: {}
        };

        const result = await updatePlayerElo(userId, undoChangeData, operatorId, `Desfazer: ${lastEntry.reason}`);
        
        if (result.success) {
            console.log(`[ELO] Última mudança desfeita para ${userId}: ${lastEntry.eloChange} -> ${undoChange}`);
        }

        return result;

    } catch (error) {
        console.error(`Erro ao desfazer última mudança para ${userId}:`, error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Processa o resultado de um wager (1v1)
 * @param {Object} wagerData - Dados do wager
 * @param {string} wagerData.winnerId - ID do jogador vencedor
 * @param {string} wagerData.loserId - ID do jogador perdedor
 * @param {boolean} wagerData.isWipe - Se foi um wipe completo
 * @param {string} wagerData.guildName - Nome da guilda (opcional)
 * @param {string} operatorId - ID do operador
 * @returns {Promise<Object>} Resultado do processamento
 */
async function processWagerResult(wagerData, operatorId) {
    try {
        // Validar dados do wager
        if (!wagerData.winnerId || !wagerData.loserId) {
            return {
                success: false,
                errors: ['IDs de vencedor e perdedor são obrigatórios']
            };
        }
        
        // Carregar perfis dos jogadores
        const winnerProfile = await loadUserProfile(wagerData.winnerId);
        const loserProfile = await loadUserProfile(wagerData.loserId);
        
        const winnerElo = winnerProfile.eloData?.currentElo || ELO_CONFIG.STARTING_ELO;
        const loserElo = loserProfile.eloData?.currentElo || ELO_CONFIG.STARTING_ELO;
        
        // Calcular mudanças de ELO
        const { winnerChange, loserChange } = calculateWagerEloChanges({
            winnerElo,
            loserElo,
            isWipe: wagerData.isWipe
        });
        
        const results = {
            success: true,
            matchId: `wager_${Date.now()}`,
            updates: [],
            errors: []
        };
        
        // Atualizar ELO do vencedor
        winnerChange.matchId = results.matchId;
        winnerChange.guildName = wagerData.guildName || null;
        
        const winnerResult = await updatePlayerElo(wagerData.winnerId, winnerChange, operatorId);
        if (winnerResult.success) {
            results.updates.push(winnerResult);
        } else {
            results.errors.push(`Erro ao atualizar vencedor: ${winnerResult.error}`);
        }
        
        // Atualizar ELO do perdedor
        loserChange.matchId = results.matchId;
        loserChange.guildName = wagerData.guildName || null;
        
        const loserResult = await updatePlayerElo(wagerData.loserId, loserChange, operatorId);
        if (loserResult.success) {
            results.updates.push(loserResult);
        } else {
            results.errors.push(`Erro ao atualizar perdedor: ${loserResult.error}`);
        }
        
        // Log do wager processado
        console.log(`[ELO] Wager processado: ${results.matchId}, ${results.updates.length} jogadores atualizados`);
        
        return results;
        
    } catch (error) {
        console.error('Erro ao processar resultado do wager:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    updatePlayerElo,
    processMatchResult,
    processTeamElo,
    processWagerResult,
    applyManualEloChange,
    setPlayerElo,
    resetPlayerElo,
    undoLastEloChange
};