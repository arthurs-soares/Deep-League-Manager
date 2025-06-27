const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { loadGuildByName, saveGuildData } = require('../db/guildDb');
const { loadTeamByName, saveTeamData } = require('../db/teamDb');
const { saveWarTicket, loadWarTicketByThreadId, deleteWarTicket } = require('../db/warDb');
const { sendLogMessage } = require('../utils/logManager');
const { loadUserProfile, saveUserProfile } = require('../db/userProfileDb');
const { MAX_ROUNDS, ROUNDS_TO_WIN } = require('../utils/constants');
const { loadConfig } = require('../db/configDb');

// Importar as funções de criação de botões aqui. Este módulo SÓ DEVE IMPORTAR FUNÇÕES PARA CONSTRUIR BOTÕES, NUNCA HANDLERS DE MODAIS.
const { createWarCurrentButtons } = require('./warTicketButtons'); 

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

// handlers/panel/warTicketActions.js

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

        // Verifica se a propriedade 'permissionOverwrites' existe antes de usá-la
        if (!thread.permissionOverwrites) {
            console.error(`[RESTRICT THREAD] Propriedade 'permissionOverwrites' não encontrada no objeto de canal. O canal pode não ser uma thread ou o bot não tem permissão para vê-lo corretamente.`);
            return;
        }

        // Tenta editar a permissão de @everyone
        await thread.permissionOverwrites.edit(thread.guild.roles.everyone, { SendMessages: false });
        console.log(`[RESTRICT THREAD] Permissão de @everyone editada.`);

        // Tenta enviar a mensagem de aviso
        if (thread.send) {
            await thread.send('🔒 As permissões deste tópico foram ajustadas.').catch(e => console.warn(`[RESTRICT THREAD] Não foi possível enviar mensagem de aviso: ${e.message}`));
        }

        // Tenta arquivar a thread
        if (thread.archivable && !thread.locked) {
            await thread.setArchived(true, 'War concluída/Dodge.');
            console.log(`[RESTRICT THREAD] Thread ${threadId} arquivada com sucesso.`);
        } else {
            console.warn(`[RESTRICT THREAD] Thread ${threadId} não pode ser arquivada (archivable=${thread.archivable}, locked=${thread.locked}).`);
        }

    } catch (error) {
        // O log de erro agora será mais específico sobre qual operação falhou
        console.error(`[RESTRICT THREAD] Erro durante o processo de restrição para ${threadId}:`, error);
    }
}


/**
 * Lida com o clique no botão "Aceitar War".
 * @param {ButtonInteraction} interaction - A interação do botão.
 * @param {Client} client - A instância do bot.
 * @param {Object} globalConfig - A configuração global do bot.
 */
