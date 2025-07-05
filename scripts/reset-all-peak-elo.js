// scripts/reset-all-peak-elo.js
// Script para resetar o ELO de pico de todos os usuários no banco de dados

require('dotenv').config(); // Carrega variáveis de ambiente do arquivo .env
const { connectToDatabase, getDatabaseInstance, closeDatabaseConnection } = require('../utils/database');
const { ELO_CONFIG, ELO_CHANGE_REASONS } = require('../utils/eloConstants');

/**
 * Reseta o ELO de pico de todos os usuários no banco de dados
 */
async function resetAllUsersPeakElo() {
    try {
        // Conectar ao banco de dados
        console.log('Conectando ao banco de dados...');
        await connectToDatabase(process.env.DATABASE_URI, process.env.DB_NAME);
        const db = getDatabaseInstance();
        
        // Buscar todos os perfis de usuários
        console.log('Buscando todos os perfis de usuários...');
        const userProfiles = await db.collection('user_profiles').find({}).toArray();
        
        console.log(`Encontrados ${userProfiles.length} perfis de usuários.`);
        
        // Contador para acompanhar o progresso
        let updatedCount = 0;
        let skippedCount = 0;
        
        // Atualizar cada perfil
        for (const profile of userProfiles) {
            const userId = profile._id;
            
            // Verificar se o perfil tem dados de ELO
            if (!profile.eloData) {
                console.log(`Usuário ${userId} não tem dados de ELO. Criando estrutura...`);
                profile.eloData = {
                    currentElo: ELO_CONFIG.STARTING_ELO,
                    peakElo: ELO_CONFIG.STARTING_ELO,
                    eloHistory: [],
                    mvpCount: 0,
                    flawlessWins: 0,
                    flawlessLosses: 0,
                    lastEloUpdate: new Date().toISOString()
                };
                updatedCount++;
            } else {
                // Registrar o ELO de pico antigo
                const oldPeakElo = profile.eloData.peakElo;
                
                // Resetar o ELO de pico para o valor atual
                // Usamos o maior valor entre o ELO atual e o ELO inicial
                profile.eloData.peakElo = Math.max(profile.eloData.currentElo, ELO_CONFIG.STARTING_ELO);
                
                // Se não houve mudança, pular
                if (profile.eloData.peakElo === oldPeakElo) {
                    console.log(`Usuário ${userId} já tem Peak ELO = ${profile.eloData.peakElo}. Pulando...`);
                    skippedCount++;
                    continue;
                }
                
                console.log(`Resetando Peak ELO do usuário ${userId} de ${oldPeakElo} para ${profile.eloData.peakElo}`);
                
                // Adicionar entrada ao histórico
                const historyEntry = {
                    matchId: `peak_reset_${Date.now()}`,
                    date: new Date().toISOString(),
                    eloChange: 0, // Não altera o ELO atual, apenas o peak
                    newElo: profile.eloData.currentElo,
                    reason: ELO_CHANGE_REASONS.RESET,
                    matchResult: null,
                    guildName: null,
                    operatorId: 'system_reset_script',
                    notes: `Peak ELO resetado de ${oldPeakElo} para ${profile.eloData.peakElo}`
                };
                
                // Adicionar ao início do histórico
                if (!profile.eloData.eloHistory) {
                    profile.eloData.eloHistory = [];
                }
                
                profile.eloData.eloHistory.unshift(historyEntry);
                
                // Limitar o tamanho do histórico
                if (profile.eloData.eloHistory.length > ELO_CONFIG.MAX_HISTORY_ENTRIES) {
                    profile.eloData.eloHistory = profile.eloData.eloHistory.slice(0, ELO_CONFIG.MAX_HISTORY_ENTRIES);
                }
                
                // Atualizar timestamp da última atualização
                profile.eloData.lastEloUpdate = new Date().toISOString();
                
                updatedCount++;
            }
            
            // Salvar as alterações no banco de dados
            await db.collection('user_profiles').updateOne(
                { _id: userId },
                { $set: { eloData: profile.eloData } }
            );
            
            // Log de progresso a cada 10 usuários
            if (updatedCount % 10 === 0) {
                console.log(`Progresso: ${updatedCount} usuários atualizados...`);
            }
        }
        
        console.log('\n===== RESUMO DO RESET DE PEAK ELO =====');
        console.log(`Total de perfis encontrados: ${userProfiles.length}`);
        console.log(`Perfis atualizados: ${updatedCount}`);
        console.log(`Perfis pulados (sem alteração necessária): ${skippedCount}`);
        console.log('=======================================\n');
        
        console.log('Reset de Peak ELO concluído com sucesso!');
        
    } catch (error) {
        console.error('Erro durante o reset de Peak ELO:', error);
    } finally {
        // Fechar a conexão com o banco de dados
        await closeDatabaseConnection();
    }
}

// Executar a função principal
resetAllUsersPeakElo().then(() => {
    console.log('Script finalizado.');
}).catch(err => {
    console.error('Erro fatal:', err);
    process.exit(1);
});