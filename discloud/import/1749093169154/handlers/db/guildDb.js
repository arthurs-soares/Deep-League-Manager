// handlers/db/guildDb.js
const { getDb } = require('../../utils/database'); // ✅ Mantenha apenas esta importação do database
const { ObjectId } = require('mongodb');

// A função getGuildsCollection que você criou é ÓTIMA. Vamos usá-la em tudo.
const getGuildsCollection = () => {
    const db = getDb();
    if (!db) {
        throw new Error("A conexão com o banco de dados não foi estabelecida.");
    }
    return db.collection('guilds');
};

async function saveGuildData(guildData) {
    // ✅ Perfeito, já usa getDb() implicitamente via getGuildsCollection se você ajustar.
    const guildsCollection = getDb().collection('guilds'); 

    // O resto da sua função saveGuildData está muito bom com a lógica if/else para update/insert.
    if (guildData._id) {
        const { _id, ...dataToUpdate } = guildData;
        return await guildsCollection.replaceOne({ _id: new ObjectId(_id) }, dataToUpdate);
    } else {
        const result = await guildsCollection.insertOne(guildData);
        if (result.insertedId) guildData._id = result.insertedId;
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
    const collection = getGuildsCollection(); // Usando a função helper
    const result = await collection.deleteOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    return result.deletedCount > 0;
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
};