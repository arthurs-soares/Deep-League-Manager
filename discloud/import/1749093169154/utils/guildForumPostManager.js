// utils/guildForumPostManager.js
// Módulo responsável por criar, atualizar e deletar posts de fórum para perfis de guildas.

const { EmbedBuilder, ChannelType, ThreadAutoArchiveDuration, MessageFlags, PermissionFlagsBits } = require('discord.js'); 
// Importações DIRETAS para evitar dependência circular
// Caminhos são relativos à raiz do projeto, pois este arquivo está em 'utils/'
const { loadGuildByName, saveGuildData } = require('../handlers/db/guildDb'); 
const { loadConfig } = require('../handlers/db/configDb');                                     
const { resolveDisplayColor } = require('../handlers/utils/constants');                      
const { sendLogMessage } = require('../handlers/utils/logManager');                          

const { MAX_ROSTER_SIZE } = require('../handlers/utils/constants'); 

/**
 * Constrói o embed de perfil da guilda, similar ao comando /visualizar, mas formatado para o post do fórum.
 * @param {Object} guild - O objeto da guilda com todos os seus dados.
 * @param {Object} globalConfig - A configuração global do bot (para cores, etc.).
 * @returns {EmbedBuilder} O embed de perfil da guilda pronto para ser enviado.
 */
function buildGuildProfileEmbed(guild, globalConfig) { 
    console.log(`[DIAGNÓSTICO FORUM] buildGuildProfileEmbed: Construindo embed para ${guild.name}.`);
    const mainRosterCount = guild.mainRoster?.length || 0;
    const subRosterCount = guild.subRoster?.length || 0;
    const wins = guild.score?.wins || 0;
    const losses = guild.score?.losses || 0;
    const totalGames = wins + losses;
    const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
    let rosterStatus = '🔴 Incompleta';
    if (mainRosterCount >= MAX_ROSTER_SIZE) rosterStatus = subRosterCount >= MAX_ROSTER_SIZE ? '🟢 Completa' : '🟡 Parcial';
    
    // Resolve a cor do embed usando a cor da guilda ou a cor global padrão.
    const embedColor = resolveDisplayColor(guild.color, globalConfig);

    const embed = new EmbedBuilder()
        .setTitle(`🏰 ${guild.name}`)
        .setColor(embedColor);
    
    // Constrói a descrição, incluindo link se disponível.
    let descriptionText = guild.description ? `*${guild.description}*` : '*Esta guilda ainda não tem uma descrição.*';
    if(guild.link) descriptionText += `\n\n**[Visite o servidor da guilda](${guild.link})**`;
    embed.setDescription(descriptionText);

    // Adiciona thumbnail e banner se URLs estiverem presentes.
    if (guild.logo) embed.setThumbnail(guild.logo);
    if (guild.banner) embed.setImage(guild.banner);

    // Adiciona campos de liderança, desempenho e status do roster.
    embed.addFields(
        { name: '👑 Liderança', value: `**Líder:** <@${guild.leader?.id || 'N/A'}>\n**Vice:** ${guild.coLeader ? `<@${guild.coLeader.id}>` : '*N/D*'}`, inline: true },
        { name: '📊 Desempenho', value: `**Score:** ${wins}V / ${losses}D\n**Vitórias:** ${winRate}%`, inline: true },
        { name: '📋 Status do Roster', value: `${rosterStatus}`, inline: true }
    );
    const mainRosterText = mainRosterCount > 0 ? guild.mainRoster.map((p, i) => `${i + 1}. <@${p.id}>`).join('\n') : '*Vazio*';
    const subRosterText = subRosterCount > 0 ? guild.subRoster.map((p, i) => `${i + 1}. <@${p.id}>`).join('\n') : '*Vazio*';
    embed.addFields(
        { name: `🛡️ Roster Principal (${mainRosterCount}/${MAX_ROSTER_SIZE})`, value: mainRosterText, inline: true },
        { name: `⚔️ Roster Reserva (${subRosterCount}/${MAX_ROSTER_SIZE})`, value: subRosterText, inline: true }
    );

    let footerText = `Criada em <t:${Math.floor(new Date(guild.createdAt).getTime() / 1000)}:f>`;
    if (guild.updatedAt) footerText += ` • Última att. <t:${Math.floor(new Date(guild.updatedAt).getTime() / 1000)}:R>`;
    embed.setFooter({ text: footerText });
    embed.setTimestamp(); // Define o timestamp do embed para "Agora".

    console.log(`[DIAGNÓSTICO FORUM] buildGuildProfileEmbed: Embed construído.`);
    return embed;
}

