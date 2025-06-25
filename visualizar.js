const { SlashCommandBuilder, EmbedBuilder, InteractionResponseType } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('visualizar')
        .setDescription('Visualiza informações de uma guilda ou lista todas as guildas')
        .addStringOption(option =>
            option.setName('guilda')
                .setDescription('Nome da guilda para visualizar (deixe vazio para ver todas)')
                .setRequired(false)),

    async execute(interaction) {
        const guildName = interaction.options.getString('guilda');

        // Carregar dados das guildas
        const guildsPath = path.join(__dirname, '..', 'guilds.json');

        if (!fs.existsSync(guildsPath)) {
            return await interaction.reply({
                content: '❌ Nenhuma guilda foi registrada ainda!',
                flags: 64 // EPHEMERAL flag
            });
        }

        const guildsData = JSON.parse(fs.readFileSync(guildsPath, 'utf8'));
        const guilds = guildsData.guilds;

        // Se não há guildas registradas
        if (Object.keys(guilds).length === 0) {
            return await interaction.reply({
                content: '❌ Nenhuma guilda foi registrada ainda!',
                flags: 64 // EPHEMERAL flag
            });
        }

        // Se não especificou guilda, mostrar lista de todas
        if (!guildName) {
            // Ordenar guildas por win rate (melhor para pior)
            const sortedGuilds = Object.values(guilds).sort((a, b) => {
                // Calcular win rate para guilda A
                let winRateA = 0;
                if (a.score && (a.score.wins + a.score.losses) > 0) {
                    winRateA = (a.score.wins / (a.score.wins + a.score.losses)) * 100;
                }

                // Calcular win rate para guilda B
                let winRateB = 0;
                if (b.score && (b.score.wins + b.score.losses) > 0) {
                    winRateB = (b.score.wins / (b.score.wins + b.score.losses)) * 100;
                }

                // Ordenar por win rate (decrescente), guildas sem dados ficam por último
                if (winRateA === 0 && winRateB === 0) {
                    // Se ambas não têm dados, ordenar por nome
                    return a.name.localeCompare(b.name);
                }
                if (winRateA === 0) return 1; // A vai para o final
                if (winRateB === 0) return -1; // B vai para o final
                
                return winRateB - winRateA; // Decrescente (melhor primeiro)
            });

            const embed = new EmbedBuilder()
                .setTitle('🏆 Ranking das Guildas')
                .setColor('#FFD700')
                .setDescription('Guildas ordenadas por performance (melhor → pior):')
                .setFooter({ text: `Total: ${Object.keys(guilds).length} guilda(s) • Ordenado por taxa de vitória` })
                .setTimestamp();

            // Adicionar cada guilda como um field
            sortedGuilds.forEach((guild, index) => {
                const createdDate = new Date(guild.createdAt);
                const dateString = `<t:${Math.floor(createdDate.getTime() / 1000)}:R>`;

                // Informações de score e posição
                let scoreInfo = '*Sem dados*';
                let rankEmoji = '🔸';
                
                if (guild.score && (guild.score.wins + guild.score.losses) > 0) {
                    const totalGames = guild.score.wins + guild.score.losses;
                    const winRate = Math.round((guild.score.wins / totalGames) * 100);
                    scoreInfo = `${guild.score.wins}W/${guild.score.losses}L (${winRate}%)`;
                    
                    // Definir emoji baseado na posição
                    if (index === 0) rankEmoji = '🥇';
                    else if (index === 1) rankEmoji = '🥈';
                    else if (index === 2) rankEmoji = '🥉';
                    else if (winRate >= 70) rankEmoji = '🟢';
                    else if (winRate >= 50) rankEmoji = '🟡';
                    else rankEmoji = '🔴';
                } else {
                    rankEmoji = '⚪'; // Sem dados
                }

                embed.addFields({
                    name: `${rankEmoji} ${index + 1}º ${guild.name}`,
                    value: `👑 **Leader:** <@${guild.leader.id}>\n⭐ **Co-Leader:** <@${guild.coLeader.id}>\n📊 **Score:** ${scoreInfo}\n📅 **Criada:** ${dateString}`,
                    inline: true
                });
            });

            embed.addFields({
                name: '💡 Como usar',
                value: 'Use `/visualizar guilda: [nome]` para ver detalhes específicos de uma guilda.',
                inline: false
            });

            return await interaction.reply({ embeds: [embed] });
        }

        // Buscar guilda específica
        const guild = guilds[guildName.toLowerCase()];

        if (!guild) {
            // Sugerir guildas similares
            const availableGuilds = Object.values(guilds).map(g => g.name).join(', ');
            return await interaction.reply({
                content: `❌ Guilda "${guildName}" não encontrada!\n\n**Guildas disponíveis:** ${availableGuilds}`,
                flags: 64 // EPHEMERAL flag
            });
        }

        // DEBUG: Log da estrutura da guilda para verificar a logo
        console.log('🔍 Debug - Estrutura da guilda:', JSON.stringify(guild, null, 2));
        console.log('🔍 Debug - Logo da guilda:', guild.logo);

        // Calcular estatísticas primeiro
        const totalPlayers = (guild.mainRoster?.length || 0) + (guild.subRoster?.length || 0);
        const completionPercentage = Math.round((totalPlayers / 10) * 100);

        // Estatísticas de score
        let wins = 0, losses = 0, winRate = 0;
        if (guild.score) {
            wins = guild.score.wins;
            losses = guild.score.losses;
            const totalGames = wins + losses;
            winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
        }

        // Status da guilda
        let rosterStatus = '🔴 Incompleta';
        if (guild.mainRoster?.length >= 5) {
            rosterStatus = guild.subRoster?.length >= 5 ? '🟢 Completa' : '🟡 Parcialmente completa';
        }

        // Status de performance
        let performanceStatus = '⚪ Sem dados';
        if (guild.score && (wins + losses) > 0) {
            if (winRate >= 70) {
                performanceStatus = '🟢 Excelente';
            } else if (winRate >= 50) {
                performanceStatus = '🟡 Boa';
            } else {
                performanceStatus = '🔴 Precisa melhorar';
            }
        }

        // Criar embed detalhado da guilda
        const embed = new EmbedBuilder()
            .setTitle(`🏰 ${guild.name}`)
            .setColor(guild.color || '#FFD700')
            .addFields(
                // Linha 1: Informações básicas
                { name: '👑 Leader', value: `<@${guild.leader.id}>`, inline: true },
                { name: '⭐ Co-Leader', value: `<@${guild.coLeader.id}>`, inline: true },
                { name: '📅 Criada em', value: `<t:${Math.floor(new Date(guild.createdAt).getTime() / 1000)}:R>`, inline: true }
            );

        // Verificar e definir logo ANTES de adicionar outros campos
        if (guild.logo && guild.logo.trim() !== '') {
            console.log('✅ Logo encontrada, definindo thumbnail:', guild.logo);
            embed.setThumbnail(guild.logo);
        } else {
            console.log('❌ Logo não encontrada ou vazia');
        }

        // Rosters (lado a lado)
        const mainRosterText = guild.mainRoster && guild.mainRoster.length > 0 
            ? guild.mainRoster.map((player, index) => `${index + 1}. <@${player.id}>`).join('\n')
            : '*Não definido*';

        const subRosterText = guild.subRoster && guild.subRoster.length > 0 
            ? guild.subRoster.map((player, index) => `${index + 1}. <@${player.id}>`).join('\n')
            : '*Não definido*';

        embed.addFields(
            { name: '🛡️ Main Roster', value: mainRosterText, inline: true },
            { name: '⚔️ Sub Roster', value: subRosterText, inline: true },
            { name: '\u200B', value: '\u200B', inline: true } // Campo vazio para quebrar linha
        );

        // Estatísticas (3 colunas organizadas)
        embed.addFields(
            { 
                name: '📊 Estatísticas Gerais', 
                value: `**Jogadores:** ${totalPlayers}/10\n**Roster Completo:** ${completionPercentage}%`, 
                inline: true 
            },
            { 
                name: '🏆 Estatísticas de Combate', 
                value: guild.score ? `**Vitórias:** ${wins}\n**Derrotas:** ${losses}` : '*Sem dados*', 
                inline: true 
            },
            { 
                name: '🎯 Taxa de Vitória', 
                value: guild.score ? `${winRate}%` : 'N/A', 
                inline: true 
            }
        );

        // Status (2 colunas)
        embed.addFields(
            { name: '🎮 Status do Roster', value: rosterStatus, inline: true },
            { name: '📈 Performance', value: performanceStatus, inline: true },
            { name: '\u200B', value: '\u200B', inline: true } // Campo vazio para balancear
        );

        // Adicionar descrição se existir
        if (guild.description) {
            embed.addFields({ name: '📄 Descrição', value: guild.description, inline: false });
        }

        // Adicionar link se existir
        if (guild.link) {
            embed.addFields({ name: '🔗 Link', value: guild.link, inline: false });
        }

        // Informação sobre logo para debug
        if (guild.logo) {
            embed.addFields({ 
                name: '🖼️ Logo Status', 
                value: `Definida: ${guild.logo ? '✅' : '❌'}\nURL: ${guild.logo || 'N/A'}`, 
                inline: false 
            });
        }

        // Última atualização
        if (guild.updatedAt) {
            const updatedDate = `<t:${Math.floor(new Date(guild.updatedAt).getTime() / 1000)}:R>`;
            embed.addFields({ 
                name: '🔄 Última atualização', 
                value: `Por <@${guild.updatedBy}> • ${updatedDate}`, 
                inline: false 
            });
        }

        // Footer e timestamp
        embed.setFooter({ text: `Criada por ${guild.createdBy}` })
             .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        // Log no console
        if (guildName) {
            console.log(`👁️ Guilda "${guild.name}" visualizada por ${interaction.user.username} (${interaction.user.id})`);
        } else {
            console.log(`👁️ Lista de guildas visualizada por ${interaction.user.username} (${interaction.user.id})`);
        }
    },
};