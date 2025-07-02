// commands/ranking-elo.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getDatabaseInstance } = require('../utils/database');
const { getEloRank, getAllRanks } = require('../handlers/elo/eloRanks');
const { ELO_CONFIG } = require('../utils/eloConstants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ranking-elo')
        .setDescription('Ver ranking de ELO dos jogadores')
        .addStringOption(option =>
            option.setName('rank')
                .setDescription('Filtrar por rank específico')
                .setRequired(false)
                .addChoices(
                    { name: 'Rank D', value: 'RANK_D' },
                    { name: 'Rank C', value: 'RANK_C' },
                    { name: 'Rank B', value: 'RANK_B' },
                    { name: 'Rank A', value: 'RANK_A' },
                    { name: 'Rank A+', value: 'RANK_A_PLUS' },
                    { name: 'Grandmaster', value: 'GRANDMASTER' }
                ))
        .addIntegerOption(option =>
            option.setName('limite')
                .setDescription('Número de jogadores para mostrar')
                .setRequired(false)
                .setMinValue(5)
                .setMaxValue(25))
        .addIntegerOption(option =>
            option.setName('pagina')
                .setDescription('Página do ranking')
                .setRequired(false)
                .setMinValue(1))
        .addBooleanOption(option =>
            option.setName('compacto')
                .setDescription('Exibir ranking em formato compacto')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('estatisticas')
                .setDescription('Exibir estatísticas gerais')
                .setRequired(false)),

    async execute(interaction, client, globalConfig) {
        await interaction.deferReply();

        try {
            const rankFilter = interaction.options.getString('rank');
            const limite = interaction.options.getInteger('limite') || 10; // Reduzido para 10 por padrão
            const pagina = interaction.options.getInteger('pagina') || 1;
            const offset = (pagina - 1) * limite;
            const modoCompacto = interaction.options.getBoolean('compacto') ?? true; // Compacto por padrão
            const mostrarEstatisticas = interaction.options.getBoolean('estatisticas') ?? false; // Não mostrar estatísticas por padrão

            // Construir query para buscar jogadores com ELO
            const db = getDatabaseInstance();
            let matchQuery = {
                'eloData.currentElo': { $exists: true, $gte: ELO_CONFIG.MIN_ELO }
            };

            // Aplicar filtro de rank se especificado
            if (rankFilter) {
                const ranks = getAllRanks();
                const selectedRank = ranks.find(rank => 
                    rank.name.replace(/\s+/g, '_').replace('+', '_PLUS').toUpperCase() === rankFilter
                );
                
                if (selectedRank) {
                    matchQuery['eloData.currentElo'] = {
                        $gte: selectedRank.min,
                        $lte: selectedRank.max === Infinity ? ELO_CONFIG.MAX_ELO : selectedRank.max
                    };
                }
            }

            // Buscar jogadores no banco de dados
            const players = await db.collection('user_profiles')
                .find(matchQuery)
                .sort({ 'eloData.currentElo': -1 })
                .skip(offset)
                .limit(limite)
                .toArray();

            // Contar total para paginação
            const totalPlayers = await db.collection('user_profiles')
                .countDocuments(matchQuery);

            if (players.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('📊 Ranking ELO')
                    .setDescription('Nenhum jogador encontrado com os filtros especificados.')
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            // Criar embed do ranking
            const rankingEmbed = await createRankingEmbed(players, interaction.guild, {
                rankFilter: rankFilter,
                pagina: pagina,
                limite: limite,
                totalPlayers: totalPlayers,
                offset: offset,
                modoCompacto: modoCompacto
            });

            // Se as estatísticas estiverem habilitadas, criar um embed adicional
            if (mostrarEstatisticas && !rankFilter && pagina === 1) {
                const statsEmbed = await createStatsEmbed(rankFilter);
                await interaction.editReply({ embeds: [rankingEmbed, statsEmbed] });
            } else {
                await interaction.editReply({ embeds: [rankingEmbed] });
            }

        } catch (error) {
            console.error('Erro no comando ranking-elo:', error);
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Erro')
                    .setDescription('Ocorreu um erro ao buscar o ranking. Tente novamente.')
                    .setTimestamp()]
            });
        }
    },
};

