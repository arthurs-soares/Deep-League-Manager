// handlers/panel/warTicketModals.js
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ThreadAutoArchiveDuration, ChannelType, PermissionFlagsBits } = require('discord.js');
const { saveWarTicket } = require('../../db/warDb');
const { sendLogMessage } = require('../../utils/logManager');
const { resolveDisplayColor } = require('../../utils/constants');
const { loadTeamByName } = require('../../db/teamDb');
const { loadGuildByName } = require('../../db/guildDb');
const { createWarCurrentButtons } = require('./warTicketButtons');

/**
 * Exibe o modal de formulário de ticket de guerra.
 */
async function handleWarTicketButton(interaction, globalConfig, client) {
    if (interaction.customId !== 'pull_war_ticket') return;

    const modal = new ModalBuilder()
        .setCustomId('modal_war_ticket_submit')
        .setTitle('Puxar War/Glad');

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('your_entity_name')
                .setLabel('Sua Guilda/Time (Nome EXATO)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: Os Imortais')
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('enemy_entity_name')
                .setLabel('Guilda/Time Inimigo(a) (Nome EXATO)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: Guerreiros da Luz')
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('datetime')
                .setLabel('Data e Horário da War')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: 08/06 20:00 (Horário de Brasília)')
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('war_type')
                .setLabel('Tipo de Confronto')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: War ou Glad')
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('players_count')
                .setLabel('Quantidade de Players')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: 5v5')
                .setRequired(true)
        )
    );

    await interaction.showModal(modal);
}

/**
 * Processa a submissão do modal de ticket de guerra generalizado.
 */
async function handleWarTicketModalSubmit(interaction, client, globalConfig, customId) {
    await interaction.deferReply({ ephemeral: true });

    const yourEntityName = interaction.fields.getTextInputValue('your_entity_name');
    const enemyEntityName = interaction.fields.getTextInputValue('enemy_entity_name');
    const dateTime = interaction.fields.getTextInputValue('datetime');
    const warType = interaction.fields.getTextInputValue('war_type');
    const playersCount = interaction.fields.getTextInputValue('players_count');

    // Função helper para carregar uma entidade (guilda ou time)
    const loadEntity = async (name) => {
        let entity = await loadGuildByName(name);
        if (entity) return { data: entity, type: 'guild' };
        entity = await loadTeamByName(name);
        if (entity) return { data: entity, type: 'team' };
        return null;
    };

    try {
        const yourEntityResult = await loadEntity(yourEntityName);
        const enemyEntityResult = await loadEntity(enemyEntityName);

        // --- VALIDAÇÕES ---
        if (!yourEntityResult) {
            return await interaction.editReply({ content: `❌ Sua entidade "${yourEntityName}" não foi encontrada como Guilda ou Time.` });
        }
        if (!enemyEntityResult) {
            return await interaction.editReply({ content: `❌ A entidade inimiga "${enemyEntityName}" não foi encontrada como Guilda ou Time.` });
        }
        if (yourEntityResult.data.name.toLowerCase() === enemyEntityResult.data.name.toLowerCase()) {
            return await interaction.editReply({ content: `❌ Você não pode puxar uma war contra a sua própria entidade!` });
        }

        const isModerator = interaction.member.permissions.has('Administrator') || (globalConfig.moderatorRoles && globalConfig.moderatorRoles.some(roleId => interaction.member.roles.cache.has(roleId)));
        if (yourEntityResult.data.leader.id !== interaction.user.id && !isModerator) {
             return await interaction.editReply({ content: `❌ Apenas o líder de "${yourEntityName}" ou um moderador pode iniciar uma war.` });
        }

        const warTicketChannel = await client.channels.fetch(globalConfig.warTicketChannelId).catch(() => null);
        if (!warTicketChannel || warTicketChannel.type !== ChannelType.GuildText) {
            return await interaction.editReply({ content: '❌ O canal de tickets de guerra não está configurado corretamente.' });
        }

        // --- CRIAÇÃO DA THREAD ---
        const threadName = `⚔️ ${yourEntityResult.data.name} vs ${enemyEntityResult.data.name} - ${dateTime.split(' ')[0]}`;
        const thread = await warTicketChannel.threads.create({
            name: threadName,
            autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
            type: ChannelType.PrivateThread, // Começa como privada para adicionar membros
            reason: `Solicitação de War/Glad por ${interaction.user.tag}`,
        });

        // --- PREPARAÇÃO DOS DADOS DA WAR ---
        const warData = {
            threadId: thread.id,
            messageId: null, // Será preenchido depois
            yourEntity: {
                id: yourEntityResult.data._id.toString(),
                name: yourEntityResult.data.name,
                type: yourEntityResult.type,
                leaderId: yourEntityResult.data.leader.id,
            },
            enemyEntity: {
                id: enemyEntityResult.data._id.toString(),
                name: enemyEntityResult.data.name,
                type: enemyEntityResult.type,
                leaderId: enemyEntityResult.data.leader.id,
            },
            roundScores: {
                [yourEntityResult.data.name]: 0,
                [enemyEntityResult.data.name]: 0,
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

        // --- PREPARAÇÃO DO EMBED E COMPONENTES ---
        const warEmbed = new EmbedBuilder()
            .setTitle(`🔥 Solicitação de War/Glad - ${warData.yourEntity.name} vs ${warData.enemyEntity.name}`)
            .setColor(yourEntityResult.data.color ? resolveDisplayColor(yourEntityResult.data.color, globalConfig) : (globalConfig.embedColor || '#FFD700'))
            .setDescription(`Nova solicitação de confronto criada por ${interaction.user.toString()}.\n\n**Nota:** Os botões do Discord expiram após um tempo. Se os botões pararem de funcionar, use o botão 🔄 **Atualizar Botões** para renová-los.`)
            .addFields(
                { name: `Sua Entidade (${warData.yourEntity.type})`, value: warData.yourEntity.name, inline: true },
                { name: `Entidade Inimiga (${warData.enemyEntity.type})`, value: warData.enemyEntity.name, inline: true },
                { name: 'Data/Hora', value: dateTime, inline: false },
                { name: 'Tipo de Confronto', value: warType, inline: true },
                { name: 'Quantidade de Players', value: playersCount, inline: true },
                { name: 'Score Atual', value: `${warData.yourEntity.name}: 0 | ${warData.enemyEntity.name}: 0`, inline: false },
                { name: 'Status', value: `🕒 Aguardando Aceitação`, inline: false }
            )
            .setFooter({ text: `Solicitado por ${interaction.user.tag}` })
            .setTimestamp();

        const components = createWarCurrentButtons(warData);

        // --- ADIÇÃO DE PARTICIPANTES À THREAD ---
        const participants = new Set([
            interaction.user.id, // O solicitante
            warData.yourEntity.leaderId,
            warData.enemyEntity.leaderId
        ]);

        if (yourEntityResult.type === 'guild' && yourEntityResult.data.coLeader) {
            participants.add(yourEntityResult.data.coLeader.id);
        }
        if (enemyEntityResult.type === 'guild' && enemyEntityResult.data.coLeader) {
            participants.add(enemyEntityResult.data.coLeader.id);
        }
        
        // Adicionar operadores de score
        
        if (globalConfig.scoreOperatorRoles && globalConfig.scoreOperatorRoles.length > 0) {
            const guildMembers = await interaction.guild.members.fetch();
            for (const member of guildMembers.values()) {
                if (globalConfig.scoreOperatorRoles.some(roleId => member.roles.cache.has(roleId))) {
                    participants.add(member.id);
                }
            }
        }
       

        for (const userId of participants) {
            try {
                const member = await interaction.guild.members.fetch(userId).catch(() => null);
                if (member) {
                    await thread.members.add(member.id);
                }
            } catch (e) {
                console.error(`❌ Erro ao adicionar usuário ${userId} à thread ${thread.name}: ${e.message}`);
            }
        }
        
        const warMessage = await thread.send({ embeds: [warEmbed], components: components });
        warData.messageId = warMessage.id;
        await warMessage.pin().catch(e => console.error(`❌ Erro ao fixar mensagem na thread ${thread.name}: ${e.message}`));
        
        await saveWarTicket(warData); // Salva novamente com o messageId

        // --- LOG E RESPOSTA FINAL ---
        await sendLogMessage(
            client, globalConfig, interaction, 'Solicitação de War',
            `Uma nova solicitação de War/Glad foi criada entre **${yourEntityName}** e **${enemyEntityName}**.`,
            [
                { name: 'Solicitante', value: interaction.user.toString(), inline: true },
                { name: 'Link da Thread', value: thread.url, inline: true },
                { name: `Sua Entidade (${warData.yourEntity.type})`, value: yourEntityName, inline: true },
                { name: `Entidade Inimiga (${warData.enemyEntity.type})`, value: enemyEntityName, inline: true },
                { name: 'Data/Hora', value: dateTime, inline: false },
            ]
        );

        await interaction.editReply({ content: `✅ Sua solicitação de War/Glad foi criada! Veja a discussão aqui: ${thread.url}` });

    } catch (error) {
        console.error('❌ Erro ao processar submissão do ticket de guerra genérico:', error);
        await interaction.editReply({ content: '❌ Ocorreu um erro ao processar sua solicitação. Verifique os nomes e tente novamente.' });
    }
}

module.exports = {
    handleWarTicketButton,
    handleWarTicketModalSubmit,
};
