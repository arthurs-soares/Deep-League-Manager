// handlers/db/teamDb.js
// Módulo para interagir com a coleção 'teams' no banco de dados.
const { ObjectId } = require('mongodb');
const { getDatabaseInstance } = require('../../utils/database');

const teamCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// Estrutura de dados de um Time
function normalizeTeamData(team) {
    if (!team) return team;
    if (team._id && (!team.id || team.id.toString() !== team._id.toString())) {
        team.id = team._id;
    }
    team.score = team.score || {};
    team.score.wins = typeof team.score.wins === 'number' ? team.score.wins : 0;
    team.score.losses = typeof team.score.losses === 'number' ? team.score.losses : 0;
    team.roster = team.roster || [];
    team.leader = team.leader || null;
    if (team.leader && !team.leader.id) team.leader = null;
    return team;
}

async function loadTeamByName(teamName) {
    const cacheKey = teamName.toLowerCase();
    if (teamCache.has(cacheKey)) {
        const cachedEntry = teamCache.get(cacheKey);
        if (Date.now() - cachedEntry.timestamp < CACHE_TTL) {
            return JSON.parse(JSON.stringify(cachedEntry.data));
        }
    }
    const db = getDatabaseInstance();
    try {
        let team = await db.collection('teams').findOne({ name: { $regex: new RegExp(`^${teamName}$`, 'i') } });
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
    const db = getDatabaseInstance();
    try {
        const team = await db.collection('teams').findOne({ 'leader.id': userId });
        if (team) return normalizeTeamData(team);
        return null;
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
    const db = getDatabaseInstance();
    try {
        let teams = await db.collection('teams').find({}).toArray();
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

async function saveTeamData(teamData) {
    const db = getDatabaseInstance();
    const documentId = teamData.id || teamData._id;
    const updatePayload = { ...teamData };
    delete updatePayload._id;
    delete updatePayload.id;
    try {
        let result;
        if (documentId) {
            result = await db.collection('teams').updateOne(
                { _id: documentId },
                { $set: updatePayload },
                { upsert: false }
            );
        } else {
            result = await db.collection('teams').updateOne(
                { name: teamData.name },
                { $set: updatePayload },
                { upsert: true }
            );
        }
        if (result.upsertedCount > 0 || result.modifiedCount > 0) {
            teamCache.clear();
        }
        return teamData;
    } catch (error) {
        console.error("❌ Erro ao salvar/atualizar time no DB:", error);
        throw error;
    }
}

async function deleteTeamByName(teamName) {
    const db = getDatabaseInstance();
    try {
        const result = await db.collection('teams').deleteOne({ name: { $regex: new RegExp(`^${teamName}$`, 'i') } });
        if (result.deletedCount > 0) {
            teamCache.clear();
            return true;
        }
        return false;
    } catch (error) {
        console.error(`❌ Erro ao deletar time "${teamName}" por nome no DB:`, error);
        throw error;
    }
}

async function isUserInAnyTeam(userId) {
    const db = getDatabaseInstance();
    try {
        const team = await db.collection('teams').findOne({
            $or: [
                { 'leader.id': userId },
                { 'roster.id': userId }
            ]
        });
        if (team) return normalizeTeamData(team);
        return null;
    } catch (error) {
        console.error(`❌ Erro ao verificar se o usuário ${userId} está em algum time:`, error);
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