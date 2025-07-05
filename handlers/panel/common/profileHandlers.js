const { EmbedBuilder } = require('discord.js');
const { loadUserProfile } = require('../../db/userProfileDb');
const { getEloRank, generateProgressBar, getNextRank } = require('../../elo/eloRanks');
const { validateUserForElo } = require('../../elo/eloValidation');
const { ELO_CONFIG } = require('../../../utils/eloConstants');

/**
 * Handler para o botão "Ver stats" no perfil
 * Este handler executa o comando /elo-stats para o usuário
 * @param {Interaction} interaction - A interação do botão
 * @param {string} userId - ID do usuário para ver as estatísticas
 * @param {Object} globalConfig - Configurações globais
 * @param {Client} client - Cliente do Discord
 */
async function handleProfileViewEloStats(interaction, userId, globalConfig, client) {
    await interaction.deferReply();

    try {
        // Buscar o usuário pelo ID
        const targetUser = await client.users.fetch(userId);
        if (!targetUser) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Usuário não encontrado')
                    .setDescription('Não foi possível encontrar o usuário.')
                    .setTimestamp()]
            });
        }

        // Validar usuário
        const userValidation = validateUserForElo(targetUser, interaction.guild);
        if (!userValidation.isValid) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Usuário Inválido')
                    .setDescription(userValidation.error)
                    .setTimestamp()]
            });
        }

        // Buscar o perfil do usuário
        const userProfile = await loadUserProfile(userId);
        const targetMember = await interaction.guild.members.fetch(userId);

        // Verificar se tem dados de ELO
        if (!userProfile.eloData || userProfile.eloData.currentElo === undefined) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('📊 Estatísticas de ELO')
                    .setDescription(`**${targetMember.displayName}** ainda não possui dados de ELO.`)
                    .setTimestamp()]
            });
        }

        // Criar embed de estatísticas
        const embed = await createStatsEmbed(userProfile, targetMember, globalConfig);
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Erro ao processar botão de estatísticas de ELO:', error);
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription('Ocorreu um erro ao buscar as estatísticas. Tente novamente.')
                .setTimestamp()]
        });
    }
}

/**
 * Cria o embed de estatísticas de ELO
 * Esta função é uma cópia exata da função em commands/elo-stats.js
 */
