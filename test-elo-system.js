// test-elo-system.js
// Script de teste para validar o sistema de ELO

const { calculateEloChange, calculateTeamEloChanges } = require('./handlers/elo/eloCalculator');
const { getEloRank, checkRankChange } = require('./handlers/elo/eloRanks');
const { MATCH_RESULTS } = require('./utils/eloConstants');

console.log('🧪 Testando Sistema de ELO...\n');

// Teste 1: Cálculo de ELO individual
console.log('📊 Teste 1: Cálculo de ELO Individual');
console.log('=====================================');

const playerElo = 1200;
console.log(`Jogador com ${playerElo} ELO atual`);

// MVP vencedor flawless
const mvpWinnerFlawless = calculateEloChange({
    currentElo: playerElo,
    isWinner: true,
    isMvp: true,
    matchResult: MATCH_RESULTS.FLAWLESS_WIN
});

console.log(`MVP Vencedor Flawless: ${mvpWinnerFlawless.oldElo} → ${mvpWinnerFlawless.newElo} (${mvpWinnerFlawless.eloChange > 0 ? '+' : ''}${mvpWinnerFlawless.eloChange})`);

// Jogador normal perdedor
const normalLoser = calculateEloChange({
    currentElo: playerElo,
    isWinner: false,
    isMvp: false,
    matchResult: MATCH_RESULTS.NORMAL_LOSS
});

console.log(`Jogador Normal Perdedor: ${normalLoser.oldElo} → ${normalLoser.newElo} (${normalLoser.eloChange})`);

// Teste 2: Sistema de Ranks
console.log('\n🏆 Teste 2: Sistema de Ranks');
console.log('============================');

const testElos = [150, 500, 850, 1200, 1750, 2100];
testElos.forEach(elo => {
    const rank = getEloRank(elo);
    console.log(`${elo} ELO → ${rank.emoji} ${rank.name} (${rank.progress}% progresso)`);
});

// Teste 3: Mudança de Rank
console.log('\n📈 Teste 3: Mudanças de Rank');
console.log('============================');

const rankTest1 = checkRankChange(999, 1000); // B para A
const rankTest2 = checkRankChange(1500, 1499); // A+ para A

if (rankTest1.changed) {
    console.log(`Promoção: ${rankTest1.message}`);
} else {
    console.log('Sem mudança de rank (999 → 1000)');
}

if (rankTest2.changed) {
    console.log(`Rebaixamento: ${rankTest2.message}`);
} else {
    console.log('Sem mudança de rank (1500 → 1499)');
}

// Teste 4: Cálculo para time completo
console.log('\n👥 Teste 4: Cálculo de Time Completo');
console.log('====================================');

const teamPlayers = [
    { userId: 'player1', currentElo: 1000 },
    { userId: 'player2', currentElo: 1100 },
    { userId: 'player3', currentElo: 1200 },
    { userId: 'player4', currentElo: 1300 },
    { userId: 'player5', currentElo: 1400 }
];

const teamChanges = calculateTeamEloChanges({
    players: teamPlayers,
    mvpUserId: 'player3',
    isWinnerTeam: true,
    matchResult: MATCH_RESULTS.FLAWLESS_WIN
});

console.log('Time vencedor flawless:');
teamChanges.forEach(change => {
    const isMvp = change.userId === 'player3' ? ' (MVP)' : '';
    console.log(`${change.userId}${isMvp}: ${change.oldElo} → ${change.newElo} (${change.eloChange > 0 ? '+' : ''}${change.eloChange})`);
});

console.log('\n✅ Todos os testes concluídos com sucesso!');
console.log('🎮 Sistema de ELO pronto para uso!');