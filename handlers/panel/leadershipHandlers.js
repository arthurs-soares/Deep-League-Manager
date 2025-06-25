// handlers/panel/leadershipHandlers.js
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, PermissionFlagsBits } = require('discord.js');
const { loadGuildByName, saveGuildData, isUserInAnyGuild } = require('../db/guildDb');
const { loadTeamByName, saveTeamData, isUserInAnyTeam } = require('../db/teamDb');
const { saveConfig } = require('../db/configDb');                                     
const { sendLogMessage } = require('../utils/logManager');                              
const { manageLeaderRole, manageCoLeaderRole } = require('../utils/roleManager');
const { getAndValidateGuild } = require('../utils/validation');

// --- FUNÇÃO HELPER GENÉRICA DE VALIDAÇÃO ---
/**
 * Valida se um novo líder pode ser adicionado a uma entidade (guilda ou time).
 * Verifica se o usuário já está em outra entidade do mesmo tipo.
 * @param {GuildMember} newLeaderMember - O objeto do membro a ser validado.
 * @param {Object} entity - O objeto da guilda ou time atual.
 * @param {'guild'|'team'} entityType - O tipo da entidade.
 * @returns {Promise<string|null>} Uma mensagem de erro se a validação falhar, ou null se for bem-sucedida.
 */
async function validateNewLeader(newLeaderMember, entity, entityType) {
    if (entityType === 'guild') {
        const userInGuild = await isUserInAnyGuild(newLeaderMember.id);
        if (userInGuild && userInGuild.id.toString() !== entity.id.toString()) {
            return `❌ O usuário ${newLeaderMember.toString()} já está na guilda **${userInGuild.name}**!`;
        }
    } else { // entityType === 'team'
        const userInTeam = await isUserInAnyTeam(newLeaderMember.id);
        if (userInTeam && userInTeam.id.toString() !== entity.id.toString()) {
            return `❌ O usuário ${newLeaderMember.toString()} já está no time **${userInTeam.name}**!`;
        }
    }
    // Adicionar verificação de cooldown aqui se a lógica for a mesma para ambos
    return null;
}

// --- HANDLERS GENÉRICOS (PONTOS DE ENTRADA) ---

/**
 * Abre o modal para definir o co-líder (APENAS GUILDAS).
 */
async function handleEntityPanelSetCoLeader(interaction, entityType, entityIdSafe, globalConfig, client) {
    if (entityType !== 'guild') {
        return interaction.reply({ content: "❌ Times não possuem vice-líderes.", ephemeral: true });
    }

    const guild = await getAndValidateGuild(entityIdSafe, interaction, globalConfig, client, loadGuildByName, true, false); 
    if (!guild) return;

    const modal = new ModalBuilder()
        .setCustomId(`modal_guildpanel_setcoleader_${entityIdSafe}`)
        .setTitle(`Trocar Vice-Líder - ${guild.name}`);
    
    const userIdInput = new TextInputBuilder().setCustomId('coleader_id').setLabel("ID do Discord do Novo Vice-Líder").setStyle(TextInputStyle.Short).setPlaceholder("Deixe em branco para remover").setRequired(false).setValue(guild.coLeader ? guild.coLeader.id : '');
    modal.addComponents(new ActionRowBuilder().addComponents(userIdInput));
    
    await interaction.showModal(modal);
}

/**
 * Abre o modal para transferir a liderança (Guildas e Times).
 */
async function handleEntityPanelTransferLeader(interaction, entityType, entityIdSafe, globalConfig, client) {
    const typeName = entityType === 'guild' ? 'Guilda' : 'Time';
    const loadByName = entityType === 'guild' ? loadGuildByName : loadTeamByName;
    
    const entity = await loadByName(entityIdSafe.replace(/-/g, ' '));
    if (!entity) return interaction.reply({ content: `❌ ${typeName} não encontrada.`, ephemeral: true });

    const isLeader = entity.leader.id === interaction.user.id;
    const isMod = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    if (!isLeader && !isMod) return interaction.reply({ content: `❌ Apenas o líder ou um moderador pode transferir a liderança.`, ephemeral: true });

    const modal = new ModalBuilder()
        .setCustomId(`modal_${entityType}panel_transferleader_${entityIdSafe}`)
        .setTitle(`Transferir Liderança - ${entity.name}`);
    
    const newLeaderIdInput = new TextInputBuilder().setCustomId('new_leader_id').setLabel("ID do Discord do Novo Líder").setStyle(TextInputStyle.Short).setPlaceholder("ID do usuário que será o novo líder").setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(newLeaderIdInput));
    
    await interaction.showModal(modal);
}

// --- HANDLERS DE SUBMISSÃO GENÉRICOS ---

/**
 * Processa a submissão do modal de definir co-líder (APENAS GUILDAS).
 */
