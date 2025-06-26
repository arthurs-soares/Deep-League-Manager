// handlers/db/teamDb.js
// Módulo para interagir com a coleção 'teams' no banco de dados.

const { ObjectId } = require('mongodb');
// ✅ CORREÇÃO: Importação padronizada e com caminho correto
const { getDb } = require('../../utils/database');

const teamCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos de cache

// Função para normalizar dados (sem alterações)
function normalizeTeamData(team) {
    if (!team) return null;
    if (team._id) {
        team.id = team._id.toString(); // Garante que id seja uma string
    }
    team.score = team.score || { wins: 0, losses: 0 };
    team.roster = team.roster || [];
    return team;
}

// --- Funções de Leitura ---

async function loadTeamByName(teamName) {
    const cacheKey = teamName.toLowerCase();
    if (teamCache.has(cacheKey)) {
        const cachedEntry = teamCache.get(cacheKey);
        if (Date.now() - cachedEntry.timestamp < CACHE_TTL) {
            return JSON.parse(JSON.stringify(cachedEntry.data));
        }
    }
    // ✅ CORREÇÃO: Usa getDb() de forma consistente
    const teamsCollection = getDb().collection('teams');
    try {
        let team = await teamsCollection.findOne({ name: { $regex: new RegExp(`^${teamName}$`, 'i') } });
        if (team) {
            team = normalizeTeamData(team);
            teamCache.set(cacheKey, { data: team, timestamp: Date.now() });
        }
        return team;
    } catch (error) {
        console.error(`❌ Erro ao carregar time "${teamName}" por nome no DB:`, error);
        throw error;
    }
}

async function findTeamByLeader(userId) {
    // ✅ CORREÇÃO: Usa getDb() de forma consistente
    const teamsCollection = getDb().collection('teams');
    try {
        const team = await teamsCollection.findOne({ 'leader.id': userId });
        return normalizeTeamData(team);
    } catch (error) {
        console.error(`❌ Erro ao buscar time por líder (ID: ${userId}):`, error);
        throw error;
    }
}

async function loadAllTeams() {
    const cacheKey = '__allTeams__';
    if (teamCache.has(cacheKey)) {
        const cachedEntry = teamCache.get(cacheKey);
        if (Date.now() - cachedEntry.timestamp < CACHE_TTL) {
            return JSON.parse(JSON.stringify(cachedEntry.data));
        }
    }
    // ✅ CORREÇÃO: Usa getDb() de forma consistente
    const teamsCollection = getDb().collection('teams');
    try {
        let teams = await teamsCollection.find({}).toArray();
        if (teams && teams.length > 0) {
            teams = teams.map(normalizeTeamData);
            teamCache.set(cacheKey, { data: teams, timestamp: Date.now() });
        }
        return teams;
    } catch (error) {
        console.error("❌ Erro ao carregar todos os times do DB:", error);
        throw error;
    }
}

async function isUserInAnyTeam(userId) {
    // ✅ CORREÇÃO: Usa getDb() de forma consistente
    const teamsCollection = getDb().collection('teams');
    try {
        const team = await teamsCollection.findOne({
            $or: [
                { 'leader.id': userId },
                { 'roster.id': userId }
            ]
        });
        return normalizeTeamData(team);
    } catch (error) {
        console.error(`❌ Erro ao verificar se o usuário ${userId} está em algum time:`, error);
        throw error;
    }
}

// --- Funções de Escrita ---

async function saveTeamData(teamData) {
    const teamsCollection = getDb().collection('teams');
    const documentId = teamData._id || teamData.id; // Aceita _id ou id

    // Remove as propriedades de ID do payload de atualização para evitar erros
    const { _id, id, ...updatePayload } = teamData;
    
    try {
        let result;
        if (documentId) {
            // Se tem ID, atualiza o documento existente
            result = await teamsCollection.replaceOne(
                { _id: new ObjectId(documentId) },
                updatePayload,
                { upsert: false }
            );
        } else {
            // Se não tem ID, é um novo time, então insere
            result = await teamsCollection.insertOne(teamData);
            if (result.insertedId) {
                teamData._id = result.insertedId; // Adiciona o _id gerado ao objeto original
            }
        }
        
        // Limpa o cache após qualquer modificação
        teamCache.clear();
        return teamData;
    } catch (error) {
        console.error("❌ Erro ao salvar/atualizar time no DB:", error);
        throw error;
    }
}

async function deleteTeamByName(name) {
    const teamsCollection = getDb().collection('teams');
    try {
        const result = await teamsCollection.deleteOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
        if (result.deletedCount > 0) {
            teamCache.clear(); // Limpa o cache após a deleção
        }
        return result.deletedCount > 0;
    } catch (error) {
        console.error(`❌ Erro ao deletar time "${name}":`, error);
        throw error;
    }
}

module.exports = {
    loadTeamByName,
    loadAllTeams,
    saveTeamData,
    deleteTeamByName,
    isUserInAnyTeam,
    findTeamByLeader,
};