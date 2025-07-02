 // commands/elo-partida.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { loadUserProfile } = require('../handlers/db/userProfileDb');
const { loadGuildByName } = require('../handlers/db/guildDb');
const { loadTeamByName } = require('../handlers/db/teamDb');
const { processMatchResult, processTeamElo, processWagerResult } = require('../handlers/elo/eloManager');
const { hasEloPermission, validateUserForElo } = require('../handlers/elo/eloValidation');
const { formatRankDisplay } = require('../handlers/elo/eloRanks');
const { MATCH_RESULTS } = require('../utils/eloConstants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('elo-partida')
        .setDescription('Processar resultado de partida para ELO (Score Operators)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('finalizar')
                .setDescription('Finalizar partida e calcular ELO')
                .addStringOption(option =>
                    option.setName('resultado')
                        .setDescription('Resultado da partida')
                        .setRequired(true)
                        .addChoices(
                            { name: '2-0 (Vitória Flawless)', value: '2-0' },
                            { name: '2-1 (Vitória Normal)', value: '2-1' },
                            { name: '1-2 (Derrota Normal)', value: '1-2' },
                            { name: '0-2 (Derrota Flawless)', value: '0-2' }
                        ))
                .addStringOption(option =>
                    option.setName('time_vencedor')
                        .setDescription('Nome do time/guilda vencedor')
                        .setRequired(true))
                .addUserOption(option =>
                    option.setName('mvp_vencedor')
                        .setDescription('MVP do time vencedor')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('time_perdedor')
                        .setDescription('Nome do time/guilda perdedor')
                        .setRequired(true))
                .addUserOption(option =>
                    option.setName('mvp_perdedor')
                        .setDescription('MVP do time perdedor')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('modo_distribuicao')
                        .setDescription('Como distribuir os pontos')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Time completo', value: 'full_team' },
                            { name: 'Jogadores específicos', value: 'specific_players' }
                        ))
                .addStringOption(option =>
                    option.setName('thread_id')
                        .setDescription('ID da thread da partida (opcional)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('wager')
                .setDescription('Processar resultado de um 1v1 wager')
                .addUserOption(option =>
                    option.setName('vencedor')
                        .setDescription('Jogador vencedor')
                        .setRequired(true))
                .addUserOption(option =>
                    option.setName('perdedor')
                        .setDescription('Jogador perdedor')
                        .setRequired(true))
                .addBooleanOption(option =>
                    option.setName('wipe')
                        .setDescription('Foi um wipe completo?')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('guild_name')
                        .setDescription('Nome da guilda (opcional)')
                        .setRequired(false))),

    async execute(interaction, client, globalConfig) {
        await interaction.deferReply();

        const member = interaction.guild.members.cache.get(interaction.user.id);

        // Verificar permissões
        if (!hasEloPermission(member, globalConfig)) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Sem Permissão')
                    .setDescription('Você não tem permissão para processar partidas de ELO. Apenas Score Operators podem usar este comando.')
                    .setTimestamp()]
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'finalizar') {
            await handleFinalizeMatch(interaction, client, globalConfig);
        } else if (subcommand === 'wager') {
            await handleWager(interaction, client, globalConfig);
        }
    },
};