async function createRankingEmbed(players, guild, options) {
    const { rankFilter, pagina, limite, totalPlayers, offset, modoCompacto } = options;
    
    let title = '🏆 Ranking ELO';
    let color = '#FFD700';
    
    if (rankFilter) {
        const rankNames = {
            'RANK_D': 'Rank D',
            'RANK_C': 'Rank C',
            'RANK_B': 'Rank B',
            'RANK_A': 'Rank A',
            'RANK_A_PLUS': 'Rank A+',
            'GRANDMASTER': 'Grandmaster'
        };
        title += ` - ${rankNames[rankFilter]}`;
        
        // Cores específicas por rank
        const rankColors = {
            'RANK_D': '#8B4513',
            'RANK_C': '#CD7F32',
            'RANK_B': '#C0C0C0',
            'RANK_A': '#FFD700',
            'RANK_A_PLUS': '#E5E4E2',
            'GRANDMASTER': '#FF1493'
        };
        color = rankColors[rankFilter] || '#FFD700';
    }
    
    // Embed principal com o ranking
    const rankingEmbed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setTimestamp();

    // Descrição com informações de paginação
    const totalPages = Math.ceil(totalPlayers / limite);
    let description = `**Página ${pagina} de ${totalPages}** | **Total: ${totalPlayers} jogadores**\n`;
    rankingEmbed.setDescription(description);

    // Lista dos jogadores
    let rankingText = '';
    for (let i = 0; i < players.length; i++) {
        const player = players[i];
        const position = offset + i + 1;
        const currentElo = player.eloData.currentElo;
        const rank = getEloRank(currentElo);
        
        // Tentar obter o membro da guild
        let displayName = `Usuário ${player._id}`;
        try {
            const member = await guild.members.fetch(player._id);
            displayName = member.displayName;
        } catch (error) {
            // Se não conseguir buscar o membro, usar ID
            displayName = `<@${player._id}>`;
        }

        // Medalhas para top 3
        let medal = '';
        if (position === 1) medal = '🥇';
        else if (position === 2) medal = '🥈';
        else if (position === 3) medal = '🥉';
        else medal = `**${position}.**`;

        if (modoCompacto) {
            // Formato compacto: tudo em uma linha
            let playerInfo = `${medal} ${rank.emoji} **${displayName}** • ${currentElo} ELO`;
            
            // Adicionar informações extras de forma compacta
            if (player.eloData.mvpCount > 0) {
                playerInfo += ` • 👑${player.eloData.mvpCount}`;
            }
            
            if (player.eloData.peakElo > currentElo) {
                playerInfo += ` • 📈${player.eloData.peakElo}`;
            }
            
            rankingText += `${playerInfo}\n`;
        } else {
            // Formato original (mais detalhado)
            rankingText += `${medal} ${rank.emoji} **${displayName}**\n`;
            rankingText += `   ${currentElo} ELO`;
            
            // Adicionar informações extras
            if (player.eloData.mvpCount > 0) {
                rankingText += ` | 👑 ${player.eloData.mvpCount} MVPs`;
            }
            
            if (player.eloData.peakElo > currentElo) {
                rankingText += ` | 📈 Peak: ${player.eloData.peakElo}`;
            }
            
            rankingText += '\n\n';
        }
    }

    rankingEmbed.addFields({
        name: '📋 Ranking',
        value: rankingText || 'Nenhum jogador encontrado',
        inline: false
    });

    // Footer com navegação
    let footerText = '';
    if (totalPages > 1) {
        footerText += `Use /ranking-elo pagina:${pagina + 1} para próxima página`;
        if (pagina > 1) {
            footerText = `Use /ranking-elo pagina:${pagina - 1} para página anterior | ${footerText}`;
        }
    }
    
    if (footerText) {
        rankingEmbed.setFooter({ text: footerText });
    }

    return rankingEmbed;
}

/**
 * Cria um embed com estatísticas gerais de distribuição de ranks
 */
async function createStatsEmbed(rankFilter) {
    const stats = await getRankingStats();
    const statsEmbed = new EmbedBuilder()
        .setColor('#4169E1')  // Cor azul royal para diferenciar do embed principal
        .setTitle('📊 Estatísticas de Ranking')
        .setDescription('Distribuição de jogadores por rank')
        .addFields(
            { name: '🔸 Rank D', value: `${stats.rankD} jogadores`, inline: true },
            { name: '🥉 Rank C', value: `${stats.rankC} jogadores`, inline: true },
            { name: '🥈 Rank B', value: `${stats.rankB} jogadores`, inline: true },
            { name: '🥇 Rank A', value: `${stats.rankA} jogadores`, inline: true },
            { name: '💎 Rank A+', value: `${stats.rankAPlus} jogadores`, inline: true },
            { name: '👑 Grandmaster', value: `${stats.grandmaster} jogadores`, inline: true }
        )
        .setTimestamp();
    
    return statsEmbed;
}

async function getRankingStats() {
    try {
        const db = getDatabaseInstance();
        
        const pipeline = [
            {
                $match: {
                    'eloData.currentElo': { $exists: true, $gte: ELO_CONFIG.MIN_ELO }
                }
            },
            {
                $group: {
                    _id: null,
                    rankD: {
                        $sum: {
                            $cond: [
                                { $and: [{ $gte: ['$eloData.currentElo', 0] }, { $lte: ['$eloData.currentElo', 299] }] },
                                1,
                                0
                            ]
                        }
                    },
                    rankC: {
                        $sum: {
                            $cond: [
                                { $and: [{ $gte: ['$eloData.currentElo', 300] }, { $lte: ['$eloData.currentElo', 699] }] },
                                1,
                                0
                            ]
                        }
                    },
                    rankB: {
                        $sum: {
                            $cond: [
                                { $and: [{ $gte: ['$eloData.currentElo', 700] }, { $lte: ['$eloData.currentElo', 999] }] },
                                1,
                                0
                            ]
                        }
                    },
                    rankA: {
                        $sum: {
                            $cond: [
                                { $and: [{ $gte: ['$eloData.currentElo', 1000] }, { $lte: ['$eloData.currentElo', 1499] }] },
                                1,
                                0
                            ]
                        }
                    },
                    rankAPlus: {
                        $sum: {
                            $cond: [
                                { $and: [{ $gte: ['$eloData.currentElo', 1500] }, { $lte: ['$eloData.currentElo', 1999] }] },
                                1,
                                0
                            ]
                        }
                    },
                    grandmaster: {
                        $sum: {
                            $cond: [
                                { $gte: ['$eloData.currentElo', 2000] },
                                1,
                                0
                            ]
                        }
                    }
                }
            }
        ];

        const result = await db.collection('user_profiles').aggregate(pipeline).toArray();
        
        if (result.length > 0) {
            return result[0];
        }
        
        return {
            rankD: 0,
            rankC: 0,
            rankB: 0,
            rankA: 0,
            rankAPlus: 0,
            grandmaster: 0
        };
    } catch (error) {
        console.error('Erro ao buscar estatísticas de ranking:', error);
        return {
            rankD: 0,
            rankC: 0,
            rankB: 0,
            rankA: 0,
            rankAPlus: 0,
            grandmaster: 0
        };
    }
}