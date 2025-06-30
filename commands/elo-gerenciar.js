// commands/elo-gerenciar.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { loadUserProfile } = require('../handlers/db/userProfileDb');
const { applyManualEloChange, setPlayerElo, resetPlayerElo, undoLastEloChange } = require('../handlers/elo/eloManager');
const { hasEloPermission, validateUserForElo, validateEloValue, validateEloChange } = require('../handlers/elo/eloValidation');
const { getEloRank, formatRankDisplay, checkRankChange } = require('../handlers/elo/eloRanks');
const { ELO_CONFIG } = require('../utils/eloConstants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('elo-gerenciar')
        .setDescription('Gerenciar ELO dos jogadores (Score Operators)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('adicionar')
                .setDescription('Adicionar pontos ELO a um jogador')
                .addUserOption(option =>
                    option.setName('usuario')
                        .setDescription('Usuário para adicionar ELO')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('pontos')
                        .setDescription('Pontos ELO para adicionar')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(500))
                .addStringOption(option =>
                    option.setName('razao')
                        .setDescription('Razão da adição de ELO')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remover')
                .setDescription('Remover pontos ELO de um jogador')
                .addUserOption(option =>
                    option.setName('usuario')
                        .setDescription('Usuário para remover ELO')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('pontos')
                        .setDescription('Pontos ELO para remover')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(500))
                .addStringOption(option =>
                    option.setName('razao')
                        .setDescription('Razão da remoção de ELO')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('definir')
                .setDescription('Definir ELO específico para um jogador')
                .addUserOption(option =>
                    option.setName('usuario')
                        .setDescription('Usuário para definir ELO')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('elo')
                        .setDescription('Novo valor de ELO')
                        .setRequired(true)
                        .setMinValue(ELO_CONFIG.MIN_ELO)
                        .setMaxValue(ELO_CONFIG.MAX_ELO))
                .addStringOption(option =>
                    option.setName('razao')
                        .setDescription('Razão da definição de ELO')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('resetar')
                .setDescription('Resetar ELO de um jogador para o valor inicial')
                .addUserOption(option =>
                    option.setName('usuario')
                        .setDescription('Usuário para resetar ELO')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('razao')
                        .setDescription('Razão do reset')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('historico')
                .setDescription('Ver histórico de ELO de um jogador')
                .addUserOption(option =>
                    option.setName('usuario')
                        .setDescription('Usuário para ver histórico')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('limite')
                        .setDescription('Número de entradas para mostrar')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(20)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reverter')
                .setDescription('Reverter a última mudança de ELO de um jogador')
                .addUserOption(option =>
                    option.setName('usuario')
                        .setDescription('Usuário para reverter última mudança')
                        .setRequired(true))),

    async execute(interaction, client, globalConfig) {
        await interaction.deferReply();

        const member = interaction.guild.members.cache.get(interaction.user.id);

        // Verificar permissões
        if (!hasEloPermission(member, globalConfig)) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Sem Permissão')
                    .setDescription('Você não tem permissão para gerenciar ELO. Apenas Score Operators podem usar este comando.')
                    .setTimestamp()]
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser('usuario');

        // Validar usuário (quando aplicável)
        if (targetUser) {
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
        }

        try {
            switch (subcommand) {
                case 'adicionar':
                    await handleAddElo(interaction, targetUser, globalConfig);
                    break;
                case 'remover':
                    await handleRemoveElo(interaction, targetUser, globalConfig);
                    break;
                case 'definir':
                    await handleSetElo(interaction, targetUser, globalConfig);
                    break;
                case 'resetar':
                    await handleResetElo(interaction, targetUser, globalConfig);
                    break;
                case 'historico':
                    await handleHistory(interaction, targetUser, globalConfig);
                    break;
                case 'reverter':
                    await handleUndo(interaction, targetUser, globalConfig);
                    break;
                default:
                    await interaction.editReply('Subcomando não reconhecido.');
            }
        } catch (error) {
            console.error(`Erro no comando elo-gerenciar (${subcommand}):`, error);
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Erro')
                    .setDescription('Ocorreu um erro ao executar o comando. Tente novamente.')
                    .setTimestamp()]
            });
        }
    },
};

async function handleAddElo(interaction, targetUser, globalConfig) {
    const pontos = interaction.options.getInteger('pontos');
    const razao = interaction.options.getString('razao') || 'Adição manual de ELO';

    const userProfile = await loadUserProfile(targetUser.id);
    const currentElo = userProfile.eloData?.currentElo || ELO_CONFIG.STARTING_ELO;

    // Validar mudança
    const validation = validateEloChange(currentElo, pontos);
    if (!validation.isValid) {
        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Mudança Inválida')
                .setDescription(validation.error)
                .setTimestamp()]
        });
    }

    const result = await applyManualEloChange(targetUser.id, pontos, interaction.user.id, razao);

    if (result.success) {
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ ELO Adicionado')
            .setDescription(`**${targetUser.displayName}** recebeu **+${pontos} ELO**`)
            .addFields(
                { name: 'ELO Anterior', value: `${result.oldElo}`, inline: true },
                { name: 'ELO Atual', value: `${result.newElo}`, inline: true },
                { name: 'Rank', value: formatRankDisplay(result.newElo), inline: true },
                { name: 'Razão', value: razao, inline: false }
            )
            .setTimestamp();

        if (result.rankChange.changed) {
            embed.addFields({ name: 'Mudança de Rank', value: result.rankChange.message, inline: false });
        }

        await interaction.editReply({ embeds: [embed] });
    } else {
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription(`Falha ao adicionar ELO: ${result.error}`)
                .setTimestamp()]
        });
    }
}