async function handleFinalizeMatch(interaction, client, globalConfig) {
    try {
        // Obter parâmetros
        const resultado = interaction.options.getString('resultado');
        const timeVencedor = interaction.options.getString('time_vencedor');
        const mvpVencedor = interaction.options.getUser('mvp_vencedor');
        const timePerdedor = interaction.options.getString('time_perdedor');
        const mvpPerdedor = interaction.options.getUser('mvp_perdedor');
        const modoDistribuicao = interaction.options.getString('modo_distribuicao');
        const threadId = interaction.options.getString('thread_id');

        // Validar usuários MVP
        const mvpVencedorValidation = validateUserForElo(mvpVencedor, interaction.guild);
        if (!mvpVencedorValidation.isValid) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ MVP Vencedor Inválido')
                    .setDescription(mvpVencedorValidation.error)
                    .setTimestamp()]
            });
        }

        const mvpPerdedorValidation = validateUserForElo(mvpPerdedor, interaction.guild);
        if (!mvpPerdedorValidation.isValid) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ MVP Perdedor Inválido')
                    .setDescription(mvpPerdedorValidation.error)
                    .setTimestamp()]
            });
        }

        // Validar se MVPs são diferentes
        if (mvpVencedor.id === mvpPerdedor.id) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Erro')
                    .setDescription('MVP do time vencedor e perdedor não podem ser a mesma pessoa.')
                    .setTimestamp()]
            });
        }

        // Buscar dados dos times/guildas
        const { winnerData, loserData } = await getTeamsData(timeVencedor, timePerdedor);

        if (!winnerData && !loserData) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Times Não Encontrados')
                    .setDescription('Nenhum dos times/guildas foi encontrado no banco de dados. Certifique-se de que os nomes estão corretos.')
                    .setTimestamp()]
            });
        }

        // Preparar dados da partida
        const matchData = {
            result: resultado,
            winnerTeam: timeVencedor,
            winnerMvp: mvpVencedor.id,
            winnerPlayers: winnerData ? extractPlayersFromTeam(winnerData) : [{ userId: mvpVencedor.id }],
            loserTeam: timePerdedor,
            loserMvp: mvpPerdedor.id,
            loserPlayers: loserData ? extractPlayersFromTeam(loserData) : [{ userId: mvpPerdedor.id }],
            threadId: threadId
        };

        // Se modo de distribuição for jogadores específicos, mostrar seletor de jogadores
        if (modoDistribuicao === 'specific_players') {
            // Criar um modal para selecionar jogadores
            const modal = new ModalBuilder()
                .setCustomId('select_players_modal')
                .setTitle('Selecionar Jogadores');
                
            // Adicionar campos para IDs dos jogadores (separados por vírgula)
            const winnerPlayersInput = new TextInputBuilder()
                .setCustomId('winner_players')
                .setLabel('IDs dos jogadores vencedores (separados por vírgula)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);
                
            const loserPlayersInput = new TextInputBuilder()
                .setCustomId('loser_players')
                .setLabel('IDs dos jogadores perdedores (separados por vírgula)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);
                
            // Adicionar campos ao modal
            modal.addComponents(
                new ActionRowBuilder().addComponents(winnerPlayersInput),
                new ActionRowBuilder().addComponents(loserPlayersInput)
            );
            
            // Mostrar modal
            await interaction.showModal(modal);
            
            // Aguardar resposta do modal
            const modalResponse = await interaction.awaitModalSubmit({
                filter: i => i.customId === 'select_players_modal',
                time: 120000
            });
            
            // Processar IDs dos jogadores
            const winnerPlayerIds = modalResponse.fields.getTextInputValue('winner_players')
                .split(',').map(id => id.trim());
                
            const loserPlayerIds = modalResponse.fields.getTextInputValue('loser_players')
                .split(',').map(id => id.trim());
                
            // Modificar matchData para incluir apenas jogadores específicos
            matchData.specificPlayerIds = {
                winners: winnerPlayerIds,
                losers: loserPlayerIds
            };
            
            // Atualizar a resposta após o modal
            await modalResponse.deferUpdate();
        }

        // Mostrar preview e confirmação
        const previewEmbed = await createMatchPreview(matchData, winnerData, loserData);
        const confirmButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`confirm_match_${Date.now()}`)
                    .setLabel('✅ Confirmar e Processar')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`cancel_match_${Date.now()}`)
                    .setLabel('❌ Cancelar')
                    .setStyle(ButtonStyle.Danger)
            );

        const response = await interaction.editReply({
            embeds: [previewEmbed],
            components: [confirmButtons]
        });

        // Aguardar confirmação
        try {
            const confirmation = await response.awaitMessageComponent({
                filter: i => i.user.id === interaction.user.id,
                time: 60000
            });

            if (confirmation.customId.startsWith('confirm_match')) {
                await confirmation.deferUpdate();
                
                // Processar partida com jogadores específicos se necessário
                let result;
                
                if (modoDistribuicao === 'specific_players' && matchData.specificPlayerIds) {
                    // Criar objeto de resultados
                    result = {
                        success: true,
                        matchId: matchData.threadId || `match_${Date.now()}`,
                        updates: [],
                        errors: []
                    };
                    
                    // Processar time vencedor com jogadores específicos
                    const winnerResults = await processTeamElo({
                        players: matchData.winnerPlayers,
                        mvpUserId: matchData.winnerMvp,
                        isWinnerTeam: true,
                        matchResult: matchData.result,
                        guildName: matchData.winnerTeam,
                        matchId: result.matchId,
                        operatorId: interaction.user.id,
                        specificPlayerIds: matchData.specificPlayerIds.winners
                    });
                    
                    // Processar time perdedor com jogadores específicos
                    const loserResults = await processTeamElo({
                        players: matchData.loserPlayers,
                        mvpUserId: matchData.loserMvp,
                        isWinnerTeam: false,
                        matchResult: matchData.result,
                        guildName: matchData.loserTeam,
                        matchId: result.matchId,
                        operatorId: interaction.user.id,
                        specificPlayerIds: matchData.specificPlayerIds.losers
                    });
                    
                    // Combinar resultados
                    result.updates.push(...winnerResults.updates, ...loserResults.updates);
                    result.errors.push(...winnerResults.errors, ...loserResults.errors);
                } else {
                    // Processar normalmente com todos os jogadores
                    result = await processMatchResult(matchData, interaction.user.id);
                }
                
                if (result.success) {
                    const successEmbed = await createSuccessEmbed(result, matchData);
                    await confirmation.editReply({
                        embeds: [successEmbed],
                        components: []
                    });
                } else {
                    await confirmation.editReply({
                        embeds: [new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('❌ Erro no Processamento')
                            .setDescription(`Falha ao processar partida:\n${result.errors?.join('\n') || result.error || 'Erro desconhecido'}`)
                            .setTimestamp()],
                        components: []
                    });
                }
            } else {
                await confirmation.update({
                    embeds: [new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle('🚫 Partida Cancelada')
                        .setDescription('O processamento da partida foi cancelado.')
                        .setTimestamp()],
                    components: []
                });
            }
        } catch (error) {
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('⏱️ Tempo Esgotado')
                    .setDescription('Tempo para confirmação esgotado. Tente novamente.')
                    .setTimestamp()],
                components: []
            });
        }

    } catch (error) {
        console.error('Erro ao finalizar partida:', error);
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription('Ocorreu um erro interno. Tente novamente.')
                .setTimestamp()]
        });
    }
}