async function handleEntityPanelSetCoLeaderSubmit(interaction, entityType, entityIdSafe, globalConfig, client) {
    if (entityType !== 'guild') return; // Segurança extra

    await interaction.deferReply({ ephemeral: true });
    
    const guild = await getAndValidateGuild(entityIdSafe, interaction, globalConfig, client, loadGuildByName, true, false); 
    if (!guild) return;

    const newCoLeaderId = interaction.fields.getTextInputValue('coleader_id').trim();
    
    if (!newCoLeaderId) {
        if (!guild.coLeader) return interaction.editReply({ content: '✅ Já não há um vice-líder definido.' });
        
        const oldCoLeader = guild.coLeader;
        guild.coLeader = null;
        await saveGuildData(guild);
        if (oldCoLeader?.id) await manageCoLeaderRole(client, interaction.guild.id, oldCoLeader.id, false, globalConfig);
        
        client.emit('updateLeaderboard');
        await sendLogMessage(client, globalConfig, interaction, 'Remoção de Vice-Líder', `O vice-líder da guilda **${guild.name}** foi removido.`);
        return interaction.editReply({ content: '✅ Vice-líder removido com sucesso!' });
    }
    
    const cleanedId = (newCoLeaderId.match(/^<@!?(\d+)>$/) || [, newCoLeaderId])[1];
    if (!/^\d+$/.test(cleanedId)) return interaction.editReply({ content: '❌ ID inválido.' });
    if (cleanedId === guild.leader.id) return interaction.editReply({ content: '❌ Vice-líder não pode ser o mesmo que o líder.' });
    
    const newMember = await interaction.guild.members.fetch(cleanedId).catch(() => null);
    if (!newMember) return interaction.editReply({ content: `❌ Usuário não encontrado.` });

    const validationError = await validateNewLeader(newMember, guild, 'guild');
    if (validationError) return interaction.editReply({ content: validationError });

    const oldCoLeader = guild.coLeader;
    if (oldCoLeader?.id) await manageCoLeaderRole(client, interaction.guild.id, oldCoLeader.id, false, globalConfig);
    
    await manageCoLeaderRole(client, interaction.guild.id, newMember.id, true, globalConfig);
    guild.coLeader = { id: newMember.id, username: newMember.user.username };
    await saveGuildData(guild);
    
    client.emit('updateLeaderboard');
    await sendLogMessage(client, globalConfig, interaction, 'Troca de Vice-Líder', `O vice-líder de **${guild.name}** foi atualizado para **${newMember.user.tag}**.`);
    await interaction.editReply({ content: `✅ Vice-líder atualizado para **${newMember.user.tag}** com sucesso!` });
}


/**
 * Processa a submissão do modal de transferência de liderança (Guildas e Times).
 */
async function handleEntityPanelTransferLeaderSubmit(interaction, entityType, entityIdSafe, globalConfig, client) {
    await interaction.deferReply({ ephemeral: true });

    const typeName = entityType === 'guild' ? 'Guilda' : 'Time';
    const loadByName = entityType === 'guild' ? loadGuildByName : loadTeamByName;
    const saveFunction = entityType === 'guild' ? saveGuildData : saveTeamData;
    
    const entity = await loadByName(entityIdSafe.replace(/-/g, ' '));
    if (!entity) return interaction.editReply({ content: `❌ ${typeName} não encontrada.` });

    const newLeaderId = interaction.fields.getTextInputValue('new_leader_id');
    const cleanedId = (newLeaderId.match(/^<@!?(\d+)>$/) || [, newLeaderId])[1];
    if (!/^\d+$/.test(cleanedId)) return interaction.editReply({ content: '❌ ID inválido.' });
    if (cleanedId === entity.leader.id) return interaction.editReply({ content: '❌ O novo líder não pode ser o mesmo que o atual.' });
    
    const newLeaderMember = await interaction.guild.members.fetch(cleanedId).catch(() => null);
    if (!newLeaderMember) return interaction.editReply({ content: `❌ Usuário não encontrado.` });
    
    const validationError = await validateNewLeader(newLeaderMember, entity, entityType);
    if (validationError) return interaction.editReply({ content: validationError });

    const oldLeader = entity.leader;
    entity.leader = { id: newLeaderMember.id, username: newLeaderMember.user.username };
    
    if (entityType === 'guild') {
        await manageLeaderRole(client, interaction.guild.id, oldLeader.id, false, globalConfig);
        await manageLeaderRole(client, interaction.guild.id, newLeaderMember.id, true, globalConfig);
        
        if (entity.coLeader?.id === oldLeader.id) entity.coLeader = null;
        if (!entity.coLeader) {
            entity.coLeader = { id: oldLeader.id, username: oldLeader.username };
            await manageCoLeaderRole(client, interaction.guild.id, oldLeader.id, true, globalConfig);
        }
    }

    await saveFunction(entity);

    if (entityType === 'guild') client.emit('updateLeaderboard');
    else client.emit('updateTeamLeaderboard');
    
    await sendLogMessage(client, globalConfig, interaction, `Transferência de Liderança de ${typeName}`, `A liderança de **${entity.name}** foi transferida para **${newLeaderMember.user.tag}**.`);
    await interaction.editReply({ content: `✅ Liderança de **${entity.name}** transferida para **${newLeaderMember.user.tag}** com sucesso!` });
}


module.exports = {
    handleEntityPanelSetCoLeader,
    handleEntityPanelSetCoLeaderSubmit,
    handleEntityPanelTransferLeader,
    handleEntityPanelTransferLeaderSubmit,
};