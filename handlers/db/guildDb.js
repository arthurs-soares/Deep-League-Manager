// handlers/db/guildDb.js
const { getDb } = require('../../utils/database'); // Ajuste o caminho se necessário
const { ObjectId } = require('mongodb'); // Necessário se você manipular _id como ObjectId

// --- FUNÇÃO AUXILIAR PARA OBTER A COLEÇÃO ---
const getGuildsCollection = () => {
    const db = getDb(); // Obtém a instância do banco de dados
    if (!db) {
        // Isso não deveria acontecer se connectToDatabase foi chamado corretamente na inicialização
        throw new Error("A conexão com o banco de dados não foi estabelecida em getGuildsCollection.");
    }
    return db.collection('guilds'); // 'guilds' é o nome da sua coleção
};

// --- SUAS FUNÇÕES EXISTENTES ---
async function saveGuildData(guildData) {
    try {
        // AGORA getGuildsCollection() ESTARÁ DEFINIDA
        const collection = getGuildsCollection();
        
        // Certifique-se que guildData tem _id ou id
        let filter;
        if (guildData._id) {
            filter = { _id: guildData._id instanceof ObjectId ? guildData._id : new ObjectId(guildData._id) };
        } else if (guildData.id) { // Fallback para 'id' se '_id' não existir (ex: objeto novo antes do primeiro save)
            // Este caso é mais para upsert em uma criação, mas para update, _id já deveria existir.
            // Se guildData.id é uma string de ObjectId, converta.
            filter = { _id: new ObjectId(guildData.id) };
        } else {
            console.error("[guildDb - saveGuildData] Erro: guildData não possui _id ou id para filtro.", guildData);
            throw new Error("Dados da guilda inválidos para salvar: _id ou id ausente.");
        }

        // Remova _id do objeto a ser setado para evitar erro de modificar _id
        // Crie uma cópia para não modificar o objeto original guildData se ele for usado depois
        const dataToSet = { ...guildData };
        delete dataToSet._id; // MongoDB não permite que você defina _id em uma operação $set

        console.log(`[guildDb - saveGuildData] Tentando salvar guilda: ${guildData.name}, Filtro:`, filter);
        console.log(`[guildDb - saveGuildData] Dados para $set:`, dataToSet);

        const result = await collection.updateOne(filter, { $set: dataToSet }, { upsert: true });
        console.log('[guildDb - saveGuildData] Resultado do updateOne:', result);
        // ... (resto da sua lógica de log de resultado) ...
        return result;
    } catch (error) {
        console.error(`❌ Erro ao salvar dados da guilda ${guildData.name || 'DESCONHECIDA'}:`, error);
        throw error;
    }
}

async function loadGuildByName(name) {
    try {
        const collection = getGuildsCollection(); // Use-a aqui também
        // Busca insensível a maiúsculas/minúsculas
        return await collection.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    } catch (error) {
        console.error(`❌ Erro ao carregar guilda por nome ${name}:`, error);
        throw error;
    }
}

async function loadGuildById(id) {
    try {
        const collection = getGuildsCollection(); // Use-a aqui também
        return await collection.findOne({ _id: new ObjectId(id) });
    } catch (error) {
        console.error(`❌ Erro ao carregar guilda por ID ${id}:`, error);
        throw error;
    }
}

async function loadAllGuilds() {
    try {
        const collection = getGuildsCollection(); // Use-a aqui também
        return await collection.find({}).toArray();
    } catch (error) {
        console.error("❌ Erro ao carregar todas as guildas:", error);
        throw error;
    }
}

// ... (outras funções como deleteGuildByName, findGuildByLeader, isUserInAnyGuild)
// Certifique-se que TODAS elas chamam getGuildsCollection() para obter a coleção.

async function isUserInAnyGuild(userId) {
    try {
        const collection = getGuildsCollection();
        const query = {
            $or: [
                { "leader.id": userId },
                { "coLeader.id": userId },
                { "mainRoster.id": userId },
                { "subRoster.id": userId }
            ]
        };
        const guild = await collection.findOne(query);
        return guild; // Retorna o objeto da guilda se encontrado, ou null
    } catch (error) {
        console.error(`❌ Erro ao verificar se usuário ${userId} está em alguma guilda:`, error);
        throw error;
    }
}

// Exemplo para deleteGuildByName
async function deleteGuildByName(name) {
    try {
        const collection = getGuildsCollection();
        const result = await collection.deleteOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
        return result.deletedCount > 0;
    } catch (error) {
        console.error(`❌ Erro ao deletar guilda por nome ${name}:`, error);
        throw error;
    }
}

// Exemplo para findGuildByLeader
async function findGuildByLeader(userId) {
    try {
        const collection = getGuildsCollection();
        return await collection.findOne({
            $or: [
                { "leader.id": userId },
                { "coLeader.id": userId } // Considera co-líder também para encontrar "sua" guilda no painel
            ]
        });
    } catch (error) {
        console.error(`❌ Erro ao encontrar guilda pelo líder/co-líder ${userId}:`, error);
        throw error;
    }
}


module.exports = {
    saveGuildData,
    loadGuildByName,
    loadGuildById,
    loadAllGuilds,
    isUserInAnyGuild,
    deleteGuildByName,
    findGuildByLeader,
    // getGuildsCollection, // Geralmente não se exporta a função getCollection diretamente
};