async function getTeamsData(winnerName, loserName) {
    let winnerData = null;
    let loserData = null;

    try {
        // Tentar buscar como guilda primeiro
        winnerData = await loadGuildByName(winnerName);
        if (!winnerData) {
            // Se não encontrou como guilda, tentar como time
            winnerData = await loadTeamByName(winnerName);
        }
    } catch (error) {
        console.warn(`Não foi possível encontrar time/guilda vencedor: ${winnerName}`);
    }

    try {
        // Tentar buscar como guilda primeiro
        loserData = await loadGuildByName(loserName);
        if (!loserData) {
            // Se não encontrou como guilda, tentar como time
            loserData = await loadTeamByName(loserName);
        }
    } catch (error) {
        console.warn(`Não foi possível encontrar time/guilda perdedor: ${loserName}`);
    }

    return { winnerData, loserData };
}

function extractPlayersFromTeam(teamData) {
    const players = [];
    
    if (teamData.leader?.id) {
        players.push({ userId: teamData.leader.id });
    }
    
    if (teamData.coLeader?.id) {
        players.push({ userId: teamData.coLeader.id });
    }
    
    if (teamData.mainRoster) {
        teamData.mainRoster.forEach(member => {
            if (member.id && !players.find(p => p.userId === member.id)) {
                players.push({ userId: member.id });
            }
        });
    }
    
    if (teamData.subRoster) {
        teamData.subRoster.forEach(member => {
            if (member.id && !players.find(p => p.userId === member.id)) {
                players.push({ userId: member.id });
            }
        });
    }
    
    // Se é um time, pode ter apenas roster
    if (teamData.roster) {
        teamData.roster.forEach(member => {
            if (member.id && !players.find(p => p.userId === member.id)) {
                players.push({ userId: member.id });
            }
        });
    }
    
    return players;
}

