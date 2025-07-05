// handlers/panel/leadershipHandlers.js
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { loadGuildByName, saveGuildData, isUserInAnyGuild } = require('../../db/guildDb'); 
const { saveConfig } = require('../../db/configDb');                                     
const { sendLogMessage } = require('../../utils/logManager');                              
const { manageLeaderRole, manageCoLeaderRole } = require('../../utils/roleManager');       
const { getAndValidateGuild } = require('../../utils/validation');                         


const COOLDOWN_DAYS = 3; 


async function handleGuildPanelSetcoleader(interaction, guildIdSafe, globalConfig, client) { 
    const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, true, true); 
    if (!guild) return;

    const modal = new ModalBuilder()
        .setCustomId(`modal_guildpanel_setcoleader_${guildIdSafe}`)
        .setTitle(`Trocar Vice-Líder - ${guild.name}`);

    const userIdInput = new TextInputBuilder()
        .setCustomId('coleader_id')
        .setLabel("ID do Discord do Novo Vice-Líder")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Deixe em branco para remover o vice-líder atual")
        .setRequired(false)
        .setValue(guild.coLeader ? guild.coLeader.id : '');

    modal.addComponents(new ActionRowBuilder().addComponents(userIdInput));
    
    await interaction.showModal(modal);
}

async function handleGuildPanelSetcoleaderSubmit(interaction, guildIdSafe, globalConfig, client) { 
    await interaction.deferReply({ ephemeral: true });
    
    const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, true, true); 
    if (!guild) return;

    const newCoLeaderId = interaction.fields.getTextInputValue('coleader_id');
    const discordGuildId = interaction.guild.id; 
    const oldCoLeader = guild.coLeader; 

    const cleanedCoLeaderId = (newCoLeaderId.match(/^<@!?(\d+)>$/) || [, newCoLeaderId])[1];
    if (newCoLeaderId && !/^\d+$/.test(cleanedCoLeaderId)) { 
        return interaction.editReply({ content: '❌ O ID fornecido é inválido. Deve ser numérico ou uma menção válida.' });
    }

    if (!newCoLeaderId || newCoLeaderId.trim() === '') { 
        if (!guild.coLeader) {
            await sendLogMessage(
                client, globalConfig, interaction, 
                'Remoção de Vice-Líder', 
                `Tentativa de remover vice-líder da guilda **${guild.name}**, mas já não havia um.`,
                [{ name: 'Guilda', value: guild.name, inline: true }]
            );
            return interaction.editReply({ content: '✅ Já não há um vice-líder definido.' });
        }
        guild.coLeader = null;
        await saveGuildData(guild);
        if (oldCoLeader?.id) {
            await manageCoLeaderRole(client, discordGuildId, oldCoLeader.id, false, globalConfig); 
            const now = new Date();
            globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== oldCoLeader.id);
            globalConfig.recentlyLeftUsers.push({ userId: oldCoLeader.id, leaveTimestamp: now.toISOString() });
            const threeDaysAgo = new Date(now.getTime() - (COOLDOWN_DAYS * 24 * 60 * 60 * 1000));
            globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => new Date(u.leaveTimestamp) > threeDaysAgo);
            await saveConfig(globalConfig);
        }
        client.emit('updateLeaderboard');
        await sendLogMessage(
            client, globalConfig, interaction, 
            'Remoção de Vice-Líder', 
            `O vice-líder da guilda **${guild.name}** foi removido.`,
            [
                { name: 'Guilda', value: guild.name, inline: true },
                { name: 'Vice-Líder Removido', value: `<@${oldCoLeader.id}> (${oldCoLeader.username})`, inline: true },
            ]
        );
        return interaction.editReply({ content: '✅ Vice-líder removido com sucesso!' });
    }
    
    if (cleanedCoLeaderId === guild.leader.id) {
        return interaction.editReply({ content: '❌ O vice-líder não pode ser o mesmo que o líder.' });
    }
    
    const newCoLeaderMember = await interaction.guild.members.fetch(cleanedCoLeaderId).catch(() => null); 
    if (!newCoLeaderMember) return interaction.editReply({ content: `❌ Usuário com ID \`${cleanedCoLeaderId}\` não encontrado neste servidor.` });

    const userInGuild = await isUserInAnyGuild(newCoLeaderMember.id);
    if (userInGuild && userInGuild.name !== guild.name) {
        return interaction.editReply({ content: `❌ O usuário ${newCoLeaderMember.toString()} já está na guilda **${userInGuild.name}** e não pode ser vice-líder desta!` });
    }

    const recentlyLeftUser = globalConfig.recentlyLeftUsers.find(u => u.userId === newCoLeaderMember.id);
    if (recentlyLeftUser) {
        const leaveTime = new Date(recentlyLeftUser.leaveTimestamp).getTime();
        const now = Date.now();
        const diffTime = now - leaveTime;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays < COOLDOWN_DAYS) {
            const remainingDays = COOLDOWN_DAYS - diffDays;
            return interaction.editReply({ content: `❌ O usuário ${newCoLeaderMember.toString()} deixou uma guilda há ${diffDays} dia(s) e precisa esperar ${remainingDays} dia(s) para se tornar vice-líder de uma nova guilda!` });
        }
    }

    if (guild.coLeader && guild.coLeader.id === newCoLeaderMember.id) {
        await sendLogMessage(
            client, globalConfig, interaction, 
            'Troca de Vice-Líder', 
            `Tentativa de trocar vice-líder da guilda **${guild.name}**, mas o usuário já era o vice-líder.`,
            [
                { name: 'Guilda', value: guild.name, inline: true },
                { name: 'Vice-Líder', value: `<@${newCoLeaderMember.id}>`, inline: true },
            ]
        );
        return interaction.editReply({ content: `✅ O usuário ${newCoLeaderMember.user.tag} já é o vice-líder.` });
    }

    if (oldCoLeader?.id) {
        await manageCoLeaderRole(client, discordGuildId, oldCoLeader.id, false, globalConfig); 
        const now = new Date();
        globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== oldCoLeader.id);
        globalConfig.recentlyLeftUsers.push({ userId: oldCoLeader.id, leaveTimestamp: now.toISOString() });
        const threeDaysAgo = new Date(now.getTime() - (COOLDOWN_DAYS * 24 * 60 * 60 * 1000));
        globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => new Date(u.leaveTimestamp) > threeDaysAgo);
        await saveConfig(globalConfig);
    }
    await manageCoLeaderRole(client, discordGuildId, newCoLeaderMember.id, true, globalConfig); 

    guild.coLeader = { id: newCoLeaderMember.id, username: newCoLeaderMember.user.username };
    guild.updatedAt = new Date().toISOString();
    guild.updatedBy = interaction.user.id;

    await saveGuildData(guild);
    globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== newCoLeaderMember.id);
    await saveConfig(globalConfig); 

    client.emit('updateLeaderboard');

    await sendLogMessage(
        client, globalConfig, interaction, 
        'Troca de Vice-Líder', 
        `O vice-líder da guilda **${guild.name}** foi atualizado.`,
        [
            { name: 'Guilda', value: guild.name, inline: true },
            { name: 'Vice-Líder Antigo', value: oldCoLeader ? `<@${oldCoLeader.id}>` : 'N/A', inline: true },
            { name: 'Vice-Líder Novo', value: `<@${newCoLeaderMember.id}>`, inline: true },
        ]
    );
    await interaction.editReply({ content: `✅ Vice-líder atualizado para **${newCoLeaderMember.user.tag}** com sucesso!` });
}

