// handlers/panel/warTicketModals.js
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ThreadAutoArchiveDuration, ChannelType, PermissionFlagsBits } = require('discord.js');
// Importações DIRETAS dos módulos necessários
const { loadGuildByName } = require('../db/guildDb'); 
const { saveWarTicket } = require('../db/warDb'); 
const { sendLogMessage } = require('../utils/logManager');                              // <-- Caminho corrigido
const { resolveDisplayColor } = require('../utils/constants');                      // <-- Caminho corrigido

// Importar as funções de criação de botões aqui
const { createWarCurrentButtons } = require('./warTicketButtons'); 


/**
 * Exibe o modal de formulário de ticket de guerra quando o botão é clicado.
 * @param {ButtonInteraction} interaction - A interação do botão.
 * @param {Object} globalConfig - A configuração global do bot.
 * @param {Client} client - A instância do bot.
 */
async function handleWarTicketButton(interaction, globalConfig, client) {
    if (interaction.customId !== 'pull_war_ticket') return; 

    const modal = new ModalBuilder()
        .setCustomId('modal_war_ticket_submit') 
        .setTitle('Puxar War/Glad');

    const yourGuildInput = new TextInputBuilder()
        .setCustomId('your_guild_name')
        .setLabel('Nome da Sua Guilda (EXATO)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: Os Imortais')
        .setRequired(true);

    const enemyGuildInput = new TextInputBuilder()
        .setCustomId('enemy_guild_name')
        .setLabel('Nome da Guilda Inimiga (EXATO)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: Guerreiros da Luz')
        .setRequired(true);

    const dateTimeInput = new TextInputBuilder()
        .setCustomId('datetime')
        .setLabel('Data e Horário da War')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 08/06 20:00 (Horário de Brasília)')
        .setRequired(true);

    const warTypeInput = new TextInputBuilder()
        .setCustomId('war_type')
        .setLabel('Tipo de Confronto') 
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: War ou Glad') 
        .setRequired(true);

    const playersCountInput = new TextInputBuilder()
        .setCustomId('players_count')
        .setLabel('Quantidade de Players') 
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 5v5') 
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(yourGuildInput),
        new ActionRowBuilder().addComponents(enemyGuildInput),
        new ActionRowBuilder().addComponents(dateTimeInput),
        new ActionRowBuilder().addComponents(warTypeInput),
        new ActionRowBuilder().addComponents(playersCountInput)
    );

    await interaction.showModal(modal);
}

/**
 * Processa a submissão do modal de ticket de guerra.
 * Cria uma thread, envia o embed com as informações e adiciona os participantes.
 * @param {ModalSubmitInteraction} interaction - A interação de submissão do modal.
 * @param {Object} globalConfig - A configuração global do bot.
 * @param {Client} client - A instância do bot.
 */