async function createMatchPreview(matchData, winnerData, loserData) {
    const isFlawless = matchData.result === '2-0' || matchData.result === '0-2';
    const flawlessText = isFlawless ? ' (FLAWLESS)' : '';
    
    let color = '#0099FF';
    if (matchData.result === '2-0') color = '#00FF00';
    else if (matchData.result === '0-2') color = '#FF0000';
    
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`🏆 Preview da Partida${flawlessText}`)
        .setDescription(`**Resultado:** ${matchData.result}\n**Match ID:** ${matchData.threadId || 'Gerado automaticamente'}`)
        .addFields(
            {
                name: '🥇 Time Vencedor',
                value: `**${matchData.winnerTeam}**\n👑 MVP: <@${matchData.winnerMvp}>\n👥 Jogadores: ${matchData.winnerPlayers.length}`,
                inline: true
            },
            {
                name: '🥈 Time Perdedor',
                value: `**${matchData.loserTeam}**\n⭐ MVP: <@${matchData.loserMvp}>\n👥 Jogadores: ${matchData.loserPlayers.length}`,
                inline: true
            }
        )
        .setFooter({ text: 'Confirme para processar os ELOs da partida' })
        .setTimestamp();

    return embed;
}

async function createSuccessEmbed(result, matchData) {
    const isFlawless = matchData.result === '2-0' || matchData.result === '0-2';
    const flawlessText = isFlawless ? ' FLAWLESS' : '';
    
    let color = '#00FF00';
    if (matchData.result === '2-0') color = '#FFD700';
    
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`✅ Partida${flawlessText} Processada!`)
        .setDescription(`**${matchData.winnerTeam}** ${matchData.result} **${matchData.loserTeam}**`)
        .addFields(
            {
                name: '📊 Resumo',
                value: `**Jogadores Atualizados:** ${result.updates.length}\n**Erros:** ${result.errors.length}\n**Match ID:** ${result.matchId}`,
                inline: false
            }
        )
        .setTimestamp();

    // Mostrar mudanças principais (MVPs)
    let mvpChanges = '';
    const mvpWinner = result.updates.find(u => u.userId === matchData.winnerMvp);
    const mvpLoser = result.updates.find(u => u.userId === matchData.loserMvp);

    if (mvpWinner) {
        const changeStr = mvpWinner.eloChange > 0 ? `+${mvpWinner.eloChange}` : `${mvpWinner.eloChange}`;
        mvpChanges += `👑 <@${mvpWinner.userId}>: **${changeStr}** (${mvpWinner.oldElo} → ${mvpWinner.newElo})\n`;
        if (mvpWinner.rankChange.changed) {
            mvpChanges += `${mvpWinner.rankChange.message}\n`;
        }
    }

    if (mvpLoser) {
        const changeStr = mvpLoser.eloChange > 0 ? `+${mvpLoser.eloChange}` : `${mvpLoser.eloChange}`;
        mvpChanges += `⭐ <@${mvpLoser.userId}>: **${changeStr}** (${mvpLoser.oldElo} → ${mvpLoser.newElo})\n`;
        if (mvpLoser.rankChange.changed) {
            mvpChanges += `${mvpLoser.rankChange.message}\n`;
        }
    }

    if (mvpChanges) {
        embed.addFields({ name: '🏅 Mudanças dos MVPs', value: mvpChanges, inline: false });
    }

    // Mostrar outros jogadores (resumido)
    const otherPlayers = result.updates.filter(u => u.userId !== matchData.winnerMvp && u.userId !== matchData.loserMvp);
    if (otherPlayers.length > 0) {
        let otherChanges = '';
        otherPlayers.slice(0, 8).forEach(player => { // Limitar a 8 para não ficar muito longo
            const changeStr = player.eloChange > 0 ? `+${player.eloChange}` : `${player.eloChange}`;
            otherChanges += `<@${player.userId}>: **${changeStr}**\n`;
        });
        
        if (otherPlayers.length > 8) {
            otherChanges += `... e mais ${otherPlayers.length - 8} jogadores`;
        }
        
        embed.addFields({ name: '👥 Outros Jogadores', value: otherChanges, inline: false });
    }

    // Mostrar erros se houver
    if (result.errors.length > 0) {
        const errorText = result.errors.slice(0, 3).join('\n');
        embed.addFields({ name: '⚠️ Avisos', value: errorText, inline: false });
    }

    return embed;
}