async function handleRemoveElo(interaction, targetUser, globalConfig) {
    const pontos = interaction.options.getInteger('pontos');
    const razao = interaction.options.getString('razao') || 'Remoção manual de ELO';

    const userProfile = await loadUserProfile(targetUser.id);
    const currentElo = userProfile.eloData?.currentElo || ELO_CONFIG.STARTING_ELO;

    // Validar mudança (pontos negativos)
    const validation = validateEloChange(currentElo, -pontos);
    if (!validation.isValid) {
        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Mudança Inválida')
                .setDescription(validation.error)
                .setTimestamp()]
        });
    }

    const result = await applyManualEloChange(targetUser.id, -pontos, interaction.user.id, razao);

    if (result.success) {
        const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('⚠️ ELO Removido')
            .setDescription(`**${targetUser.displayName}** perdeu **-${pontos} ELO**`)
            .addFields(
                { name: 'ELO Anterior', value: `${result.oldElo}`, inline: true },
                { name: 'ELO Atual', value: `${result.newElo}`, inline: true },
                { name: 'Rank', value: formatRankDisplay(result.newElo), inline: true },
                { name: 'Razão', value: razao, inline: false }
            )
            .setTimestamp();

        if (result.rankChange.changed) {
            embed.addFields({ name: 'Mudança de Rank', value: result.rankChange.message, inline: false });
        }

        await interaction.editReply({ embeds: [embed] });
    } else {
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription(`Falha ao remover ELO: ${result.error}`)
                .setTimestamp()]
        });
    }
}

async function handleSetElo(interaction, targetUser, globalConfig) {
    const novoElo = interaction.options.getInteger('elo');
    const razao = interaction.options.getString('razao') || 'Definição administrativa de ELO';

    // Validar novo ELO
    const validation = validateEloValue(novoElo);
    if (!validation.isValid) {
        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ ELO Inválido')
                .setDescription(validation.error)
                .setTimestamp()]
        });
    }

    const result = await setPlayerElo(targetUser.id, novoElo, interaction.user.id, razao);

    if (result.success) {
        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('🎯 ELO Definido')
            .setDescription(`**${targetUser.displayName}** teve seu ELO definido para **${novoElo}**`)
            .addFields(
                { name: 'ELO Anterior', value: `${result.oldElo}`, inline: true },
                { name: 'ELO Atual', value: `${result.newElo}`, inline: true },
                { name: 'Rank', value: formatRankDisplay(result.newElo), inline: true },
                { name: 'Razão', value: razao, inline: false }
            )
            .setTimestamp();

        if (result.rankChange.changed) {
            embed.addFields({ name: 'Mudança de Rank', value: result.rankChange.message, inline: false });
        }

        await interaction.editReply({ embeds: [embed] });
    } else {
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription(`Falha ao definir ELO: ${result.error}`)
                .setTimestamp()]
        });
    }
}