async function handleGuildPanelTransferleader(interaction, guildIdSafe, globalConfig, client) { 
    const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, true, true); 
    if (!guild) return;

    const modal = new ModalBuilder()
        .setCustomId(`modal_guildpanel_transferleader_${guildIdSafe}`)
        .setTitle(`Transferir Liderança - ${guild.name}`);

    const newLeaderIdInput = new TextInputBuilder()
        .setCustomId('new_leader_id')
        .setLabel("ID do Discord do Novo Líder")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("ID do usuário que será o novo líder")
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(newLeaderIdInput));

    await interaction.showModal(modal);
}

async function handleGuildPanelTransferleaderSubmit(interaction, guildIdSafe, globalConfig, client) { 
    await interaction.deferReply({ ephemeral: true });
    
    const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, true, true); 
    if (!guild) return;

    const newLeaderId = interaction.fields.getTextInputValue('new_leader_id');
    const discordGuildId = interaction.guild.id; 
    const oldLeader = guild.leader; 
    const oldCoLeader = guild.coLeader; 

    const cleanedLeaderId = (newLeaderId.match(/^<@!?(\d+)>$/) || [, newLeaderId])[1];
    if (!/^\d+$/.test(cleanedLeaderId)) { 
        return interaction.editReply({ content: '❌ O ID fornecido é inválido. Deve ser numérico ou uma menção válida.' });
    }

    if (cleanedLeaderId === guild.leader.id) {
        return interaction.editReply({ content: '❌ O novo líder não pode ser o mesmo que o atual.' });
    }

    const newLeaderMember = await interaction.guild.members.fetch(cleanedLeaderId).catch(() => null); 
    if (!newLeaderMember) {
        return interaction.editReply({ content: `❌ Usuário com ID \`${cleanedLeaderId}\` (digitado como \`${newLeaderId}\`) não encontrado neste servidor.` });
    }

    const userInGuild = await isUserInAnyGuild(newLeaderMember.id);
    if (userInGuild && userInGuild.name !== guild.name) {
        return interaction.editReply({ content: `❌ O usuário ${newLeaderMember.toString()} já está na guilda **${userInGuild.name}** e não pode se tornar líder desta!` });
    }

    const recentlyLeftUser = globalConfig.recentlyLeftUsers.find(u => u.userId === newLeaderMember.id);
    if (recentlyLeftUser) {
        const leaveTime = new Date(recentlyLeftUser.leaveTimestamp).getTime();
        const now = Date.now();
        const diffTime = now - leaveTime;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays < COOLDOWN_DAYS) {
            const remainingDays = COOLDOWN_DAYS - diffDays;
            return interaction.editReply({ content: `❌ O usuário ${newLeaderMember.toString()} deixou uma guilda há ${diffDays} dia(s) e precisa esperar ${remainingDays} dia(s) para se tornar líder de uma nova guilda!` });
        }
    }

    if (oldLeader.id) {
        await manageLeaderRole(client, discordGuildId, oldLeader.id, false, globalConfig);
    }
    await manageLeaderRole(client, discordGuildId, newLeaderMember.id, true, globalConfig);

    guild.leader = { id: newLeaderMember.id, username: newLeaderMember.user.username };
    
    if (oldCoLeader?.id === oldLeader.id) { 
        guild.coLeader = null; 
    }
    if (oldLeader.id && oldLeader.id !== newLeaderMember.id && !guild.coLeader) { 
        guild.coLeader = { id: oldLeader.id, username: oldLeader.username }; 
    }
    
    guild.updatedAt = new Date().toISOString();
    guild.updatedBy = interaction.user.id;

    await saveGuildData(guild);

    const now = new Date();
    globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== newLeaderMember.id);
    
    if (oldLeader.id !== newLeaderMember.id && (!guild.coLeader || guild.coLeader.id !== oldLeader.id)) {
        globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== oldLeader.id);
        globalConfig.recentlyLeftUsers.push({ userId: oldLeader.id, leaveTimestamp: now.toISOString() });
    }
    if (oldCoLeader?.id && oldCoLeader.id !== oldLeader.id && oldCoLeader.id !== newLeaderMember.id && guild.coLeader?.id !== oldCoLeader.id) {
        globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== oldCoLeader.id);
        globalConfig.recentlyLeftUsers.push({ userId: oldCoLeader.id, leaveTimestamp: now.toISOString() });
    }
    const threeDaysAgo = new Date(now.getTime() - (COOLDOWN_DAYS * 24 * 60 * 60 * 1000));
    globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => new Date(u.leaveTimestamp) > threeDaysAgo);
    
    await saveConfig(globalConfig); 

    if (oldLeader.id && oldLeader.id !== newLeaderMember.id) {
        const oldLeaderMember = await interaction.guild.members.fetch(oldLeader.id).catch(e => console.error(`[TransferLeader] Não buscou antigo líder ${oldLeader.id} para gerenciar cargo:`, e));
        if (oldLeaderMember) {
            await manageCoLeaderRole(client, discordGuildId, oldLeader.id, guild.coLeader?.id === oldLeader.id, globalConfig); 
        }
    }
    if (oldCoLeader?.id && oldCoLeader.id !== oldLeader.id && oldCoLeader.id !== newLeaderMember.id && guild.coLeader?.id !== oldCoLeader.id) {
        const oldCoLeaderMember = await interaction.guild.members.fetch(oldCoLeader.id).catch(e => console.error(`[TransferLeader] Não buscou antigo co-líder ${oldCoLeader.id} para limpar cargo:`, e));
        if (oldCoLeaderMember) {
            await manageCoLeaderRole(client, discordGuildId, oldCoLeader.id, false, globalConfig); 
        }
    }

    client.emit('updateLeaderboard');

    await sendLogMessage(
        client, globalConfig, interaction, 
        'Transferência de Liderança', 
        `A liderança da guilda **${guild.name}** foi transferida.`,
        [
            { name: 'Guilda', value: guild.name, inline: true },
            { name: 'Líder Antigo', value: `<@${oldLeader.id}>`, inline: true },
            { name: 'Líder Novo', value: `<@${newLeaderMember.id}>`, inline: true },
            { name: 'Vice-Líder Antigo', value: oldCoLeader ? `<@${oldCoLeader.id}>` : 'N/A', inline: true },
            { name: 'Vice-Líder Novo (se houver)', value: guild.coLeader ? `<@${guild.coLeader.id}>` : 'N/A', inline: true },
        ]
    );
    await interaction.editReply({ content: `✅ Liderança da guilda **${guild.name}** transferida para **${newLeaderMember.user.tag}** com sucesso!` });
}


module.exports = {
    handleGuildPanelSetcoleader,
    handleGuildPanelSetcoleaderSubmit,
    handleGuildPanelTransferleader,
    handleGuildPanelTransferleaderSubmit,
};