/**
 * Processa um wager (1v1)
 * @param {Object} interaction - Interação do Discord
 * @param {Object} client - Cliente do Discord
 * @param {Object} globalConfig - Configuração global
 */
async function handleWager(interaction, client, globalConfig) {
    try {
        // Obter parâmetros
        const vencedor = interaction.options.getUser('vencedor');
        const perdedor = interaction.options.getUser('perdedor');
        const isWipe = interaction.options.getBoolean('wipe');
        const guildName = interaction.options.getString('guild_name');
        
        // Validar usuários
        const vencedorValidation = validateUserForElo(vencedor, interaction.guild);
        if (!vencedorValidation.isValid) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Vencedor Inválido')
                    .setDescription(vencedorValidation.error)
                    .setTimestamp()]
            });
        }
        
        const perdedorValidation = validateUserForElo(perdedor, interaction.guild);
        if (!perdedorValidation.isValid) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Perdedor Inválido')
                    .setDescription(perdedorValidation.error)
                    .setTimestamp()]
            });
        }
        
        // Validar se são pessoas diferentes
        if (vencedor.id === perdedor.id) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Erro')
                    .setDescription('Vencedor e perdedor não podem ser a mesma pessoa.')
                    .setTimestamp()]
            });
        }
        
        // Preparar dados do wager
        const wagerData = {
            winnerId: vencedor.id,
            loserId: perdedor.id,
            isWipe: isWipe,
            guildName: guildName
        };
        
        // Mostrar preview e confirmação
        const previewEmbed = createWagerPreview(wagerData, vencedor, perdedor, isWipe);
        const confirmButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`confirm_wager_${Date.now()}`)
                    .setLabel('✅ Confirmar e Processar')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`cancel_wager_${Date.now()}`)
                    .setLabel('❌ Cancelar')
                    .setStyle(ButtonStyle.Danger)
            );
        
        const response = await interaction.editReply({
            embeds: [previewEmbed],
            components: [confirmButtons]
        });
        
        // Aguardar confirmação
        try {
            const confirmation = await response.awaitMessageComponent({
                filter: i => i.user.id === interaction.user.id,
                time: 60000
            });
            
            if (confirmation.customId.startsWith('confirm_wager')) {
                await confirmation.deferUpdate();
                
                // Processar wager
                const result = await processWagerResult(wagerData, interaction.user.id);
                
                if (result.success) {
                    const successEmbed = createWagerSuccessEmbed(result, wagerData, vencedor, perdedor);
                    await confirmation.editReply({
                        embeds: [successEmbed],
                        components: []
                    });
                } else {
                    await confirmation.editReply({
                        embeds: [new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('❌ Erro no Processamento')
                            .setDescription(`Falha ao processar wager:\n${result.errors?.join('\n') || result.error || 'Erro desconhecido'}`)
                            .setTimestamp()],
                        components: []
                    });
                }
            } else {
                // Cancelar
                await confirmation.update({
                    embeds: [new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle('🚫 Wager Cancelado')
                        .setDescription('O processamento do wager foi cancelado.')
                        .setTimestamp()],
                    components: []
                });
            }
        } catch (error) {
            // Tempo esgotado
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('⏱️ Tempo Esgotado')
                    .setDescription('Tempo para confirmação esgotado. Tente novamente.')
                    .setTimestamp()],
                components: []
            });
        }
        
    } catch (error) {
        console.error('Erro ao processar wager:', error);
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription('Ocorreu um erro interno. Tente novamente.')
                .setTimestamp()]
        });
    }
}

