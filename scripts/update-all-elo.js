// scripts/update-all-elo.js
// Script para atualizar o ELO base de todos os usuários no banco de dados

require('dotenv').config(); // Carrega variáveis de ambiente do arquivo .env
const { connectToDatabase, getDatabaseInstance, closeDatabaseConnection } = require('../utils/database');
const { ELO_CONFIG, ELO_CHANGE_REASONS } = require('../utils/eloConstants');

/**
 * Atualiza o ELO base de todos os usuários no banco de dados
 */
async function updateAllUsersElo() {
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
                // Se o ELO atual já é igual ao valor desejado, pular
                if (profile.eloData.currentElo === ELO_CONFIG.STARTING_ELO) {
                    console.log(`Usuário ${userId} já tem ELO = ${ELO_CONFIG.STARTING_ELO}. Pulando...`);
                    skippedCount++;
                    continue;
                }
                
                // Registrar o ELO antigo para o histórico
                const oldElo = profile.eloData.currentElo;
                
                // Atualizar ELO atual
                profile.eloData.currentElo = ELO_CONFIG.STARTING_ELO;
                
                // Atualizar ELO de pico se necessário
                if (ELO_CONFIG.STARTING_ELO > profile.eloData.peakElo) {
                    profile.eloData.peakElo = ELO_CONFIG.STARTING_ELO;
                }
                
                // Adicionar entrada ao histórico
                const historyEntry = {
                    matchId: `reset_${Date.now()}`,
                    date: new Date().toISOString(),
                    eloChange: ELO_CONFIG.STARTING_ELO - oldElo,
                    newElo: ELO_CONFIG.STARTING_ELO,
                    reason: ELO_CHANGE_REASONS.RESET,
                    matchResult: null,
                    guildName: null,
                    operatorId: 'system_update_script'
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
        
        console.log('\n===== RESUMO DA ATUALIZAÇÃO =====');
        console.log(`Total de perfis encontrados: ${userProfiles.length}`);
        console.log(`Perfis atualizados: ${updatedCount}`);
        console.log(`Perfis pulados (já com ELO correto): ${skippedCount}`);
        console.log('=================================\n');
        
        console.log('Atualização concluída com sucesso!');
        
    } catch (error) {
        console.error('Erro durante a atualização:', error);
    } finally {
        // Fechar a conexão com o banco de dados
        await closeDatabaseConnection();
    }
}

// Executar a função principal
updateAllUsersElo().then(() => {
    console.log('Script finalizado.');
}).catch(err => {
    console.error('Erro fatal:', err);
    process.exit(1);
});