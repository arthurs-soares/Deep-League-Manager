// handlers/db/warDb.js
// Módulo para interagir com a coleção 'war_tickets' no banco de dados.

const { getDatabaseInstance } = require('../../utils/database'); // Importa a instância do DB da raiz

/**
 * Salva ou atualiza os dados de um ticket de guerra no banco de dados.
 * Usa o threadId como _id para garantir que cada thread tenha um único documento de guerra.
 * @param {Object} warData - Os dados da guerra a serem salvos/atualizados.
 * @returns {Promise<Object>} Os dados da guerra salvos.
 */
async function saveWarTicket(warData) {
    const db = getDatabaseInstance(); // Obtém a instância do DB.
    try {
        // Atualiza ou insere o documento do ticket de guerra.
        const result = await db.collection('war_tickets').updateOne(
            { _id: warData.threadId }, // Usa o ID da thread como identificador único.
            { $set: warData },         // Define os campos com os dados fornecidos.
            { upsert: true }           // Cria o documento se não existir.
        );
        console.log(`[DB Debug] saveWarTicket('${warData.threadId}'): Dados de guerra salvos/atualizados.`, result);
        return warData; // Retorna os dados que foram salvos.
    } catch (error) {
        console.error(`❌ Erro ao salvar ticket de guerra no DB (${warData.threadId}):`, error);
        throw error; // Propaga o erro.
    }
}

/**
 * Carrega os dados de um ticket de guerra pelo ID da thread.
 * @param {string} threadId - O ID da thread do Discord.
 * @returns {Promise<Object|null>} Os dados da guerra, ou null se não for encontrado.
 */
async function loadWarTicketByThreadId(threadId) {
    const db = getDatabaseInstance(); // Obtém a instância do DB.
    try {
        // Busca o documento do ticket de guerra pelo ID da thread.
        const warData = await db.collection('war_tickets').findOne({ _id: threadId });
        console.log(`[DB Debug] loadWarTicketByThreadId('${threadId}'):`, warData ? 'Encontrado' : 'Não encontrado');
        return warData;
    } catch (error) {
        console.error(`❌ Erro ao carregar ticket de guerra do DB (${threadId}):`, error);
        throw error; // Propaga o erro.
    }
}

/**
 * Deleta um ticket de guerra do banco de dados pelo ID da thread.
 * @param {string} threadId - O ID da thread do Discord.
 * @returns {Promise<boolean>} True se deletado, false caso contrário.
 */
async function deleteWarTicket(threadId) {
    const db = getDatabaseInstance(); // Obtém a instância do DB.
    try {
        // Deleta um documento da coleção 'war_tickets'.
        const result = await db.collection('war_tickets').deleteOne({ _id: threadId });
        if (result.deletedCount > 0) {
            console.log(`✅ Ticket de guerra (${threadId}) deletado do DB.`);
            return true;
        }
        console.log(`ℹ️ Ticket de guerra (${threadId}) não encontrado para deleção.`);
        return false;
    } catch (error) {
        console.error(`❌ Erro ao deletar ticket de guerra do DB (${threadId}):`, error);
        throw error; // Propaga o erro.
    }
}

module.exports = {
    saveWarTicket,
    loadWarTicketByThreadId,
    deleteWarTicket,
};
