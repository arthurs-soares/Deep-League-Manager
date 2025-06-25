const { isUserInAnyGuild } = require('../db/guildDb'); // Único require do DB necessário para validateMemberEligibility

const COOLDOWN_DAYS = 3; 

async function validateMemberEligibility(memberId, currentGuild, globalConfig, memberUser) {
    // 1. Verificar se já está em outra guilda
    const userInGuild = await isUserInAnyGuild(memberId);
    if (userInGuild && userInGuild.id.toString() !== currentGuild.id.toString()) {
        return { elegible: false, error: `❌ O usuário ${memberUser.toString()} já está na guilda **${userInGuild.name}**!` };
    }

    // 2. Verificar o cooldown
    const recentlyLeftUser = globalConfig.recentlyLeftUsers.find(u => u.userId === memberId);
    if (recentlyLeftUser) {
        const leaveTime = new Date(recentlyLeftUser.leaveTimestamp);
        const cooldownEndTime = leaveTime.getTime() + (COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

        if (Date.now() < cooldownEndTime) {
            return { elegible: false, error: `❌ O usuário ${memberUser.toString()} está em cooldown e precisa esperar mais tempo para entrar em uma nova guilda.` };
        }
    }
    return { elegible: true, error: null };
}

function applyLeaveCooldown(userId, globalConfig) {
    const now = new Date(); 
    globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== userId);
    globalConfig.recentlyLeftUsers.push({ userId, leaveTimestamp: now.toISOString() });
    const cooldownPeriodMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => {
        const leaveTime = new Date(u.leaveTimestamp).getTime();
        return (leaveTime + cooldownPeriodMs) > now.getTime();
    });
}

// --- FUNÇÃO AUXILIAR: PROCESSAR ROSTER INPUT GERAL (para inputs de texto) ---
const processRosterInput = async (input) => { 
    if (!input) return { memberIds: [], errors: [] };

    const memberIdsRaw = input.split(',').map(id => id.trim()).filter(id => id);
    const cleanedMemberIds = [];
    const errors = [];

    for (const rawId of memberIdsRaw) {
        let cleanedId = rawId;
        const mentionMatch = rawId.match(/^<@!?(\d+)>$/); 

        if (mentionMatch) {
            cleanedId = mentionMatch[1]; 
        }

        if (!/^\d+$/.test(cleanedId)) { 
            errors.push(`ID inválido: \`${rawId}\`. Use ID numérico ou menção (<@ID>).`);
            continue;
        }
        cleanedMemberIds.push(cleanedId);
    }
    return { memberIds: cleanedMemberIds, errors: errors };
};

// --- FUNÇÃO AUXILIAR: ANALISAR MUDANÇAS NOS ROSTERS ---
function analyzeRosterChangesForSlotEdit(
    oldMainRoster,
    oldSubRoster,
    newProposedRoster, 
    rosterTypeBeingEdited,
    guildLeader,
    guildCoLeader
) {
    const oldMainIds = new Set(oldMainRoster.map(p => p.id));
    const oldSubIds = new Set(oldSubRoster.map(p => p.id));
    const allOldMemberIds = new Set([...oldMainIds, ...oldSubIds]); 

    const newProposedIds = new Set(newProposedRoster.map(p => p.id));

    let allPotentialNewMemberIdsInGuild;
    if (rosterTypeBeingEdited === 'main') {
        allPotentialNewMemberIdsInGuild = new Set([...newProposedIds, ...oldSubIds]);
    } else { 
        allPotentialNewMemberIdsInGuild = new Set([...newProposedIds, ...oldMainIds]); 
    }

    const playersAddedToGuild = []; // Novos na guilda
    const playersTrulyRemovedFromGuild = []; // Saíram da guilda
    const playersMovedWithinGuild = []; // Mudaram de roster (main <-> sub)

    for (const newPlayerId of newProposedIds) {
        if (!allOldMemberIds.has(newPlayerId)) {
            playersAddedToGuild.push(newPlayerId);
        }
    }

    for (const oldPlayerId of allOldMemberIds) {
        const isLeader = guildLeader?.id === oldPlayerId;
        const isCoLeader = guildCoLeader?.id === oldPlayerId;
        if (!isLeader && !isCoLeader) {
            if (!allPotentialNewMemberIdsInGuild.has(oldPlayerId)) {
                playersTrulyRemovedFromGuild.push(oldPlayerId);
            }
        }
    }
    
    if (rosterTypeBeingEdited === 'main') { // Editando Main Roster
        for (const newPlayerId of newProposedIds) {
            if (oldSubIds.has(newPlayerId) && !oldMainIds.has(newPlayerId)) { // Estava no SUB, não estava no MAIN, agora está no MAIN
                if (!playersAddedToGuild.includes(newPlayerId)) { // Garante que não é um jogador totalmente novo
                   playersMovedWithinGuild.push(newPlayerId);
                }
            }
        }
    } else { // Editando Sub Roster
        for (const newPlayerId of newProposedIds) {
            if (oldMainIds.has(newPlayerId) && !oldSubIds.has(newPlayerId)) { // Estava no MAIN, não estava no SUB, agora está no SUB
                 if (!playersAddedToGuild.includes(newPlayerId)) {
                    playersMovedWithinGuild.push(newPlayerId);
                 }
            }
        }
    }

    return {
        playersAddedToGuild,
        playersTrulyRemovedFromGuild,
        playersMovedWithinGuild
    };
}

module.exports = {
    validateMemberEligibility,
    applyLeaveCooldown,
    processRosterInput,
    analyzeRosterChangesForSlotEdit,
    COOLDOWN_DAYS, // Exporta a constante também, já que é usada por elas
    // MAX_ROSTER_SIZE não precisa ser exportado daqui se não for usado pelas utils diretamente
};