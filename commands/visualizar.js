// commands/visualizar.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const { loadAllGuilds, loadGuildByName } = require('../handlers/db/guildDb');
const { loadAllTeams, loadTeamByName } = require('../handlers/db/teamDb');
const { resolveDisplayColor, MAX_ROSTER_SIZE, TEAM_MAX_ROSTER_SIZE } = require('../handlers/utils/constants');

const ITEMS_PER_PAGE = 10; // Usaremos isso para ambos os rankings

module.exports = {
    data: new SlashCommandBuilder()
        .setName('visualizar')
        .setDescription('Visualiza rankings ou o perfil de uma guilda/time específico.')
        .addStringOption(option => // Opção para ver perfil específico
            option.setName('nome')
                .setDescription('Nome da guilda ou time para ver detalhes (comece a digitar)')
                .setRequired(false)
                .setAutocomplete(true))
        .addStringOption(option => // Opção para escolher o tipo de ranking
            option.setName('tipo')
                .setDescription('Escolha qual ranking visualizar (se "nome" estiver vazio)')
                .setRequired(false)
                .addChoices(
                    { name: 'Guildas', value: 'guildas' },
                    { name: 'Times', value: 'times' }
                )),

    async execute(interaction, client, globalConfig) {
        await interaction.deferReply();
        const nameToSearch = interaction.options.getString('nome');
        const rankingType = interaction.options.getString('tipo');

        // --- MODO: VISUALIZAR PERFIL ESPECÍFICO (Guilda ou Time) ---
        if (nameToSearch) {
            let entity = await loadGuildByName(nameToSearch);
            let entityType = 'Guilda';

            if (!entity) {
                entity = await loadTeamByName(nameToSearch);
                entityType = 'Time';
            }

            if (!entity) {
                return interaction.editReply({ content: `❌ "${nameToSearch}" não encontrado como Guilda ou Time!`, flags: MessageFlags.Ephemeral });
            }

            const embedColor = resolveDisplayColor(entity.color, globalConfig);
            const detailEmbed = new EmbedBuilder()
                .setTitle(`${entityType === 'Guilda' ? '🏰' : '⚽'} ${entity.name}`)
                .setColor(embedColor)
                .setTimestamp();

            if (entity.logo) detailEmbed.setThumbnail(entity.logo);
            if (entityType === 'Guilda' && entity.banner) detailEmbed.setImage(entity.banner);

            let descriptionTextDetail = entityType === 'Guilda' ? (entity.description || '*Esta guilda ainda não tem uma descrição.*') : `Time liderado por <@${entity.leader.id}>.`;
            if (entityType === 'Guilda' && entity.link) descriptionTextDetail += `\n\n**[Visite o servidor da guilda](${entity.link})**`;
            if (entityType === 'Guilda' && entity.forumPostId && globalConfig.guildRosterForumChannelId) {
                descriptionTextDetail += `\n**[Ver Post no Fórum](https://discord.com/channels/${interaction.guild.id}/${globalConfig.guildRosterForumChannelId}/${entity.forumPostId})**`;
            }
            detailEmbed.setDescription(descriptionTextDetail);

            detailEmbed.addFields({ name: '👑 Líder', value: `<@${entity.leader.id}>`, inline: true });
            if (entityType === 'Guilda' && entity.coLeader) {
                detailEmbed.addFields({ name: '⭐ Vice-Líder', value: `<@${entity.coLeader.id}>`, inline: true });
            }
            detailEmbed.addFields({ name: '📊 Desempenho', value: `**Score:** ${entity.score?.wins || 0}V / ${entity.score?.losses || 0}D`, inline: true });

            if (entityType === 'Guilda') {
                const mainRosterCount = entity.mainRoster?.length || 0;
                const subRosterCount = entity.subRoster?.length || 0;
                let rosterStatus = '🔴 Incompleta';
                if (mainRosterCount >= MAX_ROSTER_SIZE) rosterStatus = (subRosterCount >= MAX_ROSTER_SIZE) ? '🟢 Completa' : '🟡 Parcial';

                detailEmbed.addFields({ name: '📋 Status do Roster', value: rosterStatus, inline: true });
                const mainRosterText = mainRosterCount > 0 ? entity.mainRoster.map((p, i) => `> ${i + 1}. <@${p.id}>`).join('\n') : '> *Vazio*';
                const subRosterText = subRosterCount > 0 ? entity.subRoster.map((p, i) => `> ${i + 1}. <@${p.id}>`).join('\n') : '> *Vazio*';
                detailEmbed.addFields(
                    { name: `🛡️ Roster Principal (${mainRosterCount > MAX_ROSTER_SIZE ? `${MAX_ROSTER_SIZE}+` : mainRosterCount}/${MAX_ROSTER_SIZE})`, value: mainRosterText, inline: true },
                    { name: `⚔️ Roster Reserva (${subRosterCount > MAX_ROSTER_SIZE ? `${MAX_ROSTER_SIZE}+` : subRosterCount}/${MAX_ROSTER_SIZE})`, value: subRosterText, inline: true }
                );
            } else { // Time
                const rosterCount = entity.roster?.length || 0;
                const rosterText = rosterCount > 0 ? entity.roster.map((p, i) => `> ${i + 1}. <@${p.id}>`).join('\n') : '> *Vazio*';
                detailEmbed.addFields({ name: `👥 Roster do Time (${rosterCount}/${TEAM_MAX_ROSTER_SIZE || 7})`, value: rosterText, inline: false });
            }

            let footerText = `📅 Criada em: <t:${Math.floor(new Date(entity.createdAt).getTime() / 1000)}:D>`;
            if (entity.updatedAt && entity.updatedAt !== entity.createdAt) footerText += `\n🔄 Última atualização: <t:${Math.floor(new Date(entity.updatedAt).getTime() / 1000)}:R>`;
            detailEmbed.setFooter({ text: footerText });

            return await interaction.editReply({ embeds: [detailEmbed] });
        }

        // --- MODO: VISUALIZAR RANKING (Guildas OU Times) ---
        // Se 'nome_entidade' está vazio, verificamos 'ranking_tipo'
        // Se 'ranking_tipo' também estiver vazio, padrão para ranking de guildas

        const typeToDisplay = rankingType || 'guildas'; // Padrão para guildas
        let dataArray, title, entityLabel, itemsPerPage, buttonPrefix;

        if (typeToDisplay === 'guildas') {
            dataArray = await loadAllGuilds();
            title = '🏆 Ranking de Guildas';
            entityLabel = 'Guilda';
            itemsPerPage = ITEMS_PER_PAGE; // Usando a constante global
            buttonPrefix = 'ranking_guilds';
        } else if (typeToDisplay === 'times') {
            dataArray = await loadAllTeams();
            title = '⚽ Ranking de Times';
            entityLabel = 'Time';
            itemsPerPage = ITEMS_PER_PAGE; // Pode ajustar se quiser diferente para times
            buttonPrefix = 'ranking_teams';
        } else {
            // Caso o valor de ranking_tipo seja inválido (não deve acontecer com choices)
            return interaction.editReply({ content: '❌ Tipo de ranking inválido selecionado.' });
        }

        if (!dataArray || dataArray.length === 0) {
            return interaction.editReply({ content: `❌ Nenhum(a) ${entityLabel.toLowerCase()}(s) registrado(a) ainda.` });
        }

        const sortedData = [...dataArray].sort((a, b) => { // Criar cópia para sort
            const winsA = a.score?.wins || 0;
            const winsB = b.score?.wins || 0;
            if (winsB !== winsA) return winsB - winsA;
            const lossesA = a.score?.losses || 0;
            const lossesB = b.score?.losses || 0;
            return lossesA - lossesB;
        });

        const totalPages = Math.ceil(sortedData.length / itemsPerPage);
        let currentPage = 0;

        const generateEmbed = (page) => {
            const startIndex = page * itemsPerPage;
            const currentItems = sortedData.slice(startIndex, startIndex + itemsPerPage);

            const description = currentItems.map((item, index) => {
                const globalIndex = startIndex + index;
                let rankEmoji = `**${globalIndex + 1}º** `;
                if (globalIndex === 0) rankEmoji = entityLabel === 'Guilda' ? '🥇 ' : '🏆 ';
                else if (globalIndex === 1) rankEmoji = entityLabel === 'Guilda' ? '🥈 ' : '🏅 ';
                else if (globalIndex === 2) rankEmoji = entityLabel === 'Guilda' ? '🥉 ' : '🎖️ ';

                const wins = item.score?.wins || 0;
                const losses = item.score?.losses || 0;
                const totalGames = wins + losses;
                const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
                const scoreInfo = totalGames > 0 ? `**${wins}V** / **${losses}D** (${winRate}%)` : '*Sem partidas*';
                const leaderInfo = item.leader ? `<@${item.leader.id}>` : '*Líder não definido*';
                return `${rankEmoji} **${item.name}** (${entityLabel})\n   └ 👑 ${leaderInfo} • 📊 ${scoreInfo}`;
            }).join('\n\n') || `*Nenhum(a) ${entityLabel.toLowerCase()}(s) nesta página.*`;

            return new EmbedBuilder()
                .setTitle(title)
                .setColor(globalConfig.embedColor || '#FFC700')
                .setDescription(`Os ${entityLabel.toLowerCase()}s são classificados pelo número de vitórias (e menos derrotas em caso de empate).\n\n` + description)
                .setFooter({ text: `Página ${page + 1} de ${totalPages} • Total de ${sortedData.length} ${entityLabel.toLowerCase()}(s)` })
                .setTimestamp();
        };

        const generateButtons = (page) => {
            return new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`${buttonPrefix}_prev`)
                        .setLabel('⬅️ Anterior')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId(`${buttonPrefix}_next`)
                        .setLabel('Próxima ➡️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page >= totalPages - 1)
                );
        };

        const initialEmbed = generateEmbed(currentPage);
        const initialButtons = totalPages > 1 ? [generateButtons(currentPage)] : [];
        const message = await interaction.editReply({ embeds: [initialEmbed], components: initialButtons });

        if (totalPages <= 1) return;

        const filter = i => (i.customId === `${buttonPrefix}_prev` || i.customId === `${buttonPrefix}_next`) && i.user.id === interaction.user.id;
        const collector = message.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time: 180000 }); // 3 minutos

        collector.on('collect', async i => {
            try {
                await i.deferUpdate();
                if (i.customId === `${buttonPrefix}_prev`) currentPage--;
                else if (i.customId === `${buttonPrefix}_next`) currentPage++;

                await message.edit({ embeds: [generateEmbed(currentPage)], components: [generateButtons(currentPage)] });
            } catch (error) {
                console.error(`Error during pagination collection for ${i.customId}:`, error);
                await i.followUp({ content: '❌ Ocorreu um erro ao processar sua solicitação de página.', ephemeral: true }).catch(console.error);
            }
        });

        collector.on('end', async (collected, reason) => {
            try {
                // Only edit if the message still exists and the reason is not 'messageDelete' or 'channelDelete'
                if (message && message.editable && reason !== 'messageDelete' && reason !== 'channelDelete') {
                    await message.edit({ embeds: [generateEmbed(currentPage)], components: [] });
                }
            } catch (error) {
                console.error('Error ending pagination collector:', error);
            }
        });
    },

    async autocomplete(interaction, client, globalConfig) {
        const focusedOption = interaction.options.getFocused(true);
        // O autocomplete agora só faz sentido para 'nome_entidade'
        if (focusedOption.name === 'nome') {
            const focusedValue = focusedOption.value.toLowerCase();
            const guilds = await loadAllGuilds();
            const teams = await loadAllTeams();

            const filteredGuilds = guilds
                .filter(guild => guild.name.toLowerCase().includes(focusedValue))
                .map(guild => ({ name: `${guild.name} (Guilda)`, value: guild.name }));

            const filteredTeams = teams
                .filter(team => team.name.toLowerCase().includes(focusedValue))
                .map(team => ({ name: `${team.name} (Time)`, value: team.name }));
            
            let combinedResults = [...filteredGuilds, ...filteredTeams];
            combinedResults.sort((a,b) => a.name.localeCompare(b.name));
            
            await interaction.respond(combinedResults.slice(0, 25));
        }
    }
};