async function handleWarAcceptButton(interaction, client, globalConfig) {
    await interaction.deferUpdate();

    const threadId = interaction.channel.id;
    const warData = await loadWarTicketByThreadId(threadId);

    if (!warData || warData.status !== 'Aguardando Aceitação') {
        return interaction.followUp({ content: '❌ Esta war não está aguardando aceitação ou já foi iniciada/concluída.', ephemeral: true });
    }

    // --- Lógica de permissão para ACEITAR WAR (ROBUSTA E CORRIGIDA) ---

    // 1. Recarrega o membro que interagiu para garantir que os cargos estão atualizados
    const member = await interaction.guild.members.fetch(interaction.user.id);

    // 2. Verifica se o membro é um moderador geral ou administrador do servidor
    const isModerator = member.permissions.has('Administrator') ||
                        (globalConfig.moderatorRoles || []).some(roleId => member.roles.cache.has(roleId));

    // 3. Verifica se o membro é um operador de score
    const isScoreOperator = (globalConfig.scoreOperatorRoles || []).some(roleId => member.roles.cache.has(roleId));
    
    // 4. Se for staff, já tem permissão.
    let hasPermission = isModerator || isScoreOperator;

    // 5. Se ainda não tem permissão, verifica se é líder/co-líder da entidade inimiga
    if (!hasPermission) {
        const enemyEntity = warData.enemyEntity;
        let enemyEntityData;

        // Carrega a entidade correta (guilda ou time) do banco de dados
        if (enemyEntity.type === 'guild') {
            enemyEntityData = await loadGuildByName(enemyEntity.name);
        } else if (enemyEntity.type === 'team') {
            enemyEntityData = await loadTeamByName(enemyEntity.name);
        }
        
        // Verifica se a entidade existe e se o usuário tem cargo de liderança nela
        if (enemyEntityData) {
            if (enemyEntityData.leader?.id === interaction.user.id) {
                hasPermission = true;
            }
            // Se for guilda, verifica também se é co-líder
            if (enemyEntity.type === 'guild' && enemyEntityData.coLeader?.id === interaction.user.id) {
                hasPermission = true;
            }
        }
    }

    // 6. Verificação final
    if (!hasPermission) {
        return interaction.followUp({
            content: `❌ Apenas o líder/co-líder da entidade inimiga, moderadores ou operadores de score podem aceitar a war.`,
            ephemeral: true
        });
    }

    // --- O resto da lógica da função ---
    warData.status = 'Aceita';
    warData.currentRound = 1;

    await saveWarTicket(warData);

let warEmbed = new EmbedBuilder(interaction.message.embeds[0].toJSON());
    warEmbed.fields = warEmbed.data.fields || [];

    const statusFieldIndex = warEmbed.fields.findIndex(field => field.name === 'Status');
    const newStatusValue = `✅ War Aceita - Round ${warData.currentRound}`;
    if (statusFieldIndex !== -1) {
        warEmbed.spliceFields(statusFieldIndex, 1, { name: 'Status', value: newStatusValue, inline: false });
    } else {
        warEmbed.addFields({ name: 'Status', value: newStatusValue, inline: false });
    }
    warEmbed.setColor('#3498DB');

    // A função createWarCurrentButtons já deve estar usando a nova estrutura warData
    const components = createWarCurrentButtons(warData);
    await interaction.message.edit({ embeds: [warEmbed], components: components });
    await saveWarTicket(warData);
    await interaction.message.edit({ embeds: [warEmbed], components: components });
    await interaction.channel.send(`🎉 A War/Glad entre **${warData.yourEntity.name}** e **${warData.enemyEntity.name}** foi **ACEITA**! Boa sorte!`);

    await sendLogMessage(
        client, globalConfig, interaction,
        'War Aceita',
        `A War/Glad entre **${warData.yourEntity.name}** e **${warData.enemyEntity.name}** foi aceita.`,
        [
            { name: 'Status Atual', value: warData.status, inline: true },
            { name: 'Thread da War', value: interaction.channel.url, inline: true },
        ]
    );
}


/**
 * Lida com o clique no botão "Solicitar Dodge". Abre um modal para o operador selecionar a guilda que deu dodge.
 * @param {ButtonInteraction} interaction - A interação do botão.
 * @param {Client} client - A instância do bot.
 * @param {Object} globalConfig - A configuração global do bot.
 */
