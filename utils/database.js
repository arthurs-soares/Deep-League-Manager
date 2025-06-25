// utils/database.js
// Gerencia a conexão global com o banco de dados MongoDB.

const { MongoClient, ServerApiVersion } = require('mongodb');

let dbInstance; // Armazena a instância do objeto de banco de dados conectado
let client;     // Armazena a instância do cliente MongoDB

/**
 * Conecta ao banco de dados MongoDB Atlas.
 * Esta função deve ser chamada apenas uma vez durante a inicialização do bot.
 * @param {string} uri - A URI de conexão com o MongoDB (obtida de process.env.DATABASE_URI).
 * @param {string} dbName - O nome do banco de dados a ser usado (obtido de process.env.DB_NAME).
 * @throws {Error} Se a URI ou o nome do DB não forem fornecidos, ou se a conexão falhar.
 */
async function connectToDatabase(uri, dbName) {
    // Verifica se a URI e o nome do DB são válidos
    if (!uri) {
        throw new Error('DATABASE_URI não foi encontrada! Certifique-se de que está no seu arquivo .env e o dotenv foi carregado.');
    }
    if (!dbName) {
        throw new Error('DB_NAME não foi encontrado! Certifique-se de que está no seu arquivo .env.');
    }

    // Se já estiver conectado, retorna a instância existente para evitar reconexões.
    if (dbInstance && client && client.topology && client.topology.isConnected()) {
        console.log('ℹ️ Já conectado ao MongoDB. Reutilizando conexão existente.');
        return;
    }

    // Cria um novo cliente MongoDB com opções de servidor e tempo limite.
    client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1, // Usa a API de Servidor versão 1 (para consistência de comportamento)
            strict: true,                // Garante que operações em coleções não existentes falhem explicitamente
            deprecationErrors: true,     // Exibe erros para funcionalidades depreciadas
        },
        connectTimeoutMS: 10000, // Aumentado para 10 segundos para dar mais tempo em redes instáveis
        socketTimeoutMS: 10000,  // Aumentado para 10 segundos
        maxPoolSize: 10,         // Número máximo de conexões no pool
    });

    try {
        console.log("Tentando conectar ao MongoDB Atlas...");
        // Conecta o cliente ao servidor MongoDB.
        await client.connect();
        // Obtém a instância do banco de dados específico pelo nome.
        dbInstance = client.db(dbName);
        console.log(`✅ Conectado com sucesso ao MongoDB Atlas! Usando DB: ${dbName}`);
    } catch (e) {
        console.error("❌ Erro CRÍTICO ao conectar com o MongoDB Atlas:", e);
        // Garante que o cliente seja fechado em caso de erro de conexão.
        if (client) {
            await client.close();
        }
        // Sai do processo do Node.js, pois o bot não pode operar sem o DB.
        process.exit(1);
    }
}

/**
 * Retorna a instância do banco de dados conectado.
 * Esta função é usada por outros módulos para interagir com o DB.
 * @returns {Db} - A instância do objeto de banco de dados do MongoDB.
 * @throws {Error} Se a conexão com o banco de dados não foi estabelecida.
 */
function getDb() { 
    if (!dbInstance) {
        // Lança um erro se getDb for chamado antes de connectToDatabase.
        throw new Error("A conexão com o banco de dados não foi estabelecida antes de ser usada. Chame connectToDatabase() primeiro.");
    }
    return dbInstance;
}

/**
 * Função utilitária para obter a instância do DB, usada por outros módulos.
 * Esta é a única interface pública para obter a instância do DB.
 * @returns {Db} Instância do DB.
 * @throws {Error} Se a instância do DB não estiver disponível.
 */
function getDatabaseInstance() {
    try {
        const db = getDb();
        return db;
    } catch (e) {
        console.error("❌ ERRO: getDb() falhou em getDatabaseInstance (utils/database.js):", e.message); 
        throw new Error("Conexão com o banco de dados não disponível.");
    }
}

/**
 * Fecha a conexão com o banco de dados.
 * Útil para desligamentos graciosos ou testes.
 */
async function closeDatabaseConnection() {
    if (client) {
        try {
            await client.close();
            console.log("✅ Conexão com o MongoDB Atlas fechada.");
        } catch (e) {
            console.error("❌ Erro ao fechar a conexão com o MongoDB Atlas:", e);
        }
    }
}


module.exports = { 
    connectToDatabase, 
    getDb, 
    getDatabaseInstance,
    closeDatabaseConnection // Exporta para uso em desligamentos, se necessário
};
