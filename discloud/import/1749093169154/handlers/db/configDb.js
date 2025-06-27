// handlers/db/configDb.js
// Módulo para gerenciar a configuração global do bot no banco de dados.

const { getDatabaseInstance } = require('../../utils/database'); // Importa a instância do DB da raiz
const fs = require('fs'); // Para operações de arquivo
const path = require('path'); // Para resolver caminhos de arquivo

const CONFIG_FILE_PATH = path.join(__dirname, '../../config.json'); // Caminho para o config.json


/**
 * Carrega a configuração global do bot do banco de dados e do arquivo local (se necessário).
 * Prioriza o banco de dados. Se não encontrar no DB, tenta carregar do arquivo local.
 * @returns {Promise<Object>} O objeto de configuração do bot.
 */
async function loadConfig() {
    console.log(`[DIAGNÓSTICO CONFIGDB] Iniciando loadConfig.`);
    const db = getDatabaseInstance(); 
    try {
        console.log(`[DIAGNÓSTICO CONFIGDB] Tentando carregar config do DB...`);
        const dbConfig = await db.collection('bot_configs').findOne({ _id: "global_config" });
        if (dbConfig) {
            console.log(`[DIAGNÓSTICO CONFIGDB] Config carregada do DB: ID do Fórum: ${dbConfig.guildRosterForumChannelId}`);
            return dbConfig; 
        } else {
            console.log(`[DIAGNÓSTICO CONFIGDB] Config NÃO encontrada no DB. Tentando carregar do arquivo local: ${CONFIG_FILE_PATH}`);
            // Se não encontrou no DB, tenta carregar do arquivo local e salvar no DB.
            if (fs.existsSync(CONFIG_FILE_PATH)) {
                try {
                    const fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, 'utf8'));
                    console.log(`[DIAGNÓSTICO CONFIGDB] Config carregada do arquivo local. Salvando no DB.`);
                    await saveConfig(fileConfig); // Salva no DB para futura prioridade.
                    return fileConfig;
                } catch (e) {
                    console.error(`❌ [DIAGNÓSTICO CONFIGDB] ERRO ao ler config.json local:`, e);
                    return {}; // Retorna vazio se o arquivo estiver corrompido.
                }
            }
            console.log(`[DIAGNÓSTICO CONFIGDB] Arquivo config.json local NÃO encontrado.`);
            return {}; // Retorna vazio se não encontrou em lugar nenhum.
        }
    } catch (error) {
        console.error("❌ [DIAGNÓSTICO CONFIGDB] Erro ao carregar a configuração do bot do DB/arquivo:", error);
        throw error; 
    }
}

/**
 * Salva ou atualiza a configuração global do bot no banco de dados.
 * Também sincroniza com o arquivo config.json local.
 * @param {Object} configData - O objeto de configuração a ser salvo.
 * @returns {Promise<Object>} O resultado da operação de salvamento.
 */
async function saveConfig(configData) {
    console.log(`[DIAGNÓSTICO CONFIGDB] Iniciando saveConfig.`);
    console.log(`[DIAGNÓSTICO CONFIGDB] ConfigData a ser salva (ID do Fórum): ${configData.guildRosterForumChannelId}`);
    let db;
    try {
        db = getDatabaseInstance(); 
    } catch (e) {
        console.error("❌ [DIAGNÓSTICO CONFIGDB] ERRO CRÍTICO ao obter instância do DB em saveConfig:", e);
        throw new Error("Conexão com o banco de dados não disponível para salvar config.");
    }

    if (!db) {
        console.error("❌ [DIAGNÓSTICO CONFIGDB] Instância do DB é nula. Não é possível salvar.");
        throw new Error("Instância do banco de dados não disponível para salvar config.");
    }

    try {
        console.log(`[DIAGNÓSTICO CONFIGDB] Tentando db.collection('bot_configs').updateOne para _id: global_config`);
        const loggableConfigData = { ...configData };
        delete loggableConfigData.DISCORD_TOKEN; 
        console.log(`[DIAGNÓSTICO CONFIGDB] Dados enviados para DB: ${JSON.stringify(loggableConfigData.guildRosterForumChannelId, null, 2)}`);

        const result = await db.collection('bot_configs').updateOne(
            { _id: "global_config" }, 
            { $set: configData },
            { upsert: true } 
        );
        console.log(`✅ [DIAGNÓSTICO CONFIGDB] Configuração do bot salva/atualizada no DB.`);
        
        // Sincroniza com o arquivo config.json local
        try {
            fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(configData, null, 2));
            console.log(`✅ [DIAGNÓSTICO CONFIGDB] Configuração do bot sincronizada com ${CONFIG_FILE_PATH}.`);
        } catch (fileError) {
            console.error(`❌ [DIAGNÓSTICO CONFIGDB] ERRO ao sincronizar config.json local:`, fileError);
        }

        return result;
    } catch (error) {
        console.error("❌ [DIAGNÓSTICO CONFIGDB] ERRO FATAL ao executar updateOne para config no DB:", error);
        if (error.name === 'MongoError' || error.name === 'MongoNetworkError') {
            console.error("   Possível causa: Problema de conexão MongoDB ou permissões para bot_configs.");
        }
        throw error; 
    } finally {
        console.log(`[DIAGNÓSTICO CONFIGDB] saveConfig finalizado.`);
    }
}

module.exports = {
    loadConfig,
    saveConfig,
};