async function handleWarRequestDodgeButton(interaction, client, globalConfig) {
    const threadId = interaction.channel.id;
    const warData = await loadWarTicketByThreadId(threadId);

    // ✅ CORREÇÃO: Permite Dodge em 'Aguardando Aceitação' OU 'Aceita'
    if (!warData || (warData.status !== 'Aguardando Aceitação' && warData.status !== 'Aceita')) {
        return interaction.reply({ content: '❌ Esta war já foi concluída ou não pode ser declarada Dodge.', ephemeral: true });
    }

    // --- LÓGICA DE PERMISSÃO ROBUSTA (CORRIGIDA) ---

    // 1. Recarrega o membro que interagiu para garantir que os cargos estão atualizados
    const member = await interaction.guild.members.fetch(interaction.user.id);

    // 2. Verifica se o membro é um moderador geral ou administrador do servidor
    const isModerator = member.permissions.has('Administrator') ||
                        (globalConfig.moderatorRoles || []).some(roleId => member.roles.cache.has(roleId));

    // 3. Verifica se o membro é um operador de score
    const isScoreOperator = (globalConfig.scoreOperatorRoles || []).some(roleId => member.roles.cache.has(roleId));

    // 4. Verificação final
    if (!isModerator && !isScoreOperator) {
        return interaction.reply({ 
            content: '❌ Apenas moderadores ou operadores de score podem declarar Dodge.', 
            ephemeral: true 
        });
    }

    // Se chegou aqui, a permissão foi concedida.

    const modal = new ModalBuilder()
        .setCustomId(`modal_war_dodge_select_guild_${threadId}`)
        .setTitle('Declarar Dodge');

    const dodgingEntityInput = new TextInputBuilder()
        .setCustomId('dodging_entity_name') // Nome do campo genérico
        .setLabel('Nome da Entidade que Deu Dodge (EXATO)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`${warData.yourEntity.name} ou ${warData.enemyEntity.name}`)
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(dodgingEntityInput));

    await interaction.showModal(modal);
}
/**
 * Lida com a submissão do modal de seleção de guilda para Dodge.
 * Executa a lógica de Dodge.
 * @param {ModalSubmitInteraction} interaction - A interação de submissão do modal.
 * @param {Client} client - A instância do bot.
 * @param {Object} globalConfig - A configuração global do bot.
 */
