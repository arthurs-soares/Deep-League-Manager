// commands/visualizar.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js'); // Adicionado ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType
const { loadAllGuilds, loadGuildByName } = require('../handlers/db/guildDb');
const { resolveDisplayColor } = require('../handlers/utils/constants');

const ITEMS_PER_PAGE = 10; // Define quantas guildas por página

module.exports = {
    data: new SlashCommandBuilder()
        .setName('visualizar')
        .setDescription('Visualiza o ranking de guildas ou o perfil de uma guilda específica.')
        .addStringOption(option =>
            option.setName('guilda')
                .setDescription('Nome da guilda para ver detalhes (comece a digitar para ver sugestões)')
                .setRequired(false)
                .setAutocomplete(true)),

    async execute(interaction, client, globalConfig) {
        await interaction.deferReply();
        const guildNameToSearch = interaction.options.getString('guilda');

        if (!guildNameToSearch) {
            // MODO RANKING COM PAGINAÇÃO
            const allGuilds = await loadAllGuilds();
            if (!allGuilds || allGuilds.length === 0) {
                return interaction.editReply({ content: '❌ Nenhuma guilda foi registrada no bot ainda.' });
            }

            const sortedGuilds = allGuilds.sort((a, b) => {
                const winsA = a.score?.wins || 0;
                const winsB = b.score?.wins || 0;
                if (winsB !== winsA) return winsB - winsA;
                const lossesA = a.score?.losses || 0;
                const lossesB = b.score?.losses || 0;
                return lossesA - lossesB;
            });

            const totalPages = Math.ceil(sortedGuilds.length / ITEMS_PER_PAGE);
            let currentPage = 0;

            const generateEmbed = (page) => {
                const startIndex = page * ITEMS_PER_PAGE;
                const endIndex = startIndex + ITEMS_PER_PAGE;
                const currentGuilds = sortedGuilds.slice(startIndex, endIndex);

                const description = currentGuilds.map((guild, index) => {
                    const globalIndex = startIndex + index; // Índice global no ranking
                    let rankEmoji = `**${globalIndex + 1}º** `;
                    if (globalIndex === 0) rankEmoji = '🥇 ';
                    else if (globalIndex === 1) rankEmoji = '🥈 ';
                    else if (globalIndex === 2) rankEmoji = '🥉 ';

                    const wins = guild.score?.wins || 0;
                    const losses = guild.score?.losses || 0;
                    const totalGames = wins + losses;
                    const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
                    const scoreInfo = totalGames > 0 ? `**${wins}V** / **${losses}D** (${winRate}%)` : '*Sem partidas*';
                    return `${rankEmoji} **${guild.name}**\n   └ 👑 <@${guild.leader.id}> • 📊 ${scoreInfo}`;
                }).join('\n\n') || 'Nenhuma guilda nesta página.';

                return new EmbedBuilder()
                    .setTitle('🏆 Ranking de Guildas')
                    .setColor(globalConfig.embedColor || '#FFC700')
                    .setDescription('As guildas são classificadas pelo número de vitórias (e menos derrotas em caso de empate).\n\n' + description)
                    .setFooter({ text: `Página ${page + 1} de ${totalPages} • Total de ${allGuilds.length} guildas` })
                    .setTimestamp();
            };

            const generateButtons = (page) => {
                return new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('ranking_prev')
                            .setLabel('⬅️ Anterior')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(page === 0),
                        new ButtonBuilder()
                            .setCustomId('ranking_next')
                            .setLabel('Próxima ➡️')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(page >= totalPages - 1)
                    );
            };

            const initialEmbed = generateEmbed(currentPage);
            const initialButtons = generateButtons(currentPage);

            const message = await interaction.editReply({
                embeds: [initialEmbed],
                components: totalPages > 1 ? [initialButtons] : [] // Só mostra botões se houver mais de uma página
            });

            if (totalPages <= 1) return; // Não precisa de coletor se for apenas uma página

            const filter = i => (i.customId === 'ranking_prev' || i.customId === 'ranking_next') && i.user.id === interaction.user.id;
            const collector = message.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time: 120000 }); // Coletor por 2 minutos

            collector.on('collect', async i => {
                await i.deferUpdate(); // Acknowledge o clique no botão

                if (i.customId === 'ranking_prev') {
                    currentPage--;
                } else if (i.customId === 'ranking_next') {
                    currentPage++;
                }

                const newEmbed = generateEmbed(currentPage);
                const newButtons = generateButtons(currentPage);
                await i.editReply({ embeds: [newEmbed], components: [newButtons] });
            });

            collector.on('end', async collected => {
                // Remove os botões após o coletor expirar ou ser parado
                const finalEmbed = generateEmbed(currentPage); // Gera o embed da última página visualizada
                await message.edit({ embeds: [finalEmbed], components: [] }).catch(console.error);
            });

            return; // Retorna para não executar o código de visualização de guilda individual
        }

        // MODO DETALHES DE GUILDA (código existente, sem alterações)
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
        if (mainRosterCount >= globalConfig.MAX_ROSTER_SIZE_MAIN || MAX_ROSTER_SIZE) rosterStatus = (subRosterCount >= globalConfig.MAX_ROSTER_SIZE_SUB || MAX_ROSTER_SIZE) ? '🟢 Completa' : '🟡 Parcial';


        const embedColor = resolveDisplayColor(guild.color, globalConfig);
        const embed = new EmbedBuilder()
            .setTitle(`🏰 ${guild.name}`)
            .setColor(embedColor);

        let descriptionText = guild.description ? `*${guild.description}*` : '*Esta guilda ainda não tem uma descrição.*';
        if(guild.link) descriptionText += `\n\n**[Visite o servidor da guilda](${guild.link})**`;
        if (guild.forumPostId && globalConfig.guildRosterForumChannelId) {
            descriptionText += `\n**[Ver Post no Fórum](https://discord.com/channels/${interaction.guild.id}/${globalConfig.guildRosterForumChannelId}/${guild.forumPostId})**`;
        }
        embed.setDescription(descriptionText);

        if (guild.logo) embed.setThumbnail(guild.logo);
        if (guild.banner) embed.setImage(guild.banner);

        embed.addFields(
            { name: '👑 Liderança', value: `**Líder:** <@${guild.leader.id}>\n**Vice:** ${guild.coLeader ? `<@${guild.coLeader.id}>` : '*Não Definido*'}`, inline: true },
            { name: '📊 Desempenho', value: `**Score:** ${wins}V / ${losses}D\n**Aproveitamento:** ${winRate}%`, inline: true },
            { name: '📋 Status do Roster', value: `${rosterStatus}`, inline: true }
        );
        const mainRosterText = mainRosterCount > 0 ? guild.mainRoster.map((p, i) => `> ${i + 1}. <@${p.id}>`).join('\n') : '> *Vazio*';
        const subRosterText = subRosterCount > 0 ? guild.subRoster.map((p, i) => `> ${i + 1}. <@${p.id}>`).join('\n') : '> *Vazio*';
        embed.addFields(
            { name: `🛡️ Roster Principal (${mainRosterCount > (globalConfig.MAX_ROSTER_SIZE_MAIN || MAX_ROSTER_SIZE) ? `${(globalConfig.MAX_ROSTER_SIZE_MAIN || MAX_ROSTER_SIZE)}+` : mainRosterCount}/${(globalConfig.MAX_ROSTER_SIZE_MAIN || MAX_ROSTER_SIZE)})`, value: mainRosterText, inline: true },
            { name: `⚔️ Roster Reserva (${subRosterCount > (globalConfig.MAX_ROSTER_SIZE_SUB || MAX_ROSTER_SIZE) ? `${(globalConfig.MAX_ROSTER_SIZE_SUB || MAX_ROSTER_SIZE)}+` : subRosterCount}/${(globalConfig.MAX_ROSTER_SIZE_SUB || MAX_ROSTER_SIZE)})`, value: subRosterText, inline: true }
        );
        

        let footerText = `📅 Criada em: <t:${Math.floor(new Date(guild.createdAt).getTime() / 1000)}:D>`;
        if (guild.updatedAt && guild.updatedAt !== guild.createdAt) footerText += `\n🔄 Última atualização: <t:${Math.floor(new Date(guild.updatedAt).getTime() / 1000)}:R>`;
        embed.setFooter({ text: footerText });

        await interaction.editReply({ embeds: [embed] });
    },

    // Adicione a função autocomplete aqui também, se ainda não tiver
    async autocomplete(interaction, client, globalConfig) {
        const focusedOption = interaction.options.getFocused(true);
        if (focusedOption.name === 'guilda') {
            await client.guildPanelHandlers.autocompleteGuilds(interaction);
        }
    }
};