// handlers/panel/rosterUtils.js
// (Idealmente, mova COOLDOWN_DAYS e MAX_ROSTER_SIZE para handlers/utils/constants.js e importe de lá)

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

module.exports = {
    processRosterInput,
};