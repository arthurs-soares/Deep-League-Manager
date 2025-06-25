// handlers/db/guildDb.js
// Módulo para interagir com a coleção 'guilds' no banco de dados.
const { ObjectId } = require('mongodb');
const { getDatabaseInstance } = require('../../utils/database');

// <-- NOVO: Início da configuração do Cache -->
const guildCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos em milissegundos
// <-- FIM: Fim da configuração do Cache -->


/**
 * Normaliza os dados de uma guilda, garantindo que campos essenciais existam e tenham tipos corretos.
 * Útil para garantir a consistência dos dados após carregá-los do DB.
 * @param {Object} guild - O objeto da guilda.
 * @returns {Object} O objeto da guilda com dados normalizados.
 */
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

/**
 * Carrega os dados de uma guilda pelo seu nome (case-insensitive).
 * @param {string} guildName - O nome da guilda a ser carregada.
 * @returns {Promise<Object|null>} Os dados da guilda, ou null se não for encontrada.
 */
async function loadGuildByName(guildName) {
    // <-- NOVO: Lógica de verificação do Cache -->
    const cacheKey = guildName.toLowerCase();
    if (guildCache.has(cacheKey)) {
        const cachedEntry = guildCache.get(cacheKey);
        // Verifica se o cache não expirou
        if (Date.now() - cachedEntry.timestamp < CACHE_TTL) {
            console.log(`[CACHE HIT] Carregando guilda '${guildName}' do cache.`);
            // Retorna uma cópia profunda para evitar mutações acidentais no objeto do cache
            return JSON.parse(JSON.stringify(cachedEntry.data));
        }
    }
    console.log(`[CACHE MISS] Guilda '${guildName}' não encontrada no cache ou expirada. Buscando no DB.`);

    const db = getDatabaseInstance();
    try {
        let guild = await db.collection('guilds').findOne({ name: { $regex: new RegExp(`^${guildName}$`, 'i') } });
        
        if (guild) {
            guild = normalizeGuildData(guild);
            // <-- NOVO: Armazena o resultado do DB no cache -->
            guildCache.set(cacheKey, { data: guild, timestamp: Date.now() });
        }

        return guild;
    } catch (error) {
        console.error(`❌ Erro ao carregar guilda "${guildName}" por nome no DB:`, error);
        throw error;
    }
}

/**
 * Carrega os dados de uma guilda pelo seu ID do MongoDB.
 * @param {string} guildMongoId - O ID da guilda no formato string.
 * @returns {Promise<Object|null>} Os dados da guilda, ou null se não for encontrada ou ID inválido.
 */
async function loadGuildById(guildMongoId) {
    // <-- NOVO: Lógica de cache para busca por ID -->
    const cacheKey = guildMongoId.toString(); // ID já é uma chave única
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
            // <-- NOVO: Armazena o resultado do DB no cache -->
            guildCache.set(cacheKey, { data: guild, timestamp: Date.now() });
        }
        return guild;
    } catch (error) {
        console.error(`❌ Erro ao carregar guilda por ID "${guildMongoId}" no DB:`, error);
        throw error;
    }
}

/**
 * Carrega todas as guildas registradas no banco de dados.
 * @returns {Promise<Array<Object>>} Um array contendo os dados de todas as guildas.
 */
async function loadAllGuilds() {
    // <-- NOVO: Lógica de cache para a lista completa de guildas -->
    const cacheKey = '__allGuilds__'; // Chave especial para a lista completa
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
            // <-- NOVO: Armazena a lista completa no cache -->
            guildCache.set(cacheKey, { data: guilds, timestamp: Date.now() });
        }

        return guilds;
    } catch (error) {
        console.error("❌ Erro ao carregar todas as guildas do DB:", error);
        throw error;
    }
}

/**
 * Salva ou atualiza os dados de uma guilda no banco de dados.
 * @param {Object} guildData - O objeto da guilda a ser salvo/atualizado.
 * @returns {Promise<Object>} Os dados da guilda salvos.
 */
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

        // <-- NOVO: Invalidação de Cache -->
        // Se qualquer dado for alterado, o cache precisa ser limpo para garantir consistência.
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

/**
 * Deleta uma guilda do banco de dados pelo seu nome.
 * @param {string} guildName - O nome da guilda a ser deletada.
 * @returns {Promise<boolean>} True se a guilda foi deletada, false caso contrário.
 */
async function deleteGuildByName(guildName) {
    const db = getDatabaseInstance();
    try {
        const result = await db.collection('guilds').deleteOne({ name: { $regex: new RegExp(`^${guildName}$`, 'i') } });
        
        // <-- NOVO: Invalidação de Cache -->
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

/**
 * Encontra uma guilda onde um usuário específico é líder, co-líder ou membro.
 * @param {string} userId - O ID do usuário a ser verificado.
 * @returns {Promise<Object|null>} A guilda encontrada, ou null se o usuário não estiver em nenhuma guilda.
 */
async function findGuildByLeader(userId) {
    // Esta função consulta por um campo que não é uma chave primária de cache comum (userId).
    // Implementar um cache para esta função seria mais complexo (ex: um cache secundário por userId).
    // Por enquanto, deixaremos sem cache para manter a simplicidade, pois não é chamada com tanta frequência quanto as outras.
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

        if (guild) {
            return normalizeGuildData(guild);
        }
        return null; 
    } catch (error) {
        console.error(`❌ Erro ao encontrar guilda para o líder/co-líder ${userId} no DB:`, error);
        throw error; 
    }
}

/**
 * Verifica se um usuário está em qualquer guilda.
 * @param {string} userId - O ID do usuário a ser verificado.
 * @returns {Promise<Object|null>} A guilda em que o usuário está, ou null se não estiver em nenhuma.
 */
async function isUserInAnyGuild(userId) {
    // Similar a findGuildByLeader, esta função também não será cacheada por enquanto.
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

        if (guild) {
            return normalizeGuildData(guild); 
        }
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