async function handleWarDodgeSelectGuildSubmit(interaction, client) { 
    await interaction.deferReply({ ephemeral: true });
    const currentConfig = await loadConfig();
    const threadId = interaction.channel.id;
    const warData = await loadWarTicketByThreadId(threadId);

    // ✅ CORREÇÃO: Permite Dodge em 'Aguardando Aceitação' OU 'Aceita'
    if (!warData || (warData.status !== 'Aguardando Aceitação' && warData.status !== 'Aceita')) {
        return interaction.editReply({ content: '❌ Esta war já foi concluída ou não pode ser declarada Dodge neste momento.' });
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const isModerator = member.permissions.has('Administrator') || (currentConfig.moderatorRoles || []).some(roleId => member.roles.cache.has(roleId));
    const isScoreOperator = (currentConfig.scoreOperatorRoles || []).some(roleId => member.roles.cache.has(roleId));

    if (!isModerator && !isScoreOperator) {
        return interaction.editReply({ content: '❌ Apenas moderadores ou operadores de score podem declarar Dodge.' });
    }

    const dodgingEntityName = interaction.fields.getTextInputValue('dodging_entity_name');
    let dodgingEntity, winnerEntity;

    if (dodgingEntityName.toLowerCase() === warData.yourEntity.name.toLowerCase()) {
        dodgingEntity = warData.yourEntity;
        winnerEntity = warData.enemyEntity;
    } else if (dodgingEntityName.toLowerCase() === warData.enemyEntity.name.toLowerCase()) {
        dodgingEntity = warData.enemyEntity;
        winnerEntity = warData.yourEntity;
    } else {
        return interaction.editReply({ content: `❌ O nome "${dodgingEntityName}" não corresponde a nenhuma entidade nesta war.` });
    }

    warData.status = 'Dodge';
    await saveWarTicket(warData);
    
    // Atualiza Scores
    await saveEntityScore(winnerEntity.name, winnerEntity.type, { wins: 1, losses: 0 });
    await saveEntityScore(dodgingEntity.name, dodgingEntity.type, { wins: 0, losses: 1 });
    await processWarResultForPersonalScores(winnerEntity, dodgingEntity);

    client.emit('updateLeaderboard');
    client.emit('updateTeamLeaderboard');
    
    // Atualiza Embed
    const warEmbed = new EmbedBuilder(interaction.message.embeds[0].toJSON());
    const statusFieldIndex = warEmbed.data.fields.findIndex(field => field.name === 'Status');
    if (statusFieldIndex !== -1) {
        warEmbed.spliceFields(statusFieldIndex, 1, { name: 'Status', value: `🏃 Dodge - ${dodgingEntity.name} Fugiu`, inline: false });
    }
    warEmbed.setColor('#FF0000');
    warEmbed.addFields({ name: 'Resultado', value: `**${dodgingEntity.name}** fugiu da War/Glad contra **${winnerEntity.name}**.`, inline: false });
    await interaction.message.edit({ embeds: [warEmbed], components: [] });

    await interaction.channel.send(`**Atenção!** A War/Glad foi declarada **DODGE**! **${dodgingEntity.name}** fugiu!`);

    // --- BLOCO DE LOG DE DODGE CORRIGIDO E COM DEBUG ---
    const dodgeLogChannelId = currentConfig.dodgeLogChannelId; // Usa a config recém-carregada
    console.log(`[DODGE LOG DEBUG] Tentando enviar log de dodge. ID do canal configurado: ${dodgeLogChannelId}`);

    if (dodgeLogChannelId) {
        const dodgeLogChannel = await client.channels.fetch(dodgeLogChannelId).catch(() => null);
        if (dodgeLogChannel && dodgeLogChannel.type === ChannelType.GuildText && dodgeLogChannel.permissionsFor(client.user).has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
            const dodgeEmbed = new EmbedBuilder()
                .setTitle('🚨 DODGE DETECTADO! 🚨')
                .setColor('#FF0000')
                .setDescription(`Uma War/Glad foi declarada como **DODGE** no ticket: <#${interaction.channel.id}>`)
                .addFields(
                    { name: 'Entidade que Deu Dodge', value: `${dodgingEntity.name} (${dodgingEntity.type})`, inline: true },
                    { name: 'Entidade Vencedora', value: `${winnerEntity.name} (${winnerEntity.type})`, inline: true },
                    { name: 'Declarado por', value: interaction.user.tag, inline: false }
                )
                .setTimestamp();
            await dodgeLogChannel.send({ embeds: [dodgeEmbed] });
            console.log(`[DODGE LOG DEBUG] Log de dodge enviado com sucesso para #${dodgeLogChannel.name}.`);
    } else {
        console.warn('⚠️ [DODGE LOG] ID do canal de log de dodge não está definido na configuração.');
    }
    } else {
        console.warn('⚠️ [DODGE LOG] ID do canal de log de dodge não está definido em globalConfig.dodgeLogChannelId. Pulando log de dodge.');
    }

    // O log principal (já estava funcionando)
    await sendLogMessage(client, currentConfig, interaction, 'War Dodge Declarada', `**${dodgingEntity.name}** fugiu contra **${winnerEntity.name}**.`);
    
    await deleteWarTicket(threadId);
    
    // Passa a config atual para a função de restrição
    await restrictThreadAccessOnCompletion(interaction, client, currentConfig, warData);
    
    await interaction.editReply({ content: `✅ Dodge registrado com sucesso!` });
}

/**
 * Lida com os cliques nos botões de pontuação de round.
 * @param {ButtonInteraction} interaction - A interação do botão.
 * @param {Client} client - A instância do bot.
 * @param {Object} globalConfig - A configuração global do bot.
 */
async function handleWarRoundButton(interaction, client, globalConfig) {
    await interaction.deferUpdate();
    // O customId é: war_round_win_{NOME_COM_UNDERSCORES}_{ROUND}
    const customIdParts = interaction.customId.split('_');
    const roundNumberStr = customIdParts.pop();

    const winningEntityIdForButton = customIdParts.slice(3).join('_');
    // Converte os underscores de volta para espaços para a comparação
    const winningEntityName = winningEntityIdForButton.replace(/_/g, ' ');

    const currentRoundClicked = parseInt(roundNumberStr);

    const threadId = interaction.channel.id;
    const warData = await loadWarTicketByThreadId(threadId);

    // --- Validações de Status e Round ---
    // (O resto da função pode continuar como está, pois agora `winningEntityName` estará no formato correto)
    if (!warData || warData.status !== 'Aceita') {
        return interaction.followUp({ content: '...', ephemeral: true });
    }
    if (currentRoundClicked !== warData.currentRound) {
        return interaction.followUp({ content: `❌ Você só pode votar no Round ${warData.currentRound} agora.`, ephemeral: true });
    }

    // --- Verificação de Permissões ---
    const isModerator = (globalConfig.moderatorRoles || []).some(roleId => interaction.member.roles.cache.has(roleId));
    const isScoreOperator = (globalConfig.scoreOperatorRoles || []).some(roleId => interaction.member.roles.cache.has(roleId));

    if (!isModerator && !isScoreOperator) {
        return interaction.followUp({ content: '❌ Apenas moderadores ou operadores de score podem registrar o resultado das rodadas.', ephemeral: true });
    }

    // --- Lógica do Round ---
    let losingEntityName;
    if (winningEntityName.toLowerCase() === warData.yourEntity.name.toLowerCase()) {
        losingEntityName = warData.enemyEntity.name;
    } else if (winningEntityName.toLowerCase() === warData.enemyEntity.name.toLowerCase()) {
        losingEntityName = warData.yourEntity.name;
    } else {
        return interaction.followUp({ content: '❌ Erro interno: Nome da entidade vencedora da rodada inválido.', ephemeral: true });
    }

    // Atualiza o score do round
    warData.roundScores[winningEntityName]++;
    warData.currentRound++; // Avança para o próximo round

    // --- Atualização do Embed e Componentes ---
    const warEmbed = new EmbedBuilder(interaction.message.embeds[0].toJSON());
    warEmbed.fields = warData.fields || [];
    let components = [];

    const scoreFieldIndex = warEmbed.fields.findIndex(field => field.name === 'Score Atual');
    const newScoreValue = `${warData.yourEntity.name}: ${warData.roundScores[warData.yourEntity.name]} | ${warData.enemyEntity.name}: ${warData.roundScores[warData.enemyEntity.name]}`;
    if (scoreFieldIndex !== -1) {
        warEmbed.spliceFields(scoreFieldIndex, 1, { name: 'Score Atual', value: newScoreValue, inline: false });
    } else {
        warEmbed.addFields({ name: 'Score Atual', value: newScoreValue, inline: false });
    }

    let finalMessage = '';
    let winnerDeclared = false;

    // --- Lógica de Vitória (2 de 3 rounds) ---
    const yourScore = warData.roundScores[warData.yourEntity.name];
    const enemyScore = warData.roundScores[warData.enemyEntity.name];

    if (yourScore >= ROUNDS_TO_WIN || enemyScore >= ROUNDS_TO_WIN) {
        winnerDeclared = true;
        const finalWinner = yourScore >= ROUNDS_TO_WIN ? warData.yourEntity : warData.enemyEntity;
        const finalLoser = yourScore >= ROUNDS_TO_WIN ? warData.enemyEntity : warData.yourEntity;

        finalMessage = `🎉 Parabéns! **${finalWinner.name}** venceu a War/Glad contra **${finalLoser.name}** por ${yourScore}x${enemyScore}!`;
        warEmbed.addFields({ name: '🏆 Vencedor da War', value: `**${finalWinner.name}** (${finalWinner.type})`, inline: false });
        warEmbed.setColor('#2ECC71');

        const statusFieldIndex = warEmbed.fields.findIndex(field => field.name === 'Status');
        if (statusFieldIndex !== -1) {
            warEmbed.spliceFields(statusFieldIndex, 1, { name: 'Status', value: '✅ Concluída', inline: false });
        } else {
            warEmbed.addFields({ name: 'Status', value: '✅ Concluída', inline: false });
        }

        warData.status = 'Concluída';
        components = []; // Remove os botões

        // --- ATUALIZAÇÃO GENERALIZADA DOS SCORES ---
        // Atualiza scores das entidades (time ou guilda)
        await saveEntityScore(finalWinner.name, finalWinner.type, { wins: 1, losses: 0 });
        await saveEntityScore(finalLoser.name, finalLoser.type, { wins: 0, losses: 1 });

        // Atualiza scores pessoais dos membros
        await processWarResultForPersonalScores(finalWinner, finalLoser);

        // Emite eventos para ambos os rankings
        client.emit('updateLeaderboard');
        client.emit('updateTeamLeaderboard'); // Adicionar este evento no seu index.js se não existir

         // ✅ CORREÇÃO AQUI: Passe 'interaction' como primeiro argumento
        await restrictThreadAccessOnCompletion(interaction, client, globalConfig, warData); 
        await deleteWarTicket(warData.threadId);



    } else if (warData.currentRound <= MAX_ROUNDS) {
        // A war continua, cria botões para o próximo round
        components = createWarCurrentButtons(warData);
        const statusFieldIndex = warEmbed.fields.findIndex(field => field.name === 'Status');
        const newStatus = `Round ${warData.currentRound} - Em Andamento`;
        if (statusFieldIndex !== -1) {
            warEmbed.spliceFields(statusFieldIndex, 1, { name: 'Status', value: newStatus, inline: false });
        } else {
            warEmbed.addFields({ name: 'Status', value: newStatus, inline: false });
        }
    } else {
        // Empate ou sem vencedor
        finalMessage = `🚫 A War/Glad entre **${warData.yourEntity.name}** e **${warData.enemyEntity.name}** terminou sem um vencedor claro.`;
        warEmbed.setColor('#95A5A6');
        const statusFieldIndex = warEmbed.fields.findIndex(field => field.name === 'Status');
        if (statusFieldIndex !== -1) {
            warEmbed.spliceFields(statusFieldIndex, 1, { name: 'Status', value: '🚫 Sem Vencedor Claro', inline: false });
        }
        warData.status = 'Concluída';
        components = [];
        await restrictThreadAccessOnCompletion(interaction, client, globalConfig, warData);
        await deleteWarTicket(warData.threadId);
    }

    // Salva o estado atualizado da war
    await saveWarTicket(warData);

    // Edita a mensagem do embed na thread
    await interaction.message.edit({ embeds: [warEmbed], components: components });

    // Enviar log da ação de round
    const logFields = [
        { name: `Vencedor do Round ${currentRoundClicked}`, value: winningEntityName, inline: true },
        { name: 'Score Atual', value: newScoreValue, inline: true },
        { name: 'Status da War', value: warData.status, inline: true },
        { name: 'Thread', value: interaction.channel.url, inline: false },
    ];
    if (winnerDeclared) {
        logFields.push({ name: 'Vencedor Final Declarado', value: yourScore >= ROUNDS_TO_WIN ? warData.yourEntity.name : warData.enemyEntity.name, inline: false });
    }
    await sendLogMessage(
        client, globalConfig, interaction,
        'Resultado de Round de War',
        `Resultado do Round ${currentRoundClicked} da war entre **${warData.yourEntity.name}** e **${warData.enemyEntity.name}** foi registrado.`,
        logFields
    );

    if (finalMessage) {
        await interaction.channel.send(finalMessage);
    }
    console.log(`[DEBUG ROUND] Ação de round ${currentRoundClicked} concluída com sucesso.`);
}

module.exports = {
    handleWarAcceptButton,
    handleWarRequestDodgeButton,
    handleWarDodgeSelectGuildSubmit,
    handleWarRoundButton,
};
