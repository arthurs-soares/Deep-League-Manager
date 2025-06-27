// test-war.js
// Um script para testar a lógica de pontuação de guerras sem iniciar o bot do Discord.

require('dotenv').config();
const { connectToDatabase, getDb, closeDatabaseConnection } = require('./utils/database');
const { saveEntityScore, processWarResultForPersonalScores } = require('./handlers/panel/war/warLogic');
const { saveGuildData, loadGuildByName } = require('./handlers/db/guildDb');

// --- Dados de Teste (Mocks) ---
// Usaremos nomes únicos para não colidir com guildas reais, se houver.
const GUILD_A_NAME = 'Test Guild Alpha';
const GUILD_B_NAME = 'Test Guild Bravo';
const GUILD_C_NAME = 'Test Guild Charlie';
const GUILD_D_NAME = 'Test Guild Delta';

const MOCK_USER_ID_1 = '100000000000000001';
const MOCK_USER_ID_2 = '100000000000000002';

// Função para criar ou resetar uma guilda de teste no DB
async function setupTestGuild(name) {
    const guildData = {
        name: name,
        ownerId: 'test-owner',
        score: { wins: 0, losses: 0 },
        mainRoster: [{ id: MOCK_USER_ID_1, name: 'Mock Player 1' }], // Adiciona um jogador mock para testar score pessoal
        subRoster: [{ id: MOCK_USER_ID_2, name: 'Mock Player 2' }],
        // Outros campos necessários podem ser adicionados aqui com valores padrão
    };
    await saveGuildData(guildData);
    console.log(`[Setup] Guilda de teste "${name}" criada/resetada no banco de dados.`);
    return await loadGuildByName(name);
}

// --- Script Principal de Teste ---
async function runTest() {
    console.log('--- INICIANDO SCRIPT DE TESTE DE GUERRA ---');

    // 1. Conectar ao Banco de Dados
    const dbUri = process.env.DATABASE_URI;
    const dbName = process.env.DB_NAME;
    if (!dbUri || !dbName) {
        console.error('ERRO: DATABASE_URI ou DB_NAME não definidos no .env');
        return;
    }
    await connectToDatabase(dbUri, dbName);
    console.log('✅ Conectado ao Banco de Dados.');

    // 2. Criar/Resetar as guildas de teste no DB
    await setupTestGuild(GUILD_A_NAME);
    await setupTestGuild(GUILD_B_NAME);
    await setupTestGuild(GUILD_C_NAME);
    await setupTestGuild(GUILD_D_NAME);

    console.log('\n--------------------------------------------');

    // 3. Cenário 1: Vitória Normal (A vence B)
    console.log('▶️  Cenário 1: Vitória Normal');
    console.log(`Simulando: "${GUILD_A_NAME}" vence "${GUILD_B_NAME}"`);

    const winner_scenario1 = { name: GUILD_A_NAME, type: 'guild' };
    const loser_scenario1 = { name: GUILD_B_NAME, type: 'guild' };

    // Atualiza scores das guildas
    await saveEntityScore(winner_scenario1.name, winner_scenario1.type, { wins: 1, losses: 0 });
    await saveEntityScore(loser_scenario1.name, loser_scenario1.type, { wins: 0, losses: 1 });
    console.log('[Cenário 1] Scores de guilda atualizados.');

    // Atualiza scores pessoais
    await processWarResultForPersonalScores(winner_scenario1, loser_scenario1);
    console.log('[Cenário 1] Scores pessoais dos membros (hipoteticamente) atualizados.');
    console.log('✅ Cenário 1 Concluído.');

    console.log('\n--------------------------------------------');

    // 4. Cenário 2: Dodge (C dá dodge em D)
    console.log('▶️  Cenário 2: Dodge');
    console.log(`Simulando: "${GUILD_C_NAME}" dá dodge em "${GUILD_D_NAME}"`);

    const winner_scenario2 = { name: GUILD_D_NAME, type: 'guild' }; // D vence porque C fugiu
    const dodger_scenario2 = { name: GUILD_C_NAME, type: 'guild' }; // C é o fujão

    // Atualiza scores das guildas
    await saveEntityScore(winner_scenario2.name, winner_scenario2.type, { wins: 1, losses: 0 });
    await saveEntityScore(dodger_scenario2.name, dodger_scenario2.type, { wins: 0, losses: 1 });
    console.log('[Cenário 2] Scores de guilda atualizados por dodge.');

    // Atualiza scores pessoais
    await processWarResultForPersonalScores(winner_scenario2, dodger_scenario2);
    console.log('[Cenário 2] Scores pessoais dos membros (hipoteticamente) atualizados.');
    console.log('✅ Cenário 2 Concluído.');

    console.log('\n--------------------------------------------');

    // 5. Verificação Final
    console.log('🔍 Verificando resultados no Banco de Dados...');
    const guildA_final = await loadGuildByName(GUILD_A_NAME);
    const guildB_final = await loadGuildByName(GUILD_B_NAME);
    const guildC_final = await loadGuildByName(GUILD_C_NAME);
    const guildD_final = await loadGuildByName(GUILD_D_NAME);

    console.log(`- ${GUILD_A_NAME}: ${guildA_final.score.wins}V / ${guildA_final.score.losses}D`);
    console.log(`- ${GUILD_B_NAME}: ${guildB_final.score.wins}V / ${guildB_final.score.losses}D`);
    console.log(`- ${GUILD_C_NAME} (fujão): ${guildC_final.score.wins}V / ${guildC_final.score.losses}D`);
    console.log(`- ${GUILD_D_NAME} (vencedor por dodge): ${guildD_final.score.wins}V / ${guildD_final.score.losses}D`);

    // 6. Fechar a Conexão
    await closeDatabaseConnection();
    console.log('\n✅ Conexão com o Banco de Dados fechada.');
    console.log('--- SCRIPT DE TESTE CONCLUÍDO ---');
}

// Executa o script
runTest().catch(error => {
    console.error('\n❌ Ocorreu um erro fatal durante o teste:', error);
    closeDatabaseConnection(); // Tenta fechar a conexão em caso de erro
});