async function createStatsEmbed(userProfile, member, globalConfig) {
    const eloData = userProfile.eloData;
    const currentRank = getEloRank(eloData.currentElo);
    const nextRank = getNextRank(eloData.currentElo);
    
    const embed = new EmbedBuilder()
        .setColor(currentRank.color)
        .setTitle(`📊 Estatísticas de ELO - ${member.displayName}`)
        .setThumbnail(member.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

    // Seção principal de ELO
    let mainEloText = `${currentRank.emoji} **${currentRank.name}**\n`;
    mainEloText += `**ELO Atual:** ${eloData.currentElo}\n`;
    mainEloText += `**Peak ELO:** ${eloData.peakElo}\n`;
    
    if (nextRank) {
        mainEloText += `**Próximo Rank:** ${nextRank.emoji} ${nextRank.name}\n`;
        mainEloText += `**ELO Necessário:** ${nextRank.requiredElo} (+${nextRank.eloToNext})\n`;
    } else {
        mainEloText += `**Status:** Rank Máximo Alcançado! 👑\n`;
    }

    embed.addFields({
        name: '⚡ Informações de ELO',
        value: mainEloText,
        inline: false
    });

    // Progresso no rank atual
    const progressBar = generateProgressBar(eloData.currentElo);
    embed.addFields({
        name: '📈 Progresso no Rank',
        value: `\`${progressBar}\``,
        inline: false
    });

    // Estatísticas de performance
    let performanceText = `**MVPs:** ${eloData.mvpCount || 0}\n`;
    performanceText += `**Vitórias Flawless:** ${eloData.flawlessWins || 0}\n`;
    performanceText += `**Derrotas Flawless:** ${eloData.flawlessLosses || 0}\n`;
    
    // Calcular taxa de flawless
    const totalFlawless = (eloData.flawlessWins || 0) + (eloData.flawlessLosses || 0);
    if (totalFlawless > 0) {
        const flawlessWinRate = Math.round(((eloData.flawlessWins || 0) / totalFlawless) * 100);
        performanceText += `📊 **Taxa Flawless:** ${flawlessWinRate}%\n`;
    }

    embed.addFields({
        name: '🏆 Performance',
        value: performanceText,
        inline: true
    });

    // Estatísticas gerais (do sistema antigo)
    const personalScore = userProfile.personalScore || { wins: 0, losses: 0 };
    const totalGames = personalScore.wins + personalScore.losses;
    const winRate = totalGames > 0 ? Math.round((personalScore.wins / totalGames) * 100) : 0;

    let generalText = `🎯 **Vitórias:** ${personalScore.wins}\n`;
    generalText += `**Derrotas:** ${personalScore.losses}\n`;
    generalText += `**Taxa de Vitória:** ${winRate}%\n`;
    generalText += `**Total de Jogos:** ${totalGames}`;

    embed.addFields({
        name: '📋 Estatísticas Gerais',
        value: generalText,
        inline: true
    });

    // Histórico recente (últimas 5 mudanças)
    if (eloData.eloHistory && eloData.eloHistory.length > 0) {
        let historyText = '';
        const recentHistory = eloData.eloHistory.slice(0, 5);
        
        for (const entry of recentHistory) {
            const date = new Date(entry.date).toLocaleDateString('pt-BR', { 
                day: '2-digit', 
                month: '2-digit' 
            });
            const changeStr = entry.eloChange > 0 ? `+${entry.eloChange}` : `${entry.eloChange}`;
            const arrow = entry.eloChange > 0 ? '↗️' : '↘️';
            
            historyText += `${arrow} **${changeStr}** → ${entry.newElo} | ${date}\n`;
            
            // Adicionar contexto se disponível
            if (entry.matchResult) {
                historyText += `   🏆 ${entry.matchResult}`;
                if (entry.reason.includes('mvp')) historyText += ' (MVP)';
                if (entry.reason.includes('flawless')) historyText += ' (FLAWLESS)';
                historyText += '\n';
            }
        }
        
        if (historyText.length > 1024) {
            historyText = historyText.substring(0, 1021) + '...';
        }
        
        embed.addFields({
            name: '📜 Histórico Recente',
            value: historyText,
            inline: true
        });
    }

    // Informações adicionais
    let additionalInfo = '';
    
    // Calcular diferença do peak
    const peakDifference = eloData.peakElo - eloData.currentElo;
    if (peakDifference > 0) {
        additionalInfo += `📉 **Abaixo do Peak:** -${peakDifference} ELO\n`;
    } else if (peakDifference === 0) {
        additionalInfo += `🎯 **No Peak Atual!**\n`;
    }

    // Data da última atualização
    if (eloData.lastEloUpdate) {
        const lastUpdate = new Date(eloData.lastEloUpdate);
        const daysSince = Math.floor((Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));
        additionalInfo += `⏱️ **Última Atualização:** ${daysSince === 0 ? 'Hoje' : `${daysSince} dias atrás`}\n`;
    }

    // Quantidade de histórico
    if (eloData.eloHistory) {
        additionalInfo += `📚 **Mudanças Registradas:** ${eloData.eloHistory.length}`;
    }

    if (additionalInfo) {
        embed.addFields({
            name: 'ℹ️ Informações Adicionais',
            value: additionalInfo,
            inline: false
        });
    }

    // Footer com dicas
    let footerText = '';
    if (nextRank) {
        footerText = `Você precisa de mais ${nextRank.eloToNext} ELO para alcançar ${nextRank.name}!`;
    } else {
        footerText = 'Parabéns! Você alcançou o rank máximo do sistema!';
    }
    
    embed.setFooter({ text: footerText });

    return embed;
}

module.exports = {
    handleProfileViewEloStats
}; 