// handlers/db/guildDb.js
// Módulo para interagir com a coleção 'guilds' no banco de dados.
const { ObjectId } = require('mongodb'); // Necessário para converter string de ID para ObjectId

const { getDatabaseInstance } = require('../../utils/database'); // Importa a instância do DB da raiz

/**
 * Normaliza os dados de uma guilda, garantindo que campos essenciais existam e tenham tipos corretos.
 * Útil para garantir a consistência dos dados após carregá-los do DB.
 * @param {Object} guild - O objeto da guilda.
 * @returns {Object} O objeto da guilda com dados normalizados.
 */
function normalizeGuildData(guild) {
    if (!guild) return guild;

    // Garante que guild.id seja o ObjectId de guild._id
    if (guild._id && (!guild.id || guild.id.toString() !== guild._id.toString())) {
        guild.id = guild._id;
    }

    // Garante que 'score' é um objeto e que 'wins' e 'losses' são números.
    guild.score = guild.score || {};
    guild.score.wins = typeof guild.score.wins === 'number' ? guild.score.wins : 0;
    guild.score.losses = typeof guild.score.losses === 'number' ? guild.score.losses : 0;
    
    // Garante que 'mainRoster' e 'subRoster' sejam arrays.
    guild.mainRoster = guild.mainRoster || [];
    guild.subRoster = guild.subRoster || [];

    // Garante que 'leader' e 'coLeader' sejam objetos com ID, ou null.
    guild.leader = guild.leader || null;
    if (guild.leader && !guild.leader.id) guild.leader = null;

    guild.coLeader = guild.coLeader || null;
    if (guild.coLeader && !guild.coLeader.id) guild.coLeader = null;

    // Novo: Garante que 'forumPostId' existe, mesmo que seja null.
    guild.forumPostId = guild.forumPostId || null;

    return guild;
}

/**
 * Carrega os dados de uma guilda pelo seu nome (case-insensitive).
 * @param {string} guildName - O nome da guilda a ser carregada.
 * @returns {Promise<Object|null>} Os dados da guilda, ou null se não for encontrada.
 */
async function loadGuildByName(guildName) {
    const db = getDatabaseInstance(); // Obtém a instância do DB.
    try {
        // Busca a guilda usando uma regex para busca case-insensitive exata.
        let guild = await db.collection('guilds').findOne({ name: { $regex: new RegExp(`^${guildName}$`, 'i') } });
        
        // Normaliza os dados da guilda se ela for encontrada.
        if (guild) {
            guild = normalizeGuildData(guild);
        }

        console.log(`[DB Debug] loadGuildByName('${guildName}'):`, guild ? `Encontrada (Original: ${guild.name})` : 'Não encontrada');
        return guild;
    } catch (error) {
        console.error(`❌ Erro ao carregar guilda "${guildName}" por nome no DB:`, error);
        throw error; // Propaga o erro.
    }
}

/**
 * Carrega os dados de uma guilda pelo seu ID do MongoDB.
 * @param {string} guildMongoId - O ID da guilda no formato string.
 * @returns {Promise<Object|null>} Os dados da guilda, ou null se não for encontrada ou ID inválido.
 */
