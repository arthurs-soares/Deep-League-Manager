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
    const guildsCollection = getDb().collection('guilds');

    // Se o guildData já tem um _id, significa que estamos atualizando um documento existente.
    if (guildData._id) {
        // Separa o _id do resto dos dados para a atualização
        const { _id, ...dataToUpdate } = guildData;
        // Usa replaceOne para substituir todo o documento, exceto o _id.
        // Isso é bom para garantir que o estado do objeto no código e no DB sejam idênticos.
        return await guildsCollection.replaceOne(
            { _id: new ObjectId(_id) }, // Filtra pelo ObjectId
            dataToUpdate,
            { upsert: false } // Não cria um novo se não encontrar (deve sempre encontrar ao editar)
        );
    } 
    // Se não tem _id, é um novo documento que precisa ser inserido.
    else {
        // Usa insertOne, que vai gerar um _id automaticamente no MongoDB.
        // O objeto original guildData (newGuild em registrar.js) não precisa ter _id.
        const result = await guildsCollection.insertOne(guildData);
        // Opcional: Atualiza o objeto original com o _id gerado pelo DB, se necessário para operações subsequentes.
        if (result.insertedId) {
            guildData._id = result.insertedId;
        }
        return result;
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