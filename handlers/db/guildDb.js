// handlers/db/guildDb.js
// Módulo para interagir com a coleção 'guilds' no banco de dados.
const { ObjectId } = require('mongodb');
const { getDatabaseInstance } = require('../../utils/database');

const guildCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function normalizeGuildData(guild) {
    if (!guild) return guild;
    if (guild._id && (!guild.id || guild.id.toString() !== guild._id.toString())) {
        guild.id = guild._id;
    }
    guild.score = guild.score || {};
    guild.score.wins = typeof guild.score.wins === 'number' ? guild.score.wins : 0;
    guild.score.losses = typeof guild.score.losses === 'number' ? guild.score.losses : 0;
    guild.mainRoster = guild.mainRoster || [];
    guild.subRoster = guild.subRoster || [];
    guild.leader = guild.leader || null;
    if (guild.leader && !guild.leader.id) guild.leader = null;
    guild.coLeader = guild.coLeader || null;
    if (guild.coLeader && !guild.coLeader.id) guild.coLeader = null;
    guild.forumPostId = guild.forumPostId || null;
    return guild;
}

async function loadGuildByName(guildName) {
    const cacheKey = guildName.toLowerCase();
    if (guildCache.has(cacheKey)) {
        const cachedEntry = guildCache.get(cacheKey);
        if (Date.now() - cachedEntry.timestamp < CACHE_TTL) {
            console.log(`[CACHE HIT] Carregando guilda '${guildName}' do cache.`);
            return JSON.parse(JSON.stringify(cachedEntry.data));
        }
    }
    console.log(`[CACHE MISS] Guilda '${guildName}' não encontrada no cache ou expirada. Buscando no DB.`);
    const db = getDatabaseInstance();
    try {
        let guild = await db.collection('guilds').findOne({ name: { $regex: new RegExp(`^${guildName}$`, 'i') } });
        if (guild) {
            guild = normalizeGuildData(guild);
            guildCache.set(cacheKey, { data: guild, timestamp: Date.now() });
        }
        return guild;
    } catch (error) {
        console.error(`❌ Erro ao carregar guilda "${guildName}" por nome no DB:`, error);
        throw error;
    }
}

async function loadGuildById(guildMongoId) {
    const cacheKey = guildMongoId.toString();
    if (guildCache.has(cacheKey)) {
        const cachedEntry = guildCache.get(cacheKey);
        if (Date.now() - cachedEntry.timestamp < CACHE_TTL) {
            console.log(`[CACHE HIT] Carregando guilda por ID '${guildMongoId}' do cache.`);
            return JSON.parse(JSON.stringify(cachedEntry.data));
        }
    }
    console.log(`[CACHE MISS] Guilda por ID '${guildMongoId}' não encontrada no cache ou expirada. Buscando no DB.`);
    const db = getDatabaseInstance();
    try {
        if (!ObjectId.isValid(guildMongoId)) {
            console.warn(`[DB Debug] loadGuildById: ID inválido fornecido: ${guildMongoId}`);
            return null;
        }
        let guild = await db.collection('guilds').findOne({ _id: new ObjectId(guildMongoId) });
        if (guild) {
            guild = normalizeGuildData(guild);
            guildCache.set(cacheKey, { data: guild, timestamp: Date.now() });
        }
        return guild;
    } catch (error) {
        console.error(`❌ Erro ao carregar guilda por ID "${guildMongoId}" no DB:`, error);
        throw error;
    }
}

async function loadAllGuilds() {
    const cacheKey = '__allGuilds__';
    if (guildCache.has(cacheKey)) {
        const cachedEntry = guildCache.get(cacheKey);
        if (Date.now() - cachedEntry.timestamp < CACHE_TTL) {
            console.log(`[CACHE HIT] Carregando todas as guildas do cache.`);
            return JSON.parse(JSON.stringify(cachedEntry.data));
        }
    }
    console.log(`[CACHE MISS] Lista completa de guildas não encontrada no cache ou expirada. Buscando no DB.`);
    const db = getDatabaseInstance();
    try {
        let guilds = await db.collection('guilds').find({}).toArray();
        if (guilds && guilds.length > 0) {
            guilds = guilds.map(normalizeGuildData);
            guildCache.set(cacheKey, { data: guilds, timestamp: Date.now() });
        }
        return guilds;
    } catch (error) {
        console.error("❌ Erro ao carregar todas as guildas do DB:", error);
        throw error;
    }
}

async function saveGuildData(guildData) {
    const db = getDatabaseInstance();
    const documentId = guildData.id || guildData._id;
    const updatePayload = { ...guildData };
    delete updatePayload._id;
    delete updatePayload.id;
    try {
        let result;
        if (documentId) {
            result = await db.collection('guilds').updateOne(
                { _id: documentId },
                { $set: updatePayload },
                { upsert: false }
            );
        } else {
            result = await db.collection('guilds').updateOne(
                { name: guildData.name },
                { $set: updatePayload },
                { upsert: true }
            );
        }
        if (result.upsertedCount > 0 || result.modifiedCount > 0) {
            console.log(`[CACHE INVALIDATED] Cache de guildas limpo devido à atualização/inserção da guilda '${guildData.name}'.`);
            guildCache.clear();
        }
        return guildData;
    } catch (error) {
        console.error("❌ Erro ao salvar/atualizar guilda no DB:", error);
        throw error;
    }
}

async function deleteGuildByName(guildName) {
    const db = getDatabaseInstance();
    try {
        const result = await db.collection('guilds').deleteOne({ name: { $regex: new RegExp(`^${guildName}$`, 'i') } });
        if (result.deletedCount > 0) {
            console.log(`[CACHE INVALIDATED] Cache de guildas limpo devido à deleção da guilda '${guildName}'.`);
            guildCache.clear();
            return true;
        } else {
            return false;
        }
    } catch (error) {
        console.error(`❌ Erro ao deletar guilda "${guildName}" por nome no DB:`, error);
        throw error;
    }
}

async function findGuildByLeader(userId) {
    const db = getDatabaseInstance();
    try {
        const guild = await db.collection('guilds').findOne({
            $or: [
                { 'leader.id': userId },
                { 'coLeader.id': userId },
                { 'mainRoster.id': userId },
                { 'subRoster.id': userId }
            ]
        });
        if (guild) return normalizeGuildData(guild);
        return null; 
    } catch (error) {
        console.error(`❌ Erro ao encontrar guilda para o líder/co-líder ${userId} no DB:`, error);
        throw error; 
    }
}

async function isUserInAnyGuild(userId) {
    const db = getDatabaseInstance();
    try {
        const guild = await db.collection('guilds').findOne({
            $or: [
                { 'leader.id': userId },
                { 'coLeader.id': userId },
                { 'mainRoster.id': userId },
                { 'subRoster.id': userId }
            ]
        });
        if (guild) return normalizeGuildData(guild);
        return null;
    } catch (error) {
        console.error(`❌ Erro ao verificar se o usuário ${userId} está em alguma guilda:`, error);
        throw error;
    }
}

module.exports = {
    loadGuildByName,
    loadGuildById,
    loadAllGuilds,
    saveGuildData,
    deleteGuildByName,
    findGuildByLeader,
    isUserInAnyGuild,
};