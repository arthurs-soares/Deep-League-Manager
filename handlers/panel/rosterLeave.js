const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { loadGuildById, saveGuildData } = require('../db/guildDb');
const { saveConfig } = require('../db/configDb');
const { sendLogMessage } = require('../utils/logManager');
const { manageGuildForumPost } = require('../../utils/guildForumPostManager');
// Precisaremos da função applyLeaveCooldown que está em rosterUtils.js
const { applyLeaveCooldown, COOLDOWN_DAYS: LEAVE_COOLDOWN_DAYS } = require('./rosterUtils'); // Importando do novo utils

async function handleProfileLeaveGuild(interaction, guildMongoId, globalConfig, client) {
    // Carrega a guilda pelo ID passado no customId do botão
    const guild = await loadGuildById(guildMongoId);

    // Validações
    if (!guild) {
        return interaction.reply({ content: '❌ A guilda da qual você está tentando sair não foi encontrada. Ela pode ter sido deletada.', ephemeral: true });
    }
    if (interaction.user.id === guild.leader?.id) {
        return interaction.reply({ content: '❌ Você é o Líder desta guilda! Você não pode sair. Transfira a liderança primeiro usando o `/guilda-painel`.', ephemeral: true });
    }
    if (interaction.user.id === guild.coLeader?.id) {
        return interaction.reply({ content: '❌ Você é o Vice-Líder desta guilda! Você não pode sair. Peça ao líder para removê-lo ou transferir o cargo.', ephemeral: true });
    }

    const isInMainRoster = guild.mainRoster.some(m => m.id === interaction.user.id);
    const isInSubRoster = guild.subRoster.some(m => m.id === interaction.user.id);

    if (!isInMainRoster && !isInSubRoster) {
        return interaction.reply({ content: '❌ Você não está nos rosters desta guilda para poder sair. Contate um líder.', ephemeral: true });
    }

    // Se passou em todas as validações, mostra a confirmação final
    const confirmButton = new ButtonBuilder().setCustomId(`confirm_leave_guild_${guildMongoId}`).setLabel('Sim, Quero Sair').setStyle(ButtonStyle.Danger);
    const cancelButton = new ButtonBuilder().setCustomId('cancel_leave_guild').setLabel('Cancelar').setStyle(ButtonStyle.Secondary);
    const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

    await interaction.reply({
        content: `Você tem certeza que deseja sair da guilda **${guild.name}**? Você entrará em um cooldown de 3 dias e não poderá se juntar a outra guilda neste período.`,
        components: [row],
        ephemeral: true,
    });
}

async function handleConfirmLeaveGuild(interaction, guildMongoId, globalConfig, client) {
    await interaction.deferUpdate(); // Acknowledge o clique no botão

    const guild = await loadGuildById(guildMongoId);
    if (!guild) {
        return interaction.editReply({ content: '❌ A guilda não foi encontrada. Ação cancelada.', components: [] });
    }

    // Remove o usuário dos rosters
    guild.mainRoster = guild.mainRoster.filter(m => m.id !== interaction.user.id);
    guild.subRoster = guild.subRoster.filter(m => m.id !== interaction.user.id);
    guild.updatedAt = new Date().toISOString();
    guild.updatedBy = interaction.user.id;

    // Aplica o cooldown
    applyLeaveCooldown(interaction.user.id, globalConfig);
    
    // Salva tudo
    await saveGuildData(guild);
    await saveConfig(globalConfig);

    // Atualiza os painéis públicos
    await manageGuildForumPost(client, guild, globalConfig, 'update', interaction);
    client.emit('updateLeaderboard');

    // Loga a ação
    await sendLogMessage(
        client, globalConfig, interaction,
        'Saída de Guilda (Voluntária)',
        `${interaction.user.tag} saiu da guilda **${guild.name}**.`,
        [
            { name: 'Guilda', value: guild.name, inline: true },
            { name: 'Membro', value: interaction.user.toString(), inline: true },
        ]
    );

    // Notifica o usuário e o líder da guilda (DM)
    await interaction.editReply({ content: `✅ Você saiu da guilda **${guild.name}**.`, components: [] });
    const leader = await client.users.fetch(guild.leader.id).catch(() => null);
    if (leader) {
        await leader.send(`ℹ️ O membro **${interaction.user.tag}** saiu voluntariamente da sua guilda, **${guild.name}**.`).catch(e => console.error("Não foi possível enviar DM para o líder.", e.message));
    }
}

module.exports = {
    handleProfileLeaveGuild,
    handleConfirmLeaveGuild,
};