/**
 * Cria um embed de preview para um wager
 * @param {Object} wagerData - Dados do wager
 * @param {Object} vencedor - Usuário vencedor
 * @param {Object} perdedor - Usuário perdedor
 * @param {boolean} isWipe - Se foi um wipe
 * @returns {EmbedBuilder} Embed de preview
 */
function createWagerPreview(wagerData, vencedor, perdedor, isWipe) {
    const wipeText = isWipe ? ' (WIPE)' : '';
    
    const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle(`🎮 Preview do Wager${wipeText}`)
        .setDescription(`Confirme o resultado do wager 1v1`)
        .addFields(
            {
                name: '🥇 Vencedor',
                value: `<@${vencedor.id}>`,
                inline: true
            },
            {
                name: '🥈 Perdedor',
                value: `<@${perdedor.id}>`,
                inline: true
            }
        )
        .setFooter({ text: 'Confirme para processar os ELOs do wager' })
        .setTimestamp();
        
    return embed;
}

/**
 * Cria um embed de sucesso para um wager
 * @param {Object} result - Resultado do processamento
 * @param {Object} wagerData - Dados do wager
 * @param {Object} vencedor - Usuário vencedor
 * @param {Object} perdedor - Usuário perdedor
 * @returns {EmbedBuilder} Embed de sucesso
 */
function createWagerSuccessEmbed(result, wagerData, vencedor, perdedor) {
    const wipeText = wagerData.isWipe ? ' WIPE' : '';
    
    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle(`✅ Wager${wipeText} Processado!`)
        .setDescription(`<@${vencedor.id}> venceu <@${perdedor.id}>`)
        .addFields(
            {
                name: '📊 Resumo',
                value: `**Jogadores Atualizados:** ${result.updates.length}\n**Erros:** ${result.errors.length}\n**Match ID:** ${result.matchId}`,
                inline: false
            }
        )
        .setTimestamp();
    
    // Mostrar mudanças de ELO
    let eloChanges = '';
    const winnerUpdate = result.updates.find(u => u.userId === wagerData.winnerId);
    const loserUpdate = result.updates.find(u => u.userId === wagerData.loserId);
    
    if (winnerUpdate) {
        const changeStr = winnerUpdate.eloChange > 0 ? `+${winnerUpdate.eloChange}` : `${winnerUpdate.eloChange}`;
        eloChanges += `🏆 <@${winnerUpdate.userId}>: **${changeStr}** (${winnerUpdate.oldElo} → ${winnerUpdate.newElo})\n`;
        if (winnerUpdate.rankChange.changed) {
            eloChanges += `${winnerUpdate.rankChange.message}\n`;
        }
    }
    
    if (loserUpdate) {
        const changeStr = loserUpdate.eloChange > 0 ? `+${loserUpdate.eloChange}` : `${loserUpdate.eloChange}`;
        eloChanges += `😢 <@${loserUpdate.userId}>: **${changeStr}** (${loserUpdate.oldElo} → ${loserUpdate.newElo})\n`;
        if (loserUpdate.rankChange.changed) {
            eloChanges += `${loserUpdate.rankChange.message}\n`;
        }
    }
    
    if (eloChanges) {
        embed.addFields({ name: '🏅 Mudanças de ELO', value: eloChanges, inline: false });
    }
    
    // Mostrar erros se houver
    if (result.errors.length > 0) {
        const errorText = result.errors.slice(0, 3).join('\n');
        embed.addFields({ name: '⚠️ Avisos', value: errorText, inline: false });
    }
    
    return embed;
}