/**
 * Gerencia o post de fórum de uma guilda: cria, atualiza ou deleta.
 * Esta é a função principal deste módulo, chamada por outros handlers e comandos.
 * @param {Client} client - A instância do bot Discord.js.
 * @param {Object} guildData - Os dados da guilda (deve conter name e, opcionalmente, forumPostId).
 * @param {Object} globalConfig - A configuração global do bot (para forumChannelId, logs).
 * @param {string} operation - A operação a ser realizada ('create', 'update', 'delete').
 * @param {Interaction} [interaction] - A interação original, se houver (para logs e mensagens de erro ao usuário).
 */
async function manageGuildForumPost(client, guildData, globalConfig, operation, interaction = null) {
    console.log(`[DIAGNÓSTICO FORUM] manageGuildForumPost INICIADO: Operação '${operation}' para guilda '${guildData.name}'.`);
    console.log(`[DIAGNÓSTICO FORUM] guildData.forumPostId ANTES: ${guildData.forumPostId}`);

    const forumChannelId = globalConfig.guildRosterForumChannelId;

    if (!forumChannelId) {
        console.warn(`⚠️ [DIAGNÓSTICO FORUM] Canal de Fórum para rosters não configurado em config.json. Operação '${operation}' para guilda '${guildData.name}' não pode ser realizada.`);
        if (interaction) {
            await interaction.followUp({ content: '⚠️ O canal de fórum para rosters não está configurado. Não foi possível gerenciar o post da guilda. Peça a um administrador para usar `/definir-forum-rosters`.', ephemeral: true });
        }
        return;
    }
    console.log(`[DIAGNÓSTICO FORUM] forumChannelId (configurado): ${forumChannelId}`);

    const forumChannel = await client.channels.fetch(forumChannelId).catch(e => {
        console.error(`❌ [DIAGNÓSTICO FORUM] Erro CRÍTICO ao buscar canal de fórum ${forumChannelId}:`, e);
        if (interaction) {
            interaction.followUp({ content: '❌ Ocorreu um erro ao buscar o canal de fórum configurado. Verifique o ID no `config.json` e as permissões do bot.', ephemeral: true });
        }
        return null;
    });

    if (!forumChannel || forumChannel.type !== ChannelType.GuildForum) {
        console.error(`❌ [DIAGNÓSTICO FORUM] Canal de Fórum (ID: ${forumChannelId}) não encontrado, não é um fórum, ou bot sem acesso. Operação '${operation}' para guilda '${guildData.name}' falhou.`);
        if (interaction) {
            await interaction.followUp({ content: '❌ O canal de fórum configurado não foi encontrado ou não é um canal de fórum válido. Por favor, peça a um administrador para reconfigurar com `/definir-forum-rosters`.', ephemeral: true });
        }
        return;
    }
    console.log(`[DIAGNÓSTICO FORUM] Canal de fórum encontrado: ${forumChannel.name} (${forumChannel.id})`);
    
    // VERIFICAÇÃO DE PERMISSÕES DETALHADA NO FÓRUM (DEFINIÇÃO AGORA DENTRO DO ESCOPO DA FUNÇÃO)
    const botPermissionsInForum = forumChannel.permissionsFor(client.user);
    const requiredForumPerms = [ // <-- DEFINIÇÃO DE requiredPerms MOVIDA PARA AQUI
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ManageChannels,       // Para criar/deletar posts (threads)
        PermissionFlagsBits.ManageThreads,        // Para gerenciar threads dentro do fórum
        PermissionFlagsBits.CreatePublicThreads,  // Para criar posts (threads públicas)
        PermissionFlagsBits.SendMessagesInThreads // Para enviar o embed dentro do post
    ];
    const missingPerms = requiredForumPerms.filter(p => !botPermissionsInForum.has(p));

    if (missingPerms.length > 0) {
        const missingNames = missingPerms.map(p => Object.keys(PermissionFlagsBits).find(key => PermissionFlagsBits[key] === p)).join(', ');
        console.error(`❌ [DIAGNÓSTICO FORUM] Bot não tem permissões suficientes no canal de fórum ${forumChannel.name}. Faltando: ${missingNames}`);
        if (interaction) {
            await interaction.followUp({ content: `❌ O bot não tem as permissões necessárias no canal de fórum <#${forumChannel.id}>. Faltando: \`${missingNames}\`. Por favor, ajuste as permissões.`, ephemeral: true });
        }
        return;
    }
    console.log(`[DIAGNÓSTICO FORUM] Permissões do bot no fórum verificadas: OK.`);


    try {
        switch (operation) {
            case 'create':
                console.log(`[DIAGNÓSTICO FORUM] Operação 'create': Tentando criar post para guilda '${guildData.name}'.`);
                // Cria um novo post (thread) no canal de fórum com o nome da guilda.
                const newPost = await forumChannel.threads.create({
                    name: guildData.name,
                    message: {
                        embeds: [buildGuildProfileEmbed(guildData, globalConfig)] // Usa o embed construído.
                    },
                    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek, // Arquiva após uma semana de inatividade.
                    reason: `Post de roster para a guilda ${guildData.name}`,
                });
                guildData.forumPostId = newPost.id; // Armazena o ID do post no objeto da guilda.
                await saveGuildData(guildData); // Persiste o ID do post no banco de dados.
                console.log(`✅ [DIAGNÓSTICO FORUM] Post de fórum para guilda '${guildData.name}' criado: ${newPost.url} (ID: ${newPost.id})`);
                if (interaction) {
                    await sendLogMessage(
                        client, globalConfig, interaction,
                        'Criação de Post de Fórum de Guilda',
                        `Post de fórum para a guilda **${guildData.name}** criado em <#${forumChannel.id}>.`,
                        [{ name: 'Link do Post', value: newPost.url, inline: false }]
                    );
                }
                break;

            case 'update':
                console.log(`[DIAGNÓSTICO FORUM] Operação 'update': Tentando atualizar post para guilda '${guildData.name}'. forumPostId: ${guildData.forumPostId}`);
                // Se a guilda não tem um forumPostId, tenta criar um novo post.
                if (!guildData.forumPostId) {
                    console.warn(`⚠️ [DIAGNÓSTICO FORUM] Guilda '${guildData.name}' não possui forumPostId. Tentando criar um novo post para atualização.`);
                    // Chama a si mesma para criar o post.
                    await manageGuildForumPost(client, guildData, globalConfig, 'create', interaction); 
                    return; // Retorna após a tentativa de criação para evitar processamento duplicado.
                }

                const existingPost = await forumChannel.threads.fetch(guildData.forumPostId).catch(e => {
                    console.error(`❌ [DIAGNÓSTICO FORUM] Erro ao buscar post existente ${guildData.forumPostId}:`, e);
                    return null;
                });
                
                if (existingPost) {
                    console.log(`[DIAGNÓSTICO FORUM] Post existente encontrado: ${existingPost.name} (ID: ${existingPost.id}).`);
                    await existingPost.messages.fetch({ limit: 1 }).then(async messages => {
                        const firstMessage = messages.first();
                        if (firstMessage && firstMessage.author.id === client.user.id) { 
                            console.log(`[DIAGNÓSTICO FORUM] Editando primeira mensagem do post.`);
                            await firstMessage.edit({ embeds: [buildGuildProfileEmbed(guildData, globalConfig)] });
                            console.log(`✅ [DIAGNÓSTICO FORUM] Post de fórum para guilda '${guildData.name}' atualizado: ${existingPost.url}`);
                        } else {
                            console.warn(`⚠️ [DIAGNÓSTICO FORUM] Primeira mensagem do post não é do bot ou não existe. Enviando nova mensagem no post.`);
                            await existingPost.send({ embeds: [buildGuildProfileEmbed(guildData, globalConfig)] });
                        }
                    }).catch(async e => {
                        console.error(`❌ [DIAGNÓSTICO FORUM] Erro ao buscar/editar mensagens no post ${existingPost.url}:`, e);
                        console.warn(`⚠️ [DIAGNÓSTICO FORUM] Tentando enviar nova mensagem no post como fallback.`);
                        await existingPost.send({ embeds: [buildGuildProfileEmbed(guildData, globalConfig)] }); 
                    });
                } else {
                    console.warn(`⚠️ [DIAGNÓSTICO FORUM] Post de fórum (ID: ${guildData.forumPostId}) para guilda '${guildData.name}' não encontrado no Discord. Tentando criar um novo.`);
                    await manageGuildForumPost(client, guildData, globalConfig, 'create', interaction); 
                }
                if (interaction) {
                    await sendLogMessage(
                        client, globalConfig, interaction,
                        'Atualização de Post de Fórum de Guilda',
                        `Post de fórum para a guilda **${guildData.name}** atualizado em <#${forumChannel.id}>.`,
                        [{ name: 'Link do Post', value: existingPost ? existingPost.url : 'N/A (criado novo)', inline: false }]
                    );
                }
                break;

            case 'delete':
                console.log(`[DIAGNÓSTICO FORUM] Operação 'delete': Tentando deletar post para guilda '${guildData.name}'. forumPostId: ${guildData.forumPostId}`);
                if (guildData.forumPostId) {
                    const postToDelete = await forumChannel.threads.fetch(guildData.forumPostId).catch(e => {
                        console.error(`❌ [DIAGNÓSTICO FORUM] Erro ao buscar post para deletar ${guildData.forumPostId}:`, e);
                        return null;
                    });
                    if (postToDelete) {
                        await postToDelete.delete(`Guilda '${guildData.name}' deletada.`);
                        console.log(`✅ [DIAGNÓSTICO FORUM] Post de fórum para guilda '${guildData.name}' deletado.`);
                        if (interaction) {
                            await sendLogMessage(
                                client, globalConfig, interaction,
                                'Deleção de Post de Fórum de Guilda',
                                `Post de fórum para a guilda **${guildData.name}** deletado de <#${forumChannel.id}>.`,
                                [{ name: 'Nome da Guilda', value: guildData.name, inline: true }]
                            );
                        }
                    } else {
                        console.warn(`⚠️ [DIAGNÓSTICO FORUM] Post de fórum (ID: ${guildData.forumPostId}) para guilda '${guildData.name}' não encontrado para deleção.`);
                    }
                }
                guildData.forumPostId = null;
                await saveGuildData(guildData); 
                break;

            default:
                console.warn(`[DIAGNÓSTICO FORUM] Operação desconhecida: ${operation}`);
                break;
        }
    } catch (error) {
        console.error(`❌ [DIAGNÓSTICO FORUM] Erro fatal ao gerenciar post de fórum para guilda '${guildData.name}' (Operação: ${operation}):`, error);
        if (interaction) {
            await interaction.followUp({ content: `❌ Ocorreu um erro ao gerenciar o post de fórum da guilda **${guildData.name}**. Verifique as permissões do bot no canal de fórum e tente novamente. Detalhes: ${error.message}`, ephemeral: true });
        }
    }
}

module.exports = {
    manageGuildForumPost,
    // buildGuildProfileEmbed não é exportado as it's an internal helper function.
};