async function loadGuildById(guildMongoId) {
    const db = getDatabaseInstance();
    try {
        if (!ObjectId.isValid(guildMongoId)) {
            console.warn(`[DB Debug] loadGuildById: ID inválido fornecido: ${guildMongoId}`);
            return null;
        }
        let guild = await db.collection('guilds').findOne({ _id: new ObjectId(guildMongoId) });
        if (guild) {
            guild = normalizeGuildData(guild);
        }
        console.log(`[DB Debug] loadGuildById('${guildMongoId}'):`, guild ? `Encontrada (Nome: ${guild.name})` : 'Não encontrada');
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
    const db = getDatabaseInstance(); // Obtém a instância do DB.
    try {
        // Busca todos os documentos da coleção 'guilds'.
        let guilds = await db.collection('guilds').find({}).toArray();
        
        // Normaliza os dados de cada guilda encontrada.
        if (guilds && guilds.length > 0) {
            guilds = guilds.map(normalizeGuildData);
        }

        console.log(`[DB Debug] loadAllGuilds: ${guilds.length} guildas carregadas.`);
        return guilds;
    } catch (error) {
        console.error("❌ Erro ao carregar todas as guildas do DB:", error);
        throw error; // Propaga o erro.
    }
}

/**
 * Salva ou atualiza os dados de uma guilda no banco de dados.
 * Usa o nome da guilda como critério para upsert (criação/atualização).
 * @param {Object} guildData - O objeto da guilda a ser salvo/atualizado.
 * @returns {Promise<Object>} Os dados da guilda salvos.
 */
async function saveGuildData(guildData) {
    console.log(`[SAVE DEBUG] --- Iniciando saveGuildData para guilda: ${guildData.name} ---`);
    let db;
    try {
        db = getDatabaseInstance(); // Obtém a instância do DB.
        console.log(`[SAVE DEBUG] getDatabaseInstance result: ${db ? 'SUCESSO (instância DB obtida)' : 'FALHA (db é nulo)'}`);
    } catch (e) {
        console.error("❌ [SAVE DEBUG] ERRO CRÍTICO ao obter instância do DB em saveGuildData:", e);
        throw new Error("Conexão com o banco de dados não disponível para salvar dados da guilda.");
    }

    if (!db) {
        console.error("❌ [SAVE DEBUG] Instância do DB é nula APÓS tentar obter. Não é possível salvar.");
        throw new Error("Instância do banco de dados não disponível para salvar dados da guilda.");
    }

    // Ensure we have an ID to update by if this is an existing guild.
    // guildData.id is expected to be the ObjectId for existing guilds.
    // guildData._id might also be present.
    const documentId = guildData.id || guildData._id;

    // Create a shallow copy for the update payload
    const updatePayload = { ...guildData };
    // Remove _id and id from the payload to prevent trying to set/change them
    delete updatePayload._id;
    delete updatePayload.id;

    try {
        let result;
        if (documentId) {
            // This is an update of an existing document
            console.log(`[SAVE DEBUG] Tentando db.collection('guilds').updateOne para _id: ${documentId} (Nome: ${guildData.name})`);
            result = await db.collection('guilds').updateOne(
                { _id: documentId },      // Filter by _id
                { $set: updatePayload },
                { upsert: false }         // upsert: false for updates of existing documents
            );
            if (result.matchedCount === 0) {
                console.warn(`[SAVE DEBUG] Nenhuma guilda encontrada com _id: ${documentId} para atualizar. Nome da guilda (novo): ${guildData.name}. Isso pode indicar um problema se uma atualização era esperada.`);
                // If an update was expected but nothing matched, it's an issue.
                // However, if the name was the only unique key and it changed, this path might be taken if the old logic was kept.
                // With _id filtering, matchedCount === 0 means the ID wasn't found.
            }
        } else {
            // This is likely an insert of a new document (e.g., guild creation)
            // For new documents, _id will be generated by MongoDB if not provided.
            // The original filter by name with upsert:true was more suited for "create if not exists by name".
            // For simplicity, if no ID, we assume it's a new guild and use the old logic (insert or update by name).
            // This part might need refinement based on how new guilds are created.
            console.log(`[SAVE DEBUG] Tentando db.collection('guilds').updateOne (com upsert) para NOME: ${guildData.name} (sem ID fornecido)`);
            result = await db.collection('guilds').updateOne(
                { name: guildData.name }, // Filter by name for creation/potential update if ID was missing
                { $set: updatePayload },  // updatePayload already has _id/id removed
                { upsert: true }
            );
        }
        console.log(`[SAVE DEBUG] Resultado bruto de updateOne:`, result);

        if (result.upsertedCount > 0) {
            console.log(`✅ [SAVE DEBUG] Guilda "${guildData.name}" INSERIDA com sucesso no DB (ID: ${result.upsertedId ? result.upsertedId._id : 'N/A'}).`);
        } else if (result.modifiedCount > 0) {
            console.log(`✅ [SAVE DEBUG] Guilda "${guildData.name}" (ID: ${documentId}) ATUALIZADA com sucesso no DB.`);
        } else {
            console.log(`ℹ️ [SAVE DEBUG] Guilda "${guildData.name}" (ID: ${documentId}) não alterada (sem modificações efetivas ou não encontrada para update sem upsert).`);
        }
        return guildData; // Retorna os dados da guilda que foram salvos.
    } catch (error) {
        console.error("❌ [SAVE DEBUG] ERRO FATAL ao executar updateOne para a guilda no DB:", error);
        if (error.name === 'MongoError' || error.name === 'MongoNetworkError') {
            console.error("    Possível causa: Problema de conexão MongoDB ou permissões.");
        }
        throw error; // Propaga o erro.
    } finally {
        console.log(`[SAVE DEBUG] --- saveGuildData para ${guildData.name} finalizado. ---`);
    }
}

/**
 * Deleta uma guilda do banco de dados pelo seu nome.
 * @param {string} guildName - O nome da guilda a ser deletada.
 * @returns {Promise<boolean>} True se a guilda foi deletada, false caso contrário.
 */
async function deleteGuildByName(guildName) {
    const db = getDatabaseInstance(); // Obtém a instância do DB.
    try {
        // Deleta um documento da coleção 'guilds'.
        const result = await db.collection('guilds').deleteOne({ name: { $regex: new RegExp(`^${guildName}$`, 'i') } });
        console.log(`[DB Debug] deleteGuildByName('${guildName}'):`, result);
        if (result.deletedCount > 0) {
            console.log(`✅ Guilda "${guildName}" deletada com sucesso do DB.`);
            return true;
        } else {
            console.log(`ℹ️ Guilda "${guildName}" não encontrada para deleção no DB.`);
            return false;
        }
    } catch (error) {
        console.error(`❌ Erro ao deletar guilda "${guildName}" por nome no DB:`, error);
        throw error; // Propaga o erro.
    }
}

/**
 * Encontra uma guilda onde um usuário específico é líder, co-líder ou membro.
 * @param {string} userId - O ID do usuário a ser verificado.
 * @returns {Promise<Object|null>} A guilda encontrada, ou null se o usuário não estiver em nenhuma guilda.
 */
async function findGuildByLeader(userId) {
    const db = getDatabaseInstance(); // Obtém a instância do DB.
    try {
        // Busca em todas as guildas onde o userId está no líder, co-líder ou rosters.
        const guild = await db.collection('guilds').findOne({
            $or: [
                { 'leader.id': userId },
                { 'coLeader.id': userId },
                { 'mainRoster.id': userId },
                { 'subRoster.id': userId }
            ]
        });

        if (guild) {
            console.log(`[DB Debug] findGuildByLeader('${userId}'): Usuário encontrado na guilda: ${guild.name}`);
            return normalizeGuildData(guild); // Normaliza os dados da guilda encontrada.
        }
        console.log(`[DB Debug] findGuildByLeader('${userId}'): Usuário não encontrado em nenhuma guilda.`);
        return null; 
    } catch (error) {
        console.error(`❌ Erro ao encontrar guilda para o líder/co-líder ${userId} no DB:`, error);
        throw error; 
    }
}

/**
 * Verifica se um usuário está em qualquer guilda (main ou sub roster, ou líder/co-líder).
 * @param {string} userId - O ID do usuário a ser verificado.
 * @returns {Promise<Object|null>} A guilda em que o usuário está, ou null se não estiver em nenhuma.
 */
async function isUserInAnyGuild(userId) {
    const db = getDatabaseInstance(); // Obtém a instância do DB.
    try {
        // Busca em qualquer guilda que contenha o userId em seus campos relevantes.
        const guild = await db.collection('guilds').findOne({
            $or: [
                { 'leader.id': userId },
                { 'coLeader.id': userId },
                { 'mainRoster.id': userId },
                { 'subRoster.id': userId }
            ]
        });

        if (guild) {
            console.log(`[DB Debug] isUserInAnyGuild('${userId}'): Usuário encontrado na guilda: ${guild.name}`);
            return normalizeGuildData(guild); 
        }
        console.log(`[DB Debug] isUserInAnyGuild('${userId}'): Usuário não encontrado em nenhuma guilda.`);
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
