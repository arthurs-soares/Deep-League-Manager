// commands/visualizar.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
// Importações DIRETAS dos módulos necessários (do handler principal)
const { loadAllGuilds, loadGuildByName } = require('../handlers/db/guildDb'); 
const { resolveDisplayColor } = require('../handlers/utils/constants'); 


module.exports = {
    data: new SlashCommandBuilder()
        .setName('visualizar')
        .setDescription('Visualiza o ranking de guildas ou o perfil de uma guilda específica.')
        .addStringOption(option =>
            option.setName('guilda')
                .setDescription('Nome da guilda para ver detalhes (deixe em branco para o ranking)')
                .setRequired(false)),

    async execute(interaction, client, globalConfig) {
        await interaction.deferReply();
        const guildNameToSearch = interaction.options.getString('guilda');

        if (!guildNameToSearch) {
            // --- MODO 1: RANKING DE TODAS AS GUILDAS ---
            const allGuilds = await loadAllGuilds();
            if (!allGuilds || allGuilds.length === 0) {
                return interaction.editReply({ content: '❌ Nenhuma guilda foi registrada no bot ainda.' });
            }

            // Lógica de ordenação - MAIS VITÓRIAS PARA MENOS VITÓRIAS, desempate por MENOS DERROTAS
            const sortedGuilds = allGuilds.sort((a, b) => {
                const winsA = a.score?.wins || 0;
                const winsB = b.score?.wins || 0;
                
                // Prioriza o número de vitórias (do maior para o menor)
                if (winsB !== winsA) {
                    return winsB - winsA;
                }
                
                // Em caso de empate no número de vitórias, desempata pela menor quantidade de derrotas
                const lossesA = a.score?.losses || 0;
                const lossesB = b.score?.losses || 0;
                return lossesA - lossesB; // Menos derrotas primeiro
            });

            const embed = new EmbedBuilder()
                .setTitle('🏆 Ranking de Guildas')
                .setColor(globalConfig.embedColor || '#FFC700') // Cores do ranking podem usar uma cor global padrão
                .setDescription('As guildas são classificadas pelo número de vitórias (e menos derrotas em caso de empate).\n\n' + 
                    sortedGuilds.map((guild, index) => {
                        let rankEmoji = `**${index + 1}º** `;
                        if (index === 0) rankEmoji = '🥇 '; else if (index === 1) rankEmoji = '🥈 '; else if (index === 2) rankEmoji = '🥉 ';
                        const wins = guild.score?.wins || 0;
                        const losses = guild.score?.losses || 0;
                        const totalGames = wins + losses; 
                        const winRate = totalGames > 0 ? Math.round((wins / (totalGames)) * 100) : 0;
                        const scoreInfo = totalGames > 0 ? `**${wins}V** / **${losses}D** (${winRate}%)` : '*Sem partidas*';
                        return `${rankEmoji} **${guild.name}**\n   └ 👑 <@${guild.leader.id}> • 📊 ${scoreInfo}`;
                    }).join('\n\n'))
                .setFooter({ text: `Total de ${allGuilds.length} guildas registradas.` })
                .setTimestamp();
            
            return await interaction.editReply({ embeds: [embed] });
        }

        // --- MODO 2: DETALHES DE UMA GUILDA ESPECÍFICA ---
        const guild = await loadGuildByName(guildNameToSearch);
        if (!guild) {
            return interaction.editReply({ content: `❌ Guilda "${guildNameToSearch}" não encontrada!`, flags: MessageFlags.Ephemeral });
        }

        const mainRosterCount = guild.mainRoster?.length || 0;
        const subRosterCount = guild.subRoster?.length || 0;
        const wins = guild.score?.wins || 0;
        const losses = guild.score?.losses || 0;
        const totalGames = wins + losses;
        const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
        let rosterStatus = '🔴 Incompleta';
        let rosterStatusEmoji = '❓';

        if (mainRosterCount >= 5) {
            rosterStatus = subRosterCount >= 5 ? '🟢 Completa (5/5 Main, 5/5 Sub)' : '🟡 Parcial (5/5 Main, <5 Sub)';
            rosterStatusEmoji = subRosterCount >=5 ? '✅' : '⚠️';
        } else {
            rosterStatus = `🔴 Incompleta (${mainRosterCount}/5 Main)`;
            rosterStatusEmoji = '❌';
        }
        
        const embedColor = resolveDisplayColor(guild.color, globalConfig);

        const embed = new EmbedBuilder()
            .setTitle(`🏰 ${guild.name}`)
            .setColor(embedColor);

        let descriptionText = guild.description ? `*${guild.description}*` : '*Esta guilda ainda não tem uma descrição.*';
        if(guild.link) descriptionText += `\n\n**[Visite o servidor da guilda](${guild.link})**`;
        if (guild.forumPostId && globalConfig.guildRosterForumChannelId) {
            descriptionText += `\n**📋 Ver Post no Fórum**`;
        }
        embed.setDescription(descriptionText);

        if (guild.logo) embed.setThumbnail(guild.logo);
        if (guild.banner) embed.setImage(guild.banner);

        embed.addFields(
            { name: '👑 Liderança', value: `**Líder:** <@${guild.leader.id}>\n**Vice:** ${guild.coLeader ? `<@${guild.coLeader.id}>` : '*Não Definido*'}`, inline: true },
            { name: '📊 Desempenho', value: `**Score:** ${wins}V / ${losses}D\n**Aproveitamento:** ${winRate}%`, inline: true },
            { name: `${rosterStatusEmoji} Status do Roster`, value: `${rosterStatus}`, inline: true }
        );
        const mainRosterText = mainRosterCount > 0 ? guild.mainRoster.map((p, i) => `> ${i + 1}. <@${p.id}>`).join('\n') : '> *Vazio*';
        const subRosterText = subRosterCount > 0 ? guild.subRoster.map((p, i) => `> ${i + 1}. <@${p.id}>`).join('\n') : '> *Vazio*';
        embed.addFields(
            { name: `🛡️ Roster Principal (${mainRosterCount > 5 ? '5+' : mainRosterCount}/5)`, value: mainRosterText, inline: true },
            { name: `⚔️ Roster Reserva (${subRosterCount > 5 ? '5+' : subRosterCount}/5)`, value: subRosterText, inline: true }
        );

        let footerText = `📅 Criada em: <t:${Math.floor(new Date(guild.createdAt).getTime() / 1000)}:D>`;
        if (guild.updatedAt && guild.updatedAt !== guild.createdAt) footerText += `\n🔄 Última atualização: <t:${Math.floor(new Date(guild.updatedAt).getTime() / 1000)}:R>`;
        embed.setFooter({ text: footerText });

        await interaction.editReply({ embeds: [embed] });
    },
};