async function handleResetElo(interaction, targetUser, globalConfig) {
    const razao = interaction.options.getString('razao') || 'Reset administrativo';

    const result = await resetPlayerElo(targetUser.id, interaction.user.id, razao);

    if (result.success) {
        const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('🔄 ELO Resetado')
            .setDescription(`**${targetUser.displayName}** teve seu ELO resetado`)
            .addFields(
                { name: 'ELO Anterior', value: `${result.oldElo}`, inline: true },
                { name: 'ELO Atual', value: `${result.newElo}`, inline: true },
                { name: 'Rank', value: formatRankDisplay(result.newElo), inline: true },
                { name: 'Razão', value: razao, inline: false }
            )
            .setTimestamp();

        if (result.rankChange.changed) {
            embed.addFields({ name: 'Mudança de Rank', value: result.rankChange.message, inline: false });
        }

        await interaction.editReply({ embeds: [embed] });
    } else {
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription(`Falha ao resetar ELO: ${result.error}`)
                .setTimestamp()]
        });
    }
}

async function handleHistory(interaction, targetUser, globalConfig) {
    const limite = interaction.options.getInteger('limite') || 10;

    const userProfile = await loadUserProfile(targetUser.id);
    const eloData = userProfile.eloData;

    if (!eloData || !eloData.eloHistory || eloData.eloHistory.length === 0) {
        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('📊 Histórico de ELO')
                .setDescription(`**${targetUser.displayName}** não possui histórico de ELO ainda.`)
                .setTimestamp()]
        });
    }

    const history = eloData.eloHistory.slice(0, limite);
    const currentRank = getEloRank(eloData.currentElo);

    const embed = new EmbedBuilder()
        .setColor(currentRank.color)
        .setTitle(`📊 Histórico de ELO - ${targetUser.displayName}`)
        .setDescription(`${currentRank.emoji} **${currentRank.name}** | **${eloData.currentElo} ELO**\n**Peak:** ${eloData.peakElo} ELO | **MVPs:** ${eloData.mvpCount}`)
        .setTimestamp();

    let historyText = '';
    for (let i = 0; i < history.length; i++) {
        const entry = history[i];
        const date = new Date(entry.date).toLocaleDateString('pt-BR');
        const changeStr = entry.eloChange > 0 ? `+${entry.eloChange}` : `${entry.eloChange}`;
        const arrow = entry.eloChange > 0 ? '↗️' : '↘️';
        
        historyText += `${arrow} **${changeStr}** → ${entry.newElo} ELO\n`;
        historyText += `📅 ${date} | ${entry.reason}\n`;
        if (entry.matchResult) historyText += `🏆 ${entry.matchResult}\n`;
        historyText += '\n';
    }

    if (historyText.length > 1024) {
        historyText = historyText.substring(0, 1021) + '...';
    }

    embed.addFields({ name: `Últimas ${history.length} Mudanças`, value: historyText || 'Nenhuma mudança encontrada', inline: false });

    await interaction.editReply({ embeds: [embed] });
}

async function handleUndo(interaction, targetUser, globalConfig) {
    const result = await undoLastEloChange(targetUser.id, interaction.user.id);

    if (result.success) {
        const embed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle('↩️ Mudança Revertida')
            .setDescription(`**${targetUser.displayName}** teve sua última mudança de ELO revertida`)
            .addFields(
                { name: 'ELO Anterior', value: `${result.oldElo}`, inline: true },
                { name: 'ELO Atual', value: `${result.newElo}`, inline: true },
                { name: 'Rank', value: formatRankDisplay(result.newElo), inline: true }
            )
            .setTimestamp();

        if (result.rankChange.changed) {
            embed.addFields({ name: 'Mudança de Rank', value: result.rankChange.message, inline: false });
        }

        await interaction.editReply({ embeds: [embed] });
    } else {
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription(`Falha ao reverter mudança: ${result.error}`)
                .setTimestamp()]
        });
    }
}