async function handleWarTicketModalSubmit(interaction, client, globalConfig, customId) { // customId might be unused but matches router
    await interaction.deferReply({ ephemeral: true }); 

    const yourGuildName = interaction.fields.getTextInputValue('your_guild_name');
    const enemyGuildName = interaction.fields.getTextInputValue('enemy_guild_name');
    const dateTime = interaction.fields.getTextInputValue('datetime');
    const warType = interaction.fields.getTextInputValue('war_type');
    const playersCount = interaction.fields.getTextInputValue('players_count');

    try {
        const yourGuild = await loadGuildByName(yourGuildName);
        const enemyGuild = await loadGuildByName(enemyGuildName);

        if (!yourGuild) {
            return await interaction.editReply({ content: `❌ Sua guilda "${yourGuildName}" não foi encontrada no sistema. Por favor, registre-a primeiro.` });
        }
        if (!enemyGuild) {
            return await interaction.editReply({ content: `❌ A guilda inimiga "${enemyGuildName}" não foi encontrada no sistema. Certifique-se de que o nome está EXATO.` });
        }
        if (yourGuild.name.toLowerCase() === enemyGuild.name.toLowerCase()) {
            return await interaction.editReply({ content: `❌ Você não pode puxar uma war contra a sua própria guilda!` });
        }

        const warTicketChannel = await client.channels.fetch(globalConfig.warTicketChannelId).catch(() => null);
        if (!warTicketChannel || warTicketChannel.type !== ChannelType.GuildText) {
            return await interaction.editReply({ content: '❌ O canal de tickets de guerra não está configurado corretamente ou não é um canal de texto. Verifique `config.json` e as permissões do bot.' });
        }

        const threadName = `⚔️ ${yourGuildName} vs ${enemyGuildName} - ${dateTime.split(' ')[0]}`; 
        
        const thread = await warTicketChannel.threads.create({
            name: threadName,
            autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek, 
            type: ChannelType.PrivateThread, 
            reason: `Solicitação de War/Glad por ${interaction.user.tag}`,
            permissionOverwrites: [
                {
                    id: interaction.guild.id, 
                    deny: [PermissionFlagsBits.ViewChannel], 
                },
                {
                    id: client.user.id, 
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageThreads],
                },
                {
                    id: interaction.user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                },
            ],
        });

        const yourGuildIdSafe = yourGuild.name.toLowerCase().replace(/\s+/g, '-');
        const enemyGuildIdSafe = enemyGuild.name.toLowerCase().replace(/\s+/g, '-');

        const warData = {
            threadId: thread.id,
            messageId: null, 
            yourGuild: {
                id: yourGuild.id, 
                name: yourGuild.name,
                idSafe: yourGuildIdSafe,
            },
            enemyGuild: {
                id: enemyGuild.id, 
                name: enemyGuild.name,
                idSafe: enemyGuildIdSafe,
            },
            roundScores: {
                [yourGuildIdSafe]: 0,
                [enemyGuildIdSafe]: 0,
            },
            currentRound: 0, 
            status: 'Aguardando Aceitação', 
            requesterId: interaction.user.id,
            timestamp: new Date().toISOString(),
            dateTimeScheduled: dateTime, 
            warType: warType,
            playersCount: playersCount,
        };
        
        await saveWarTicket(warData);
        console.log(`[DEBUG MODAL SUBMIT] War data salva no DB para thread ${warData.threadId}.`);

        const warEmbed = new EmbedBuilder()
            .setTitle(`🔥 Solicitação de War/Glad - ${yourGuildName} vs ${enemyGuildName}`)
            .setColor(yourGuild.color ? resolveDisplayColor(yourGuild.color, globalConfig) : (globalConfig.embedColor || '#FFD700'))
            .setDescription(`Nova solicitação de confronto criada por ${interaction.user.toString()}.`)
            .addFields(
                { name: 'Sua Guilda', value: yourGuild.name, inline: true },
                { name: 'Guilda Inimiga', value: enemyGuild.name, inline: true },
                { name: 'Data/Hora', value: dateTime, inline: false },
                { name: 'Tipo de Confronto', value: warType, inline: true },
                { name: 'Quantidade de Players', value: playersCount, inline: true },
                { name: 'Score Atual', value: `${yourGuild.name}: 0 | ${enemyGuild.name}: 0`, inline: false },
                { name: 'Status', value: `🕒 Aguardando Aceitação`, inline: false }
            )
            .setFooter({ text: `Solicitado por ${interaction.user.tag}` })
            .setTimestamp();

        const components = createWarCurrentButtons(warData);
        
        const participants = new Set();
        if (yourGuild.leader) participants.add(yourGuild.leader.id);
        if (yourGuild.coLeader) participants.add(yourGuild.coLeader.id);
        if (enemyGuild.leader) participants.add(enemyGuild.leader.id);
        if (enemyGuild.coLeader) participants.add(enemyGuild.coLeader.id);
        if (globalConfig.scoreOperatorRoles && globalConfig.scoreOperatorRoles.length > 0) {
            const guildMembers = await interaction.guild.members.fetch();
            for (const member of guildMembers.values()) {
                if ((globalConfig.scoreOperatorRoles || []).some(roleId => member.roles.cache.has(roleId))) { 
                    participants.add(member.id);
                }
            }
        }
        participants.add(interaction.user.id); 

        for (const userId of participants) {
            try {
                const member = await interaction.guild.members.fetch(userId).catch(() => null);
                if (member) { 
                    await thread.members.add(member.id); 
                    await thread.permissionOverwrites.edit(member.id, {
                        ViewChannel: true,          
                        SendMessages: true,         
                        SendMessagesInThreads: true 
                    }).catch(e => console.error(`❌ Erro ao setar permissões para ${member.user.tag} na thread: ${e.message}`));

                    const tempMessage = await thread.send(`${member.toString()} adicionado à thread e pode falar.`).catch(e => console.error(`Erro ao enviar tempMessage para ${member.id}: ${e.message}`));
                    if (tempMessage && typeof tempMessage.delete === 'function') {
                        setTimeout(() => tempMessage.delete().catch(e => console.error(`Erro ao deletar mensagem de menção temporária: ${e.message}`)), 3000); 
                    }
                }
            } catch (e) {
                console.error(`❌ Erro geral ao adicionar usuário ${userId} à thread ${thread.name}: ${e.message}`);
                if (e.code === 50013 || e.message.includes('Unknown Channel') || e.message.includes('Missing Access')) { 
                    await thread.send(`⚠️ Não foi possível adicionar ${member ? member.toString() : `o usuário com ID ${userId}`} à thread devido a permissões ou problema no canal.`).catch(() => {});
                }
            }
        }
        await thread.send(`Iniciada a war entre **${yourGuildName}** e **${enemyGuildName}**!`).catch(() => {}); 

        // NOVO: Atraso de 10 segundos para enviar o embed principal e fixá-lo
        setTimeout(async () => {
            const warMessage = await thread.send({ embeds: [warEmbed], components: components }).catch(e => console.error(`❌ Erro ao enviar embed da war após 10s: ${e.message}`));
            if (warMessage) {
                warData.messageId = warMessage.id; 
                await warMessage.pin().catch(e => console.error(`❌ Erro ao fixar mensagem na thread ${thread.name}: ${e.message}`)); 
            }
        }, 10000); // 10 segundos de atraso

        await sendLogMessage(
            client, globalConfig, interaction,
            'Solicitação de War',
            `Uma nova solicitação de War/Glad foi criada entre **${yourGuildName}** e **${enemyGuildName}**.`,
            [
                { name: 'Solicitante', value: interaction.user.toString(), inline: true },
                { name: 'Link da Thread', value: thread.url, inline: true },
                { name: 'Sua Guilda', value: yourGuildName, inline: true },
                { name: 'Guilda Inimiga', value: enemyGuildName, inline: true },
                { name: 'Data/Hora', value: dateTime, inline: false },
                { name: 'Tipo de Confronto', value: warType, inline: true },
                { name: 'Players', value: playersCount, inline: true },
            ]
        );

        await interaction.editReply({ content: `✅ Sua solicitação de War/Glad foi criada! Veja a discussão aqui: ${thread.url}\n\nO painel da war aparecerá em alguns segundos.` });

    } catch (error) {
        console.error('❌ Erro ao processar submissão do ticket de guerra:', error);
        await interaction.editReply({ content: '❌ Ocorreu um erro ao processar sua solicitação de War/Glad. Verifique os nomes das guildas e tente novamente.' });
    }
}

module.exports = {
    handleWarTicketButton,
    handleWarTicketModalSubmit,
};
