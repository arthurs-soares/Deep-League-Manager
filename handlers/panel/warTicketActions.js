// handlers/panel/warTicketActions.js
const { EmbedBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
// Importações DIRETAS dos módulos necessários
const { loadGuildByName, saveGuildData } = require('../db/guildDb');
const { saveWarTicket, loadWarTicketByThreadId, deleteWarTicket } = require('../db/warDb'); 
const { sendLogMessage } = require('../utils/logManager');                              // <-- Caminho corrigido
const { resolveDisplayColor } = require('../utils/constants');                      // <-- Caminho corrigido
const { loadUserProfile, saveUserProfile } = require('../db/userProfileDb'); // <-- ADICIONE ESTA LINHA

// Importar as funções de criação de botões aqui. Este módulo SÓ DEVE IMPORTAR FUNÇÕES PARA CONSTRUIR BOTÕES, NUNCA HANDLERS DE MODAIS.
const { createWarCurrentButtons } = require('./warTicketButtons'); 

const MAX_ROUNDS = 3; 
const ROUNDS_TO_WIN = 2; 



/**
 * Restringe o acesso à thread após a conclusão ou dodge de uma war.
 * Permite que apenas moderadores, operadores de score, o solicitante e os líderes/co-líderes
 * das guildas envolvidas continuem enviando mensagens. Arquiva a thread.
 * @param {ThreadChannel} thread - O canal da thread da war.
 * @param {Client} client - A instância do bot.
 * @param {Object} globalConfig - A configuração global do bot.
 * @param {Object} warData - Os dados da war.
* @param {Object} winningGuild - O objeto da guilda vencedora (do DB).
 * @param {Object} losingGuild - O objeto da guilda perdedora (do DB).
 */

// Substitua a função inteira em handlers/panel/warTicketActions.js

/**
 * Atualiza o score pessoal de vitórias/derrotas para todos os membros de uma guilda.
 * @param {Object} guild - O objeto completo da guilda.
 * @param {'win' | 'loss'} result - Se a guilda 'ganhou' ou 'perdeu'.
 */
async function updatePartyMembersScore(guild, result) {
    if (!guild || !guild.name) return;

    // Cria um Set para garantir que cada membro seja processado apenas uma vez.
    const memberIds = new Set();

    // Adiciona o líder e o vice-líder, se existirem.
    if (guild.leader?.id) memberIds.add(guild.leader.id);
    if (guild.coLeader?.id) memberIds.add(guild.coLeader.id);

    // Adiciona todos os membros dos rosters.
    (guild.mainRoster || []).forEach(member => memberIds.add(member.id));
    (guild.subRoster || []).forEach(member => memberIds.add(member.id));

    console.log(`[Score Pessoal DEBUG] Guilda: ${guild.name}, Resultado: ${result}, Membros a serem atualizados: ${memberIds.size}`);

    if (memberIds.size === 0) {
        console.warn(`[Score Pessoal] Nenhum membro (líder, co-líder, ou roster) encontrado para a guilda ${guild.name} para atualizar scores.`);
        return;
    }

    for (const userId of memberIds) {
        try {
            const userProfile = await loadUserProfile(userId);
            if (result === 'win') {
                userProfile.personalScore.wins = (userProfile.personalScore.wins || 0) + 1;
            } else {
                userProfile.personalScore.losses = (userProfile.personalScore.losses || 0) + 1;
            }
            await saveUserProfile(userProfile);
        } catch (error) {
            console.error(`[Score Pessoal] Falha ao atualizar o perfil do usuário ${userId}:`, error);
        }
    }

    console.log(`[Score Pessoal] Scores de '${result}' atualizados para ${memberIds.size} membros da guilda ${guild.name}.`);
}

/**
 * Função principal que orquestra a atualização dos scores após uma war.
 * Renomeada de updatePersonalScores para uma maior clareza.
 * @param {string} winningGuildName - O NOME da guilda vencedora.
 * @param {string} losingGuildName - O NOME da guilda perdedora.
 */
async function processWarResultForPersonalScores(winningGuildName, losingGuildName) {
    try {
        const winningGuild = await loadGuildByName(winningGuildName);
        const losingGuild = await loadGuildByName(losingGuildName);

        if (winningGuild) {
            await updatePartyMembersScore(winningGuild, 'win');
        } else {
            console.error(`[Score Pessoal] Guilda vencedora "${winningGuildName}" não encontrada no DB para atualizar scores.`);
        }

        if (losingGuild) {
            await updatePartyMembersScore(losingGuild, 'loss');
        } else {
            console.error(`[Score Pessoal] Guilda perdedora "${losingGuildName}" não encontrada no DB para atualizar scores.`);
        }
    } catch (error) {
        console.error('❌ Erro fatal dentro de processWarResultForPersonalScores:', error);
    }
}

async function restrictThreadAccessOnCompletion(interaction, client, globalConfig, warData) {
    const thread = interaction.channel;
    if (!thread || !client || !globalConfig || !warData) {
        console.error('[RESTRICT THREAD] Parâmetros ausentes para restrictThreadAccessOnCompletion.');
        return;
    }

    try {
        // 1. Nega SendMessages para @everyone na thread
        await thread.permissionOverwrites.edit(thread.guild.roles.everyone, { // Usa a `thread` definida acima
            SendMessages: false,
            SendMessagesInThreads: false,
        });
        console.log(`[RESTRICT THREAD] Negado SendMessages para @everyone na thread ${thread.id}`);

        // 2. Garante que roles específicas (moderadores, operadores de score) PODEM enviar mensagens
        const rolesToAllowSend = new Set();
        if (globalConfig.moderatorRoles) {
            globalConfig.moderatorRoles.forEach(id => rolesToAllowSend.add(id));
        }
        if (globalConfig.scoreOperatorRoles) {
            globalConfig.scoreOperatorRoles.forEach(id => rolesToAllowSend.add(id));
        }

        for (const roleId of rolesToAllowSend) {
            const role = await thread.guild.roles.fetch(roleId).catch(() => null);
            if (role) {
                await thread.permissionOverwrites.edit(role.id, { SendMessages: true, SendMessagesInThreads: true });
                console.log(`[RESTRICT THREAD] Garantido SendMessages para o cargo ${role.name} na thread ${thread.id}`);
            }
        }

        // 3. Garante que usuários específicos (solicitante, líderes, co-líderes, bot) PODEM enviar mensagens
        const usersToEnsureSend = new Set([
            client.user.id, warData.requesterId,
            warData.yourGuild.leader?.id, warData.yourGuild.coLeader?.id,
            warData.enemyGuild.leader?.id, warData.enemyGuild.coLeader?.id
        ].filter(Boolean)); // .filter(Boolean) remove undefined/null IDs

        for (const userId of usersToEnsureSend) {
            const member = await thread.guild.members.fetch(userId).catch(() => null);
            if (member) {
                await thread.permissionOverwrites.edit(member.id, { SendMessages: true, SendMessagesInThreads: true });
            }
        }
        
        await thread.send('🔒 As permissões deste tópico foram ajustadas. Apenas moderadores, operadores de score e os líderes/requester originais podem enviar novas mensagens. O tópico será arquivado em breve.');
        if (thread.archivable && !thread.locked) { // Arquiva se possível e não explicitamente bloqueado por setLocked
            await thread.setArchived(true, 'War concluída/Dodge. Tópico arquivado.');
            console.log(`[RESTRICT THREAD] Thread ${thread.id} arquivada.`);
        }
    } catch (error) {
        console.error(`[RESTRICT THREAD] Erro em restrictThreadAccessOnCompletion para ${thread.id}:`, error);
        try {
            await thread.send(`⚠️ Ocorreu um erro ao tentar ajustar as permissões e arquivar este tópico: ${error.message}`);
        } catch (sendError) {
            console.error(`[RESTRICT THREAD] Não foi possível enviar mensagem de erro para a thread ${thread.id}:`, sendError);
        }
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

    console.log(`[DEBUG ACEITAR] warData carregado para thread ${threadId}:`, warData);
    console.log(`[DEBUG ACEITAR] Status da warData: ${warData ? warData.status : 'undefined'}`);


    if (!warData || warData.status !== 'Aguardando Aceitação') {
        console.log(`[DEBUG ACEITAR] Condição de aceitação FALHOU: warData é ${warData ? 'válido' : 'nulo/indefinido'} ou status não é 'Aguardando Aceitação' (status atual: ${warData ? warData.status : 'N/A'})`);
        return interaction.followUp({ content: '❌ Esta war não está aguardando aceitação ou já foi iniciada/concluída.', ephemeral: true });
    }
    console.log(`[DEBUG ACEITAR] Condição de aceitação PASSOU.`);


    // Lógica de permissão para ACEITAR WAR
    const enemyGuild = await loadGuildByName(warData.enemyGuild.name);
    const isEnemyGuildLeaderCoLeader = enemyGuild && (enemyGuild.leader?.id === interaction.user.id || enemyGuild.coLeader?.id === interaction.user.id);
    const isModerator = (globalConfig.moderatorRoles || []).some(roleId => interaction.member.roles.cache.has(roleId));
    const isScoreOperator = (globalConfig.scoreOperatorRoles || []).some(roleId => interaction.member.roles.cache.has(roleId)); 

    if (!isEnemyGuildLeaderCoLeader && !isModerator && !isScoreOperator) {
        console.log(`[DEBUG ACEITAR] Falha de permissão para ${interaction.user.tag}.`);
        return interaction.followUp({ 
            content: '❌ Apenas o líder/co-líder da guilda inimiga, moderadores ou operadores de score podem aceitar a war.', 
            ephemeral: true 
        });
    }
    console.log(`[DEBUG ACEITAR] Permissões VERIFICADAS para ${interaction.user.tag}.`);


    warData.status = 'Aceita';
    warData.currentRound = 1; 

    let warEmbed;
    if (interaction.message.embeds && interaction.message.embeds.length > 0 && interaction.message.embeds[0]) {
        warEmbed = new EmbedBuilder(interaction.message.embeds[0].toJSON());
    } else {
        warEmbed = new EmbedBuilder()
            .setTitle(`🔥 War/Glad - ${warData.yourGuild.name} vs ${warData.enemyGuild.name}`)
            .setDescription('Estado da war. (Embed original não encontrado, reconstruído.)')
            .setColor(globalConfig.embedColor || '#FFD700');
    }
    warEmbed.fields = warEmbed.data.fields || []; 

    const statusFieldIndex = warEmbed.fields.findIndex(field => field.name === 'Status');
    if (statusFieldIndex !== -1) {
        warEmbed.spliceFields(statusFieldIndex, 1, { name: 'Status', value: `✅ War Aceita - Round ${warData.currentRound}`, inline: false });
    } else {
        warEmbed.addFields({ name: 'Status', value: `✅ War Aceita - Round ${warData.currentRound}`, inline: false });
    }
    warEmbed.setColor('#3498DB'); 

    const components = createWarCurrentButtons(warData);

    await saveWarTicket(warData); 
    console.log(`[DEBUG ACEITAR] warData salva no DB com status: ${warData.status}`);

    await interaction.message.edit({ embeds: [warEmbed], components: components });
    await interaction.channel.send(`🎉 A War/Glad entre **${warData.yourGuild.name}** e **${warData.enemyGuild.name}** foi **ACEITA**! Boa sorte!`);

    await sendLogMessage(
        client, globalConfig, interaction,
        'War Aceita',
        `A War/Glad entre **${warData.yourGuild.name}** e **${warData.enemyGuild.name}** foi aceita.`,
        [
            { name: 'Status Atual', value: warData.status, inline: true },
            { name: 'Thread da War', value: interaction.channel.url, inline: true },
        ]
    );
    console.log(`[DEBUG ACEITAR] Aceitação de war concluída com sucesso.`);
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

    console.log(`[DEBUG DODGE] warData carregado para thread ${threadId}:`, warData);
    console.log(`[DEBUG DODGE] Status da warData: ${warData ? warData.status : 'undefined'}`);

    if (!warData || warData.status === 'Concluída' || warData.status === 'WO' || warData.status === 'Dodge') {
        console.log(`[DEBUG DODGE] Condição de dodge FALHOU: warData é ${warData ? 'válido' : 'nulo/indefinido'} ou status inválido (status atual: ${warData ? warData.status : 'N/A'})`);
        return interaction.reply({ content: '❌ Esta war já foi concluída ou não pode ser declarada Dodge.', ephemeral: true });
    }
    console.log(`[DEBUG DODGE] Condição de dodge PASSOU.`);


    // Lógica de permissão para SOLICITAR DODGE
    const isModerator = (globalConfig.moderatorRoles || []).some(roleId => interaction.member.roles.cache.has(roleId));
    const isScoreOperator = (globalConfig.scoreOperatorRoles || []).some(roleId => interaction.member.roles.cache.has(roleId));

    if (!isModerator && !isScoreOperator) {
        console.log(`[DEBUG DODGE] Falha de permissão para ${interaction.user.tag}.`);
        return interaction.reply({ 
            content: '❌ Apenas moderadores ou operadores de score podem solicitar/declarar Dodge.', 
            ephemeral: true 
        });
    }
    console.log(`[DEBUG DODGE] Permissões VERIFICADAS para ${interaction.user.tag}.`);


    const modal = new ModalBuilder()
        .setCustomId(`modal_war_dodge_select_guild_${threadId}`) 
        .setTitle('Declarar Dodge');

    const dodgingGuildInput = new TextInputBuilder()
        .setCustomId('dodging_guild_name')
        .setLabel('Nome da Guilda que Deu Dodge (EXATO)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: Guilda Que Fugiu')
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(dodgingGuildInput));

    await interaction.showModal(modal);
    console.log(`[DEBUG DODGE] Modal de dodge exibido.`);
}

/**
 * Lida com a submissão do modal de seleção de guilda para Dodge.
 * Executa a lógica de Dodge.
 * @param {ModalSubmitInteraction} interaction - A interação de submissão do modal.
 * @param {Client} client - A instância do bot.
 * @param {Object} globalConfig - A configuração global do bot.
 */
async function handleWarDodgeSelectGuildSubmit(interaction, client, globalConfig) {
    await interaction.deferReply({ ephemeral: true });

    const threadId = interaction.channel.id;
    const warData = await loadWarTicketByThreadId(threadId);

    console.log(`[DEBUG DODGE SUBMIT] warData carregado para thread ${threadId}:`, warData);
    console.log(`[DEBUG DODGE SUBMIT] Status da warData: ${warData ? warData.status : 'undefined'}`);

    if (!warData || warData.status === 'Concluída' || warData.status === 'WO' || warData.status === 'Dodge') {
        console.log(`[DEBUG DODGE SUBMIT] Condição de dodge submissão FALHOU: warData é ${warData ? 'válido' : 'nulo/indefinido'} ou status inválido (status atual: ${warData ? warData.status : 'N/A'})`);
        return interaction.editReply({ content: '❌ Esta war já foi concluída ou não pode ser declarada Dodge neste momento.', ephemeral: true });
    }
    console.log(`[DEBUG DODGE SUBMIT] Condição de dodge submissão PASSOU.`);


    // Lógica de permissão para SUBMETER DODGE
    const isModerator = (globalConfig.moderatorRoles || []).some(roleId => interaction.member.roles.cache.has(roleId));
    const isScoreOperator = (globalConfig.scoreOperatorRoles || []).some(roleId => interaction.member.roles.cache.has(roleId));

    if (!isModerator && !isScoreOperator) {
        console.log(`[DEBUG DODGE SUBMIT] Falha de permissão para ${interaction.user.tag}.`);
        return interaction.editReply({ 
            content: '❌ Você não tem permissão para declarar Dodge. Apenas moderadores ou operadores de score.', 
            ephemeral: true 
        });
    }
    console.log(`[DEBUG DODGE SUBMIT] Permissões VERIFICADAS para ${interaction.user.tag}.`);

    const dodgingGuildName = interaction.fields.getTextInputValue('dodging_guild_name');
    console.log(`[DEBUG DODGE SUBMIT] Guilda digitada para dodge: ${dodgingGuildName}`);

    let winnerGuildName;
    let dodgingGuildData;

    if (dodgingGuildName.toLowerCase() === warData.yourGuild.name.toLowerCase()) {
        dodgingGuildData = warData.yourGuild;
        winnerGuildName = warData.enemyGuild.name;
    } else if (dodgingGuildName.toLowerCase() === warData.enemyGuild.name.toLowerCase()) {
        dodgingGuildData = warData.enemyGuild;
        winnerGuildName = warData.yourGuild.name;
    } else {
        console.log(`[DEBUG DODGE SUBMIT] Nome da guilda de dodge inválido.`);
        return interaction.editReply({ content: `❌ O nome da guilda "${dodgingGuildName}" não corresponde a nenhuma guilda nesta war.` });
    }
    console.log(`[DEBUG DODGE SUBMIT] Guilda que deu dodge: ${dodgingGuildData.name}, Guilda vencedora: ${winnerGuildName}`);

    
    const dodgingGuildDB = await loadGuildByName(dodgingGuildData.name);
    const winnerGuildDB = await loadGuildByName(winnerGuildName);
    await processWarResultForPersonalScores(winnerGuildName, dodgingGuildData.name);

    if (dodgingGuildDB) {
        dodgingGuildDB.score.losses = (dodgingGuildDB.score?.losses || 0) + 1;
        dodgingGuildDB.updatedAt = new Date().toISOString(); 
        dodgingGuildDB.updatedBy = interaction.user.id;
        await saveGuildData(dodgingGuildDB);
        console.log(`[DEBUG DODGE SUBMIT] Score de ${dodgingGuildDB.name} atualizado (+1 derrota).`);
    }
    if (winnerGuildDB) {
        winnerGuildDB.score.wins = (winnerGuildDB.score?.wins || 0) + 1;
        winnerGuildDB.updatedAt = new Date().toISOString(); 
        winnerGuildDB.updatedBy = interaction.user.id;
        await saveGuildData(winnerGuildDB);
        console.log(`[DEBUG DODGE SUBMIT] Score de ${winnerGuildDB.name} atualizado (+1 vitória).`);
    }

    warData.status = 'Dodge'; 
    await saveWarTicket(warData);
    await deleteWarTicket(threadId); 
    console.log(`[DEBUG DODGE SUBMIT] warData salva como Dodge e ticket deletado do DB.`);


    client.emit('updateLeaderboard'); 

    let warEmbed = new EmbedBuilder(interaction.message.embeds[0].toJSON()); 
    warEmbed.fields = warEmbed.data.fields || []; 
    const statusFieldIndex = warEmbed.fields.findIndex(field => field.name === 'Status');
    if (statusFieldIndex !== -1) {
        warEmbed.spliceFields(statusFieldIndex, 1, { name: 'Status', value: `🏃 Dodge - ${dodgingGuildName} Fugiu`, inline: false });
    } else {
        warEmbed.addFields({ name: 'Status', value: `🏃 Dodge - ${dodgingGuildName} Fugiu`, inline: false });
    }
    warEmbed.setColor('#FF0000'); 
    warEmbed.addFields({ name: 'Resultado', value: `**${dodgingGuildName}** fugiu da War/Glad contra **${winnerGuildName}**.`, inline: false });

    await interaction.message.edit({ embeds: [warEmbed], components: [] }); 

    await interaction.channel.send(`**Atenção!** A War/Glad entre **${warData.yourGuild.name}** e **${warData.enemyGuild.name}** foi declarada **DODGE**! **${dodgingGuildName}** fugiu!`);

    // CÓDIGO CORRIGIDO PARA USAR DENTRO DE handleWarDodgeSelectGuildSubmit
    const dodgeLogChannel = await client.channels.fetch(globalConfig.dodgeLogChannelId).catch(() => null);
    if (dodgeLogChannel && dodgeLogChannel.type === ChannelType.GuildText && dodgeLogChannel.permissionsFor(client.user).has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        const dodgeEmbed = new EmbedBuilder()
            .setTitle('🚨 DODGE DETECTADO! 🚨')
            .setColor('#FF0000')
            .setDescription(`Uma War/Glad foi declarada como **DODGE** no ticket: ${interaction.channel.url}`)
            .addFields(
                { name: 'Guilda que Deu Dodge', value: dodgingGuildName, inline: true },
                { name: 'Guilda Vencedora (sem dodge)', value: winnerGuildName, inline: true },
                { name: 'Thread da War', value: interaction.channel.url, inline: false },
                { name: 'Declarado por', value: interaction.user.tag, inline: true }
            )
            .setTimestamp();
        await dodgeLogChannel.send({ embeds: [dodgeEmbed] });
    } else {
        console.error(`❌ [DODGE LOG] Canal de log de dodge (ID: ${globalConfig.dodgeLogChannelId}) não encontrado ou bot sem permissões para enviar logs de dodge.`);
    }

    await sendLogMessage(
        client, globalConfig, interaction,
        'War Dodge Declarada',
        `Uma War/Glad foi declarada Dodge. **${dodgingGuildName}** fugiu contra **${winnerGuildName}**.`,
        [
            { name: 'Guilda que Deu Dodge', value: dodgingGuildName, inline: true },
            { name: 'Guilda Vencedora (sem dodge)', value: winnerGuildName, inline: true },
            { name: 'Thread da War', value: interaction.channel.url, inline: true },
        ]
    );
    
    // Restringir acesso e arquivar a thread
    await restrictThreadAccessOnCompletion(interaction, client, globalConfig, warData);a
    console.log(`[DEBUG DODGE SUBMIT] Dodge concluído com sucesso.`);
}


/**
 * Lida com os cliques nos botões de pontuação de round.
 * @param {ButtonInteraction} interaction - A interação do botão.
 * @param {Client} client - A instância do bot.
 * @param {Object} globalConfig - A configuração global do bot.
 */
async function handleWarRoundButton(interaction, client, globalConfig) {
    await interaction.deferUpdate(); 

    // war_round_win_{guildIdSafe}_{roundNumber}
    const customIdParts = interaction.customId.split('_');
    const winnerGuildIdSafe = customIdParts[3]; 
    const roundNumberStr = customIdParts[4];    
    const currentRoundClicked = parseInt(roundNumberStr); 

    // Carregar o estado da war ticket
    const threadId = interaction.channel.id;
    const warData = await loadWarTicketByThreadId(threadId);

    console.log(`[DEBUG ROUND] warData carregado para thread ${threadId}:`, warData);
    console.log(`[DEBUG ROUND] Status da warData: ${warData ? warData.status : 'undefined'}, Round atual esperado: ${warData ? warData.currentRound : 'N/A'}, Round clicado: ${currentRoundClicked}`);


    // --- Validações de Status e Round ---
    if (!warData || warData.status !== 'Aceita') {
        console.log(`[DEBUG ROUND] Condição de round FALHOU: warData é ${warData ? 'válido' : 'nulo/indefinido'} ou status não é 'Aceita' (status atual: ${warData ? warData.status : 'N/A'})`);
        return interaction.followUp({ content: '❌ Esta war não está aceita ou já foi concluída/declarada WO/Dodge.', ephemeral: true });
    }
    console.log(`[DEBUG ROUND] Condição de status de round PASSOU.`);

    if (currentRoundClicked !== warData.currentRound) {
        console.log(`[DEBUG ROUND] Condição de round clicado FALHOU: clicou no round ${currentRoundClicked}, mas o bot espera o round ${warData.currentRound}.`);
        return interaction.followUp({ content: `❌ Você só pode votar no Round ${warData.currentRound} agora.`, ephemeral: true });
    }
    console.log(`[DEBUG ROUND] Condição de round clicado PASSOU.`);


    // --- Verificação de Permissões ---
    // Lógica de permissão para REGISTRAR ROUND
    const isModerator = (globalConfig.moderatorRoles || []).some(roleId => interaction.member.roles.cache.has(roleId));
    const isScoreOperator = (globalConfig.scoreOperatorRoles || []).some(roleId => interaction.member.roles.cache.has(roleId)); 

    if (!isModerator && !isScoreOperator) {
        console.log(`[DEBUG ROUND] Falha de permissão para ${interaction.user.tag}.`);
        return interaction.followUp({ 
            content: '❌ Apenas moderadores ou operadores de score podem registrar o resultado das rodadas.', 
            ephemeral: true 
        });
    }
    console.log(`[DEBUG ROUND] Permissões VERIFICADAS para ${interaction.user.tag}.`);


    // Validar quem clicou corresponde a uma das guildas
    const winningGuildIdSafe = winnerGuildIdSafe; 
    let winningGuildObjName; 
    let losingGuildObjName;  

    if (winningGuildIdSafe === warData.yourGuild.idSafe) {
        winningGuildObjName = warData.yourGuild.name;
        losingGuildObjName = warData.enemyGuild.name;
    } else if (winningGuildIdSafe === warData.enemyGuild.idSafe) {
        winningGuildObjName = warData.enemyGuild.name;
        losingGuildObjName = warData.yourGuild.name;
    } else {
        console.log(`[DEBUG ROUND] ID da guilda vencedora da rodada inválido: ${winningGuildIdSafe}.`);
        return interaction.followUp({ content: '❌ Erro interno: ID da guilda vencedora da rodada inválido.', ephemeral: true });
    }
    console.log(`[DEBUG ROUND] Guilda vencedora do round: ${winningGuildObjName}, Perdedora: ${losingGuildObjName}.`);

    // Atualiza o score do round
    warData.roundScores[winningGuildIdSafe]++;
    console.log(`[DEBUG ROUND] Score do round: ${winningGuildObjName} agora tem ${warData.roundScores[winningGuildIdSafe]} vitórias no round.`);


    // Atualiza o round atual para o PRÓXIMO round (ou MAX_ROUNDS + 1 se terminou)
    warData.currentRound++; 
    console.log(`[DEBUG ROUND] Próximo round: ${warData.currentRound}.`);


    // RECONSTRUÇÃO ROBUSTA DO EMBED AQUI
    let warEmbed = new EmbedBuilder(interaction.message.embeds[0].toJSON()); 
    warEmbed.fields = warEmbed.data.fields || []; 
    let components = []; 

    // Atualiza o campo de score
    const scoreFieldIndex = warEmbed.fields.findIndex(field => field.name === 'Score Atual');
    if (scoreFieldIndex !== -1) {
        warEmbed.spliceFields(scoreFieldIndex, 1, { name: 'Score Atual', value: `${warData.yourGuild.name}: ${warData.roundScores[warData.yourGuild.idSafe]} | ${warData.enemyGuild.name}: ${warData.roundScores[warData.enemyGuildIdSafe]}`, inline: false });
    } else {
        warEmbed.addFields({ name: 'Score Atual', value: `${warData.yourGuild.name}: ${warData.roundScores[warData.yourGuild.idSafe]} | ${warData.enemyGuild.name}: ${warData.roundScores[warData.enemyGuildIdSafe]}`, inline: false });
    }
    console.log(`[DEBUG ROUND] Embed de score atualizado.`);


    let finalMessage = '';
    let finalWinnerGuildName = null; 
    let finalLoserGuildName = null;  
    let winnerDeclared = false;

    // --- Lógica de Vitória (2 de 3 rounds) ---
    if (warData.roundScores[warData.yourGuild.idSafe] >= ROUNDS_TO_WIN || warData.roundScores[warData.enemyGuild.idSafe] >= ROUNDS_TO_WIN) {
        if (warData.roundScores[warData.yourGuild.idSafe] >= ROUNDS_TO_WIN) {
            finalWinnerGuildName = warData.yourGuild.name;
            finalLoserGuildName = warData.enemyGuild.name;
        } else {
            finalWinnerGuildName = warData.enemyGuild.name;
            finalLoserGuildName = warData.yourGuild.name;
        }

        finalMessage = `🎉 Parabéns! **${finalWinnerGuildName}** venceu a War/Glad contra **${finalLoserGuildName}** por ${warData.roundScores[warData.yourGuild.idSafe]}x${warData.roundScores[warData.enemyGuildIdSafe]}!`;
        warEmbed.addFields({ name: '🏆 Vencedor da War', value: finalWinnerGuildName, inline: false });
        warEmbed.setColor('#2ECC71'); 
        const statusFieldIndex = warEmbed.fields.findIndex(field => field.name === 'Status');
        if (statusFieldIndex !== -1) {
            warEmbed.spliceFields(statusFieldIndex, 1, { name: 'Status', value: '✅ Concluída', inline: false });
        } else {
            warEmbed.addFields({ name: 'Status', value: '✅ Concluída', inline: false });
        }

        warData.status = 'Concluída'; 
        components = []; 

        // Atualizar scores das guildas no DB (vencedor +1, perdedor +1)
        const winnerGuildDB = await loadGuildByName(finalWinnerGuildName); 
        const loserGuildDB = await loadGuildByName(finalLoserGuildName);   
        await processWarResultForPersonalScores(finalWinnerGuildName, finalLoserGuildName);

        if (winnerGuildDB) {
            winnerGuildDB.score.wins = (winnerGuildDB.score?.wins || 0) + 1;
            winnerGuildDB.updatedAt = new Date().toISOString(); 
            winnerGuildDB.updatedBy = interaction.user.id;
            await saveGuildData(winnerGuildDB);
            console.log(`📊 Score de ${finalWinnerGuildName} atualizado: +1 vitória.`);
        }
        if (loserGuildDB) {
            loserGuildDB.score.losses = (loserGuildDB.score?.losses || 0) + 1;
            loserGuildDB.updatedAt = new Date().toISOString(); 
            loserGuildDB.updatedBy = interaction.user.id;
            await saveGuildData(loserGuildDB);
            console.log(`📊 Score de ${finalLoserGuildName} atualizado: +1 derrota.`);
        }

        client.emit('updateLeaderboard'); 
        winnerDeclared = true;

        await deleteWarTicket(warData.threadId); 
        // Restringir acesso e arquivar a thread
        await restrictThreadAccessOnCompletion(interaction, client, globalConfig, warData);

        console.log(`[DEBUG ROUND] War concluída e ticket deletado do DB.`);

    } else if (warData.currentRound <= MAX_ROUNDS) {
        // A war continua, cria botões para o próximo round E os de dodge
        components = createWarCurrentButtons(warData); // Usando a função centralizada
        const statusFieldIndex = warEmbed.fields.findIndex(field => field.name === 'Status');
        if (statusFieldIndex !== -1) {
            warEmbed.spliceFields(statusFieldIndex, 1, { name: 'Status', value: `Round ${warData.currentRound} - Em Andamento`, inline: false });
        } else {
            warEmbed.addFields({ name: 'Status', value: `Round ${warData.currentRound} - Em Andamento`, inline: false });
        }
        console.log(`[DEBUG ROUND] War continua, botões para o próximo round gerados.`);
    } else {
        // Todas as 3 rodadas terminaram, mas não houve um vencedor claro (ex: 1x1) - improvável com ROUNDS_TO_WIN = 2
        finalMessage = `🚫 A War/Glad entre **${warData.yourGuild.name}** e **${warData.enemyGuild.name}** terminou em empate ou sem vencedor claro após ${MAX_ROUNDS} rodadas.`;
        warEmbed.setColor('#95A5A6'); 
        const statusFieldIndex = warEmbed.fields.findIndex(field => field.name === 'Status');
        if (statusFieldIndex !== -1) {
            warEmbed.spliceFields(statusFieldIndex, 1, { name: 'Status', value: '🚫 Sem Vencedor Claro', inline: false });
        } else {
            warEmbed.addFields({ name: 'Status', value: '🚫 Sem Vencedor Claro', inline: false });
        }
        warData.status = 'Concluída';
        components = [];
        await deleteWarTicket(warData.threadId);
        // Restringir acesso e arquivar a thread
        await restrictThreadAccessOnCompletion(interaction.channel, client, globalConfig, warData);
        console.log(`[DEBUG ROUND] War concluída sem vencedor claro e ticket deletado do DB.`);
    }

    // Salvar o estado atualizado da war ticket no DB
    await saveWarTicket(warData);
    console.log(`[DEBUG ROUND] warData salva no DB.`);


    // Edita a mensagem do embed na thread
    await interaction.message.edit({ embeds: [warEmbed], components: components });

    // Enviar log da ação de round
    await sendLogMessage(
        client, globalConfig, interaction,
        'Resultado de Round de War',
        `Resultado do Round ${currentRoundClicked} da war entre **${warData.yourGuild.name}** e **${warData.enemyGuild.name}** foi registrado.`,
        [
            { name: 'Guilda Vencedora do Round', value: winningGuildObjName, inline: true },
            { name: 'Score Atual', value: `${warData.yourGuild.name}: ${warData.roundScores[warData.yourGuild.idSafe]} | ${warData.enemyGuild.name}: ${warData.roundScores[warData.enemyGuildIdSafe]}`, inline: true },
            { name: 'Thread da War', value: interaction.channel.url, inline: true },
            { name: 'Status da War', value: warData.status, inline: true },
            // Condicionalmente adicionar o campo do vencedor final apenas se ele foi declarado
            ...(winnerDeclared ? [{ name: 'Vencedor Final Declarado', value: finalWinnerGuildName ?? 'N/A', inline: false }] : []),
        ]
    );

    if (finalMessage) {
        await interaction.channel.send(finalMessage); 
    }
    console.log(`[DEBUG ROUND] Ação de round concluída com sucesso.`);
}

module.exports = {
    handleWarAcceptButton,
    handleWarRequestDodgeButton,
    handleWarDodgeSelectGuildSubmit,
    handleWarRoundButton,
};
