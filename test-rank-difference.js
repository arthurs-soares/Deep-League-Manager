// test-rank-difference.js
// Teste do sistema de ELO com diferença de ranks

const { 
    calculateEloChange, 
    getRankDifferenceMultiplier 
} = require('./handlers/elo/eloCalculator');
const { getEloRank } = require('./handlers/elo/eloRanks');
const { MATCH_RESULTS } = require('./utils/eloConstants');

// Função para testar o cálculo de ELO com diferentes cenários
function testRankDifference() {
    console.log('=== TESTE DO SISTEMA DE ELO COM DIFERENÇA DE RANKS ===\n');
    
    // Definir diferentes níveis de ELO para teste
    const rankD = 200;      // Rank D
    const rankC = 500;      // Rank C
    const rankB = 850;      // Rank B
    const rankA = 1200;     // Rank A
    const rankAPlus = 1750; // Rank A+
    const grandmaster = 2200; // Grandmaster
    
    // Exibir os ranks para referência
    console.log('RANKS PARA TESTE:');
    console.log(`Rank D: ${rankD} ELO - ${getEloRank(rankD).name}`);
    console.log(`Rank C: ${rankC} ELO - ${getEloRank(rankC).name}`);
    console.log(`Rank B: ${rankB} ELO - ${getEloRank(rankB).name}`);
    console.log(`Rank A: ${rankA} ELO - ${getEloRank(rankA).name}`);
    console.log(`Rank A+: ${rankAPlus} ELO - ${getEloRank(rankAPlus).name}`);
    console.log(`Grandmaster: ${grandmaster} ELO - ${getEloRank(grandmaster).name}`);
    console.log('\n');
    
    // Testar cenários de diferença de ranks
    console.log('=== CENÁRIO 1: GRANDMASTER PERDENDO PARA RANK D (DIFERENÇA EXTREMA) ===');
    testMatchup(grandmaster, rankD, false);
    
    console.log('\n=== CENÁRIO 2: RANK D VENCENDO GRANDMASTER (DIFERENÇA EXTREMA) ===');
    testMatchup(rankD, grandmaster, true);
    
    console.log('\n=== CENÁRIO 3: RANK A+ PERDENDO PARA RANK C (DIFERENÇA GRANDE) ===');
    testMatchup(rankAPlus, rankC, false);
    
    console.log('\n=== CENÁRIO 4: RANK C VENCENDO RANK A+ (DIFERENÇA GRANDE) ===');
    testMatchup(rankC, rankAPlus, true);
    
    console.log('\n=== CENÁRIO 5: RANK A PERDENDO PARA RANK C (DIFERENÇA MODERADA) ===');
    testMatchup(rankA, rankC, false);
    
    console.log('\n=== CENÁRIO 6: RANK C VENCENDO RANK A (DIFERENÇA MODERADA) ===');
    testMatchup(rankC, rankA, true);
    
    console.log('\n=== CENÁRIO 7: RANK B PERDENDO PARA RANK C (DIFERENÇA PEQUENA) ===');
    testMatchup(rankB, rankC, false);
    
    console.log('\n=== CENÁRIO 8: GRANDMASTER VENCENDO RANK D (RESULTADO ESPERADO) ===');
    testMatchup(grandmaster, rankD, true);
    
    console.log('\n=== CENÁRIO 9: RANK D PERDENDO PARA GRANDMASTER (RESULTADO ESPERADO) ===');
    testMatchup(rankD, grandmaster, false);
}

// Função auxiliar para testar um confronto específico
function testMatchup(playerElo, opponentElo, isWinner) {
    const playerRank = getEloRank(playerElo);
    const opponentRank = getEloRank(opponentElo);
    
    console.log(`Jogador: ${playerElo} ELO (${playerRank.name})`);
    console.log(`Oponente: ${opponentElo} ELO (${opponentRank.name})`);
    
    // Calcular o multiplicador de diferença de rank
    const rankDiffMultiplier = getRankDifferenceMultiplier(playerElo, opponentElo, isWinner);
    console.log(`Multiplicador de diferença de rank: ${rankDiffMultiplier.toFixed(2)}x`);
    
    // Calcular mudança de ELO sem considerar a diferença de rank
    const resultWithoutDiff = calculateEloChange({
        currentElo: playerElo,
        isWinner: isWinner,
        isMvp: false,
        matchResult: isWinner ? MATCH_RESULTS.NORMAL_WIN : MATCH_RESULTS.NORMAL_LOSS
    });
    
    // Calcular mudança de ELO considerando a diferença de rank
    const resultWithDiff = calculateEloChange({
        currentElo: playerElo,
        isWinner: isWinner,
        isMvp: false,
        matchResult: isWinner ? MATCH_RESULTS.NORMAL_WIN : MATCH_RESULTS.NORMAL_LOSS,
        opponentElo: opponentElo
    });
    
    console.log(`\nSem considerar diferença de rank:`);
    console.log(`Mudança de ELO: ${resultWithoutDiff.eloChange > 0 ? '+' : ''}${resultWithoutDiff.eloChange}`);
    console.log(`Novo ELO: ${resultWithoutDiff.newElo}`);
    
    console.log(`\nConsiderando diferença de rank:`);
    console.log(`Mudança de ELO: ${resultWithDiff.eloChange > 0 ? '+' : ''}${resultWithDiff.eloChange}`);
    console.log(`Novo ELO: ${resultWithDiff.newElo}`);
    console.log(`Multiplicador base: ${resultWithDiff.baseMultiplier.toFixed(2)}x`);
    console.log(`Multiplicador de diferença: ${resultWithDiff.rankDiffMultiplier.toFixed(2)}x`);
    console.log(`Multiplicador total: ${resultWithDiff.multiplier.toFixed(2)}x`);
    
    // Calcular a diferença entre os dois resultados
    const difference = Math.abs(resultWithDiff.eloChange - resultWithoutDiff.eloChange);
    const percentDifference = Math.round((difference / Math.abs(resultWithoutDiff.eloChange)) * 100);
    
    console.log(`\nImpacto da diferença de rank: ${difference} pontos (${percentDifference}% ${resultWithDiff.eloChange > resultWithoutDiff.eloChange ? 'a mais' : 'a menos'})`);
}

// Executar o teste
testRankDifference();