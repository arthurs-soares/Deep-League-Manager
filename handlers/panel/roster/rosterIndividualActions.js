// handlers/panel/rosterIndividualActions.js
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const { loadGuildByName, saveGuildData, isUserInAnyGuild, loadGuildById } = require('../../db/guildDb');
const { saveConfig } = require('../../db/configDb');
const { sendLogMessage } = require('../../utils/logManager');
const { getAndValidateGuild } = require('../../utils/validation');
const { manageGuildForumPost } = require('../../../utils/guildForumPostManager');
const { COOLDOWN_DAYS, MAX_ROSTER_SIZE } = require('../../utils/constants');

// --- HANDLERS DE ADICIONAR MEMBRO (SINGULAR por ID/Menção) ---
async function handleGuildPanelAddmember(interaction, guildIdSafe, globalConfig, client) {
    const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, false, true); 
    if (!guild) return;
    const modal = new ModalBuilder()
        .setCustomId(`modal_guildpanel_addmember_${guildIdSafe}`)
        .setTitle(`Adicionar Membro - ${guild.name}`);

    const memberIdInput = new TextInputBuilder()
        .setCustomId('member_id')
        .setLabel("ID do Discord do Membro")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("ID do usuário para adicionar")
        .setRequired(true);

    const rosterTypeInput = new TextInputBuilder()
        .setCustomId('roster_type')
        .setLabel("Tipo de Roster (main/sub)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Digite 'main' ou 'sub'")
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(memberIdInput),
        new ActionRowBuilder().addComponents(rosterTypeInput)
    );

    await interaction.showModal(modal);
}

async function handleGuildPanelAddmemberSubmit(interaction, guildIdSafe, globalConfig, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, false, true); 
    if (!guild) return;

    const memberId = interaction.fields.getTextInputValue('member_id');
    let rosterType = interaction.fields.getTextInputValue('roster_type').toLowerCase();

    const cleanedId = (memberId.match(/^<@!?(\d+)>$/) || [, memberId])[1];
    if (!/^\d+$/.test(cleanedId)) {
        return interaction.editReply({ content: '❌ O ID do membro fornecido é inválido. Deve ser numérico ou uma menção válida.' });
    }

    if (rosterType !== 'main' && rosterType !== 'sub') {
        return interaction.editReply({ content: '❌ Tipo de roster inválido. Use "main" ou "sub".' });
    }

    const member = await interaction.guild.members.fetch(cleanedId).catch(() => null);
    if (!member) {
        return interaction.editReply({ content: `❌ Usuário com ID \`${cleanedId}\` (digitado como \`${memberId}\`) não encontrado neste servidor.` });
    }

    const isLeader = guild.leader?.id === member.id;
    const isCoLeader = guild.coLeader?.id === member.id;

    const userInGuild = await isUserInAnyGuild(member.id);
    if (userInGuild && userInGuild.name !== guild.name && !isLeader && !isCoLeader) { 
        return interaction.editReply({ content: `❌ O usuário ${member.toString()} já está na guilda "${userInGuild.name}" e não pode ser adicionado a esta!` });
    }

    const recentlyLeftUser = globalConfig.recentlyLeftUsers.find(u => u.userId === member.id);
    if (recentlyLeftUser) {
        const leaveTime = new Date(recentlyLeftUser.leaveTimestamp).getTime();
        const now = new Date(); // CORRIGIDO: new Date() para ter toISOString()
        const diffTime = now.getTime() - leaveTime;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 
        if (diffDays < COOLDOWN_DAYS) {
            const remainingDays = COOLDOWN_DAYS - diffDays;
            return interaction.editReply({ content: `❌ O usuário ${member.toString()} deixou uma guilda há ${diffDays} dia(s) e precisa esperar ${remainingDays} dia(s) para entrar em uma nova guilda!` });
        }
    }

    const memberObj = { id: member.id, username: member.user.username, joinedAt: new Date().toISOString() };

    const isAlreadyInMain = guild.mainRoster.some(m => m.id === member.id);
    const isAlreadyInSub = guild.subRoster.some(m => m.id === member.id);

    if (isAlreadyInMain || isAlreadyInSub) {
        return interaction.editReply({ content: `❌ O usuário ${member.toString()} já está em um dos rosters da guilda.` });
    }
    
    if (rosterType === 'main' && guild.mainRoster.length >= MAX_ROSTER_SIZE) {
        return interaction.editReply({ content: `❌ O Roster Principal já está cheio (${MAX_ROSTER_SIZE} jogadores). Remova um jogador antes de adicionar outro.` });
    }
    if (rosterType === 'sub' && guild.subRoster.length >= MAX_ROSTER_SIZE) {
        return interaction.editReply({ content: '❌ O Roster Reserva já está cheio (${MAX_ROSTER_SIZE} jogadores). Remova um jogador antes de adicionar outro.' });
    }


    if (rosterType === 'main') {
        guild.mainRoster.push(memberObj);
    } else {
        guild.subRoster.push(memberObj);
    }

    guild.updatedAt = new Date().toISOString();
    guild.updatedBy = interaction.user.id;

    await saveGuildData(guild);

    globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== member.id);
    await saveConfig(globalConfig); 

    client.emit('updateLeaderboard');

    await sendLogMessage(
        client, globalConfig, interaction, 
        `Adição de Membro (${rosterType.toUpperCase()})`, 
        `O membro **${member.user.tag}** foi adicionado ao roster ${rosterType} da guilda **${guild.name}**.`,
        [
            { name: 'Guilda', value: guild.name, inline: true },
            { name: 'Membro Adicionado', value: `<@${member.id}>`, inline: true },
            { name: 'Tipo de Roster', value: rosterType, inline: true },
        ]
    );
    await interaction.editReply({ content: `✅ Membro **${member.user.tag}** adicionado ao roster **${rosterType}** com sucesso!` });
}

// --- HANDLERS DE REMOVER MEMBRO (SINGULAR por ID/Menção) ---
async function handleGuildPanelRemovemember(interaction, guildIdSafe, globalConfig, client) {
    const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, false, true);
    if (!guild) return;

    const modal = new ModalBuilder()
        .setCustomId(`modal_guildpanel_removemember_${guildIdSafe}`)
        .setTitle(`Remover Membro - ${guild.name}`);

    const memberIdInput = new TextInputBuilder()
        .setCustomId('member_id')
        .setLabel("ID do Discord do Membro")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("ID do usuário para remover")
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(memberIdInput));
    await interaction.showModal(modal);
}

async function handleGuildPanelRemovememberSubmit(interaction, guildIdSafe, globalConfig, client) { 
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, false, true); 
    if (!guild) return;

    const memberId = interaction.fields.getTextInputValue('member_id');

    const cleanedId = (memberId.match(/^<@!?(\d+)>$/) || [, memberId])[1];
    if (!/^\d+$/.test(cleanedId)) {
        return interaction.editReply({ content: '❌ O ID do membro fornecido é inválido. Deve ser numérico ou uma menção válida.' });
    }

    let memberFound = false;
    let originalRosterType = 'N/A';
    guild.mainRoster = guild.mainRoster.filter(m => {
        if (m.id === cleanedId) { 
            memberFound = true;
            originalRosterType = 'principal';
            return false;
        }
        return true;
    });

    if (!memberFound) {
        guild.subRoster = guild.subRoster.filter(m => {
            if (m.id === cleanedId) { 
                memberFound = true;
                originalRosterType = 'reserva';
                return false;
            }
            return true;
        });
    }

    if (!memberFound) {
        return interaction.editReply({ content: `❌ Usuário com ID \`${cleanedId}\` (digitado como \`${memberId}\`) não encontrado em nenhum roster desta guilda.` });
    }

    const isLeader = guild.leader?.id === cleanedId;
    const isCoLeader = guild.coLeader?.id === cleanedId;
    if (isLeader || isCoLeader) {
        return interaction.editReply({ content: `❌ ${member.toString()} é líder ou vice-líder da guilda. Use "Trocar Líder" ou "Trocar Vice-Líder" para gerenciar.` });
    }

    guild.updatedAt = new Date().toISOString();
    guild.updatedBy = interaction.user.id;

    await saveGuildData(guild);
    
    // NOVO: Atualizar o post no fórum da guilda
    await manageGuildForumPost(client, guild, globalConfig, 'update', interaction);

    const now = new Date(); // CORRIGIDO: new Date() para ter toISOString()
    globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== cleanedId);
    globalConfig.recentlyLeftUsers.push({ userId: cleanedId, leaveTimestamp: now.toISOString() });
    
    const threeDaysAgo = new Date(now.getTime() - (COOLDOWN_DAYS * 24 * 60 * 60 * 1000)); // Corrigido getTime()
    globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => new Date(u.leaveTimestamp) > threeDaysAgo);
    
    await saveConfig(globalConfig); 

    client.emit('updateLeaderboard');

    const memberUser = await client.users.fetch(cleanedId).catch(() => null); 
    const memberTag = memberUser ? memberUser.tag : `usuário com ID ${cleanedId}`;

    await sendLogMessage(
        client, globalConfig, interaction, 
        `Remoção de Membro (${originalRosterType.toUpperCase()})`, 
        `O membro **${memberTag}** foi removido do roster ${originalRosterType} da guilda **${guild.name}**.`,
        [
            { name: 'Guilda', value: guild.name, inline: true },
            { name: 'Membro Removido', value: `<@${cleanedId}>`, inline: true },
            { name: 'Tipo de Roster Original', value: originalRosterType, inline: true },
        ]
    );
    await interaction.editReply({ content: `✅ Membro **${memberTag}** removido da guilda com sucesso!` });
}

module.exports = {
    handleGuildPanelAddmember,
    handleGuildPanelAddmemberSubmit,
    handleGuildPanelRemovemember,
    handleGuildPanelRemovememberSubmit,
};
