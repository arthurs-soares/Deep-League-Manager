// handlers/panel/war/warLogic.js
const { loadGuildByName, saveGuildData } = require('../../db/guildDb');
const { loadTeamByName, saveTeamData } = require('../../db/teamDb');
const { loadUserProfile, saveUserProfile } = require('../../db/userProfileDb');

async function saveEntityScore(entityName, entityType, scoreChange) {
    let entityDB;
    if (entityType === 'guild') {
        entityDB = await loadGuildByName(entityName);
        if (entityDB) {
            entityDB.score.wins += scoreChange.wins;
            entityDB.score.losses += scoreChange.losses;
            entityDB.updatedAt = new Date().toISOString();
            await saveGuildData(entityDB);
        }
    } else if (entityType === 'team') {
        entityDB = await loadTeamByName(entityName);
        if (entityDB) {
            entityDB.score.wins += scoreChange.wins;
            entityDB.score.losses += scoreChange.losses;
            entityDB.updatedAt = new Date().toISOString();
            await saveTeamData(entityDB);
        }
    }
}

async function updatePartyMembersScore(entityData, entityType, result) {
    if (!entityData) {
        console.warn(`[Score Pessoal] Dados da entidade inválidos ou nulos recebidos.`);
        return;
    }
    const memberIds = new Set();
    if (entityType === 'guild') {
        if (entityData.leader?.id) memberIds.add(entityData.leader.id);
        if (entityData.coLeader?.id) memberIds.add(entityData.coLeader.id);
        (entityData.mainRoster || []).forEach(member => memberIds.add(member.id));
        (entityData.subRoster || []).forEach(member => memberIds.add(member.id));
    } else if (entityType === 'team') {
        if (entityData.leader?.id) memberIds.add(entityData.leader.id);
        (entityData.roster || []).forEach(member => memberIds.add(member.id));
    }

    if (memberIds.size === 0) {
        console.warn(`[Score Pessoal] Nenhum membro encontrado para a entidade ${entityData.name} (${entityType})`);
        return;
    }

    for (const userId of memberIds) {
        try {
            const userProfile = await loadUserProfile(userId);
            if (result === 'win') userProfile.personalScore.wins = (userProfile.personalScore.wins || 0) + 1;
            else userProfile.personalScore.losses = (userProfile.personalScore.losses || 0) + 1;
            await saveUserProfile(userProfile);
        } catch (error) {
            console.error(`[Score Pessoal] Falha ao atualizar o perfil do usuário ${userId}:`, error);
        }
    }
    console.log(`[Score Pessoal] Scores de '${result}' atualizados para ${memberIds.size} membros de ${entityData.name} (${entityType}).`);
}

async function processWarResultForPersonalScores(winningEntity, losingEntity) {
    try {
        let winningEntityDB = winningEntity.type === 'guild' ? await loadGuildByName(winningEntity.name) : await loadTeamByName(winningEntity.name);
        let losingEntityDB = losingEntity.type === 'guild' ? await loadGuildByName(losingEntity.name) : await loadTeamByName(losingEntity.name);

        if (winningEntityDB) await updatePartyMembersScore(winningEntityDB, winningEntity.type, 'win');
        else console.error(`[Score Pessoal] Entidade vencedora "${winningEntity.name}" não encontrada no DB.`);

        if (losingEntityDB) await updatePartyMembersScore(losingEntityDB, losingEntity.type, 'loss');
        else console.error(`[Score Pessoal] Entidade perdedora "${losingEntity.name}" não encontrada no DB.`);
    } catch (error) {
        console.error('❌ Erro fatal dentro de processWarResultForPersonalScores:', error);
    }
}

async function restrictThreadAccessOnCompletion(client, threadId) {
    console.log(`[RESTRICT THREAD] Iniciando para thread ID: ${threadId}`);
    if (!client || !threadId) {
        console.error('[RESTRICT THREAD] Parâmetros client ou threadId ausentes.');
        return;
    }

    try {
        const thread = await client.channels.fetch(threadId).catch((err) => {
            console.error(`[RESTRICT THREAD] Falha ao buscar canal com ID ${threadId}:`, err.message);
            return null;
        });

        if (!thread) {
            console.warn(`[RESTRICT THREAD] Canal ${threadId} não encontrado. Pulando restrição.`);
            return;
        }

        console.log(`[RESTRICT THREAD] Canal #${thread.name} encontrado. Tentando editar permissões.`);

        if (!thread.permissionOverwrites) {
            console.error(`[RESTRICT THREAD] Propriedade 'permissionOverwrites' não encontrada no objeto de canal. O canal pode não ser uma thread ou o bot não tem permissão para vê-lo corretamente.`);
            return;
        }

        await thread.permissionOverwrites.edit(thread.guild.roles.everyone, { SendMessages: false });
        console.log(`[RESTRICT THREAD] Permissão de @everyone editada.`);

        if (thread.send) {
            await thread.send('🔒 As permissões deste tópico foram ajustadas.').catch(e => console.warn(`[RESTRICT THREAD] Não foi possível enviar mensagem de aviso: ${e.message}`));
        }

        if (thread.archivable && !thread.locked) {
            await thread.setArchived(true, 'War concluída/Dodge.');
            console.log(`[RESTRICT THREAD] Thread ${threadId} arquivada com sucesso.`);
        } else {
            console.warn(`[RESTRICT THREAD] Thread ${threadId} não pode ser arquivada (archivable=${thread.archivable}, locked=${thread.locked}).`);
        }

    } catch (error) {
        console.error(`[RESTRICT THREAD] Erro durante o processo de restrição para ${threadId}:`, error);
    }
}

module.exports = {
    saveEntityScore,
    updatePartyMembersScore,
    processWarResultForPersonalScores,
    restrictThreadAccessOnCompletion,
};
