// handlers/panel/war/warRoundHandler.js
const { EmbedBuilder } = require('discord.js');
const { loadWarTicketByThreadId, saveWarTicket, deleteWarTicket } = require('../../db/warDb');
const { sendLogMessage } = require('../../utils/logManager');
const { MAX_ROUNDS, ROUNDS_TO_WIN } = require('../../utils/constants');
const { createWarCurrentButtons } = require('../warTicketButtons');
const { saveEntityScore, processWarResultForPersonalScores, restrictThreadAccessOnCompletion } = require('./warLogic');

async function handleWarRoundButton(interaction, client, globalConfig) {
    await interaction.deferUpdate();
    const customIdParts = interaction.customId.split('_');
    const roundNumberStr = customIdParts.pop();
    const winningEntityIdForButton = customIdParts.slice(3).join('_');
    const winningEntityName = winningEntityIdForButton.replace(/_/g, ' ');
    const currentRoundClicked = parseInt(roundNumberStr);

    const threadId = interaction.channel.id;
    const warData = await loadWarTicketByThreadId(threadId);

    if (!warData || warData.status !== 'Aceita') {
        return interaction.followUp({ content: '...', ephemeral: true });
    }
    if (currentRoundClicked !== warData.currentRound) {
        return interaction.followUp({ content: `❌ Você só pode votar no Round ${warData.currentRound} agora.`, ephemeral: true });
    }

    const isModerator = (globalConfig.moderatorRoles || []).some(roleId => interaction.member.roles.cache.has(roleId));
    const isScoreOperator = (globalConfig.scoreOperatorRoles || []).some(roleId => interaction.member.roles.cache.has(roleId));

    if (!isModerator && !isScoreOperator) {
        return interaction.followUp({ content: '❌ Apenas moderadores ou operadores de score podem registrar o resultado das rodadas.', ephemeral: true });
    }

    let losingEntityName;
    if (winningEntityName.toLowerCase() === warData.yourEntity.name.toLowerCase()) {
        losingEntityName = warData.enemyEntity.name;
    } else if (winningEntityName.toLowerCase() === warData.enemyEntity.name.toLowerCase()) {
        losingEntityName = warData.yourEntity.name;
    } else {
        return interaction.followUp({ content: '❌ Erro interno: Nome da entidade vencedora da rodada inválido.', ephemeral: true });
    }

    warData.roundScores[winningEntityName]++;
    warData.currentRound++;

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
        components = [];

        await saveEntityScore(finalWinner.name, finalWinner.type, { wins: 1, losses: 0 });
        await saveEntityScore(finalLoser.name, finalLoser.type, { wins: 0, losses: 1 });
        await processWarResultForPersonalScores(finalWinner, finalLoser);

        client.emit('updateLeaderboard');
        client.emit('updateTeamLeaderboard');

        await restrictThreadAccessOnCompletion(client, warData.threadId); 
        await deleteWarTicket(warData.threadId);

    } else if (warData.currentRound <= MAX_ROUNDS) {
        components = createWarCurrentButtons(warData);
        const statusFieldIndex = warEmbed.fields.findIndex(field => field.name === 'Status');
        const newStatus = `Round ${warData.currentRound} - Em Andamento`;
        if (statusFieldIndex !== -1) {
            warEmbed.spliceFields(statusFieldIndex, 1, { name: 'Status', value: newStatus, inline: false });
        } else {
            warEmbed.addFields({ name: 'Status', value: newStatus, inline: false });
        }
    } else {
        finalMessage = `🚫 A War/Glad entre **${warData.yourEntity.name}** e **${warData.enemyEntity.name}** terminou sem um vencedor claro.`;
        warEmbed.setColor('#95A5A6');
        const statusFieldIndex = warEmbed.fields.findIndex(field => field.name === 'Status');
        if (statusFieldIndex !== -1) {
            warEmbed.spliceFields(statusFieldIndex, 1, { name: 'Status', value: '🚫 Sem Vencedor Claro', inline: false });
        }
        warData.status = 'Concluída';
        components = [];
        await restrictThreadAccessOnCompletion(client, warData.threadId);
        await deleteWarTicket(warData.threadId);
    }

    await saveWarTicket(warData);
    await interaction.message.edit({ embeds: [warEmbed], components: components });

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
}

module.exports = { handleWarRoundButton };
