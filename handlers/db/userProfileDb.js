// handlers/db/userProfileDb.js
const { getDatabaseInstance } = require('../../utils/database');

// Estrutura padrão de um perfil de usuário
const defaultProfile = {
    bio: null,
    bannerUrl: null,
    color: null,
    achievements: [],
    guildHistory: [],
    personalScore: { wins: 0, losses: 0 },
    // Sistema de ELO
    eloData: {
        currentElo: 1000,        // ELO atual (iniciando em 1000 - Rank A)
        peakElo: 1000,          // Maior ELO já alcançado
        eloHistory: [],         // Histórico de mudanças
        mvpCount: 0,            // Número total de MVPs
        flawlessWins: 0,        // Número de vitórias flawless
        flawlessLosses: 0,      // Número de derrotas flawless
        lastEloUpdate: null     // Data da última atualização
    }
};

/**
 * Carrega o perfil de um usuário pelo seu ID do Discord.
 * @param {string} userId - O ID do usuário do Discord.
 * @returns {Promise<Object>} O perfil do usuário, mesclado com o padrão se não existir.
 */
async function loadUserProfile(userId) {
    const db = getDatabaseInstance();
    try {
        let profile = await db.collection('user_profiles').findOne({ _id: userId });
        // Se o perfil não existe, retorna o padrão, mas não salva ainda.
        // O perfil só será criado no DB quando for salvo pela primeira vez.
        if (!profile) {
            return { _id: userId, ...defaultProfile };
        }
        // Garante que o perfil carregado tenha todos os campos padrão.
        return { ...defaultProfile, ...profile };
    } catch (error) {
        console.error(`❌ Erro ao carregar perfil de usuário "${userId}" do DB:`, error);
        throw error;
    }
}

/**
 * Salva ou atualiza os dados do perfil de um usuário.
 * @param {Object} profileData - O objeto de perfil a ser salvo. Deve conter _id.
 * @returns {Promise<Object>} O resultado da operação de salvamento.
 */
async function saveUserProfile(profileData) {
    const db = getDatabaseInstance();
    const userId = profileData._id;

    if (!userId) {
        throw new Error("Não é possível salvar um perfil de usuário sem um _id (userId).");
    }

    // Pega todos os dados exceto o _id para o $set
    const { _id, ...dataToSet } = profileData;

    try {
        const result = await db.collection('user_profiles').updateOne(
            { _id: userId },
            { $set: dataToSet },
            { upsert: true } // Cria o documento se ele não existir
        );
        console.log(`[DB] Perfil do usuário ${userId} salvo com sucesso.`);
        return result;
    } catch (error) {
        console.error(`❌ Erro ao salvar perfil de usuário "${userId}" no DB:`, error);
        throw error;
    }
}

module.exports = {
    loadUserProfile,
    saveUserProfile,
};