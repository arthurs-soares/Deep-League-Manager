// commands/setscore.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { loadGuildByName, saveGuildData, sendLogMessage, manageGuildForumPost } = require('../handlers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setscore')
        .setDescription('Define ou atualiza o score (vitórias/derrotas) de uma guilda.')
        .addStringOption(option =>
            option.setName('guilda')
                .setDescription('Nome da guilda para definir o score (comece a digitar para ver sugestões)')
                .setRequired(true)
                .setAutocomplete(true)) // <-- Autocomplete habilitado
        .addIntegerOption(option =>
            option.setName('vitorias')
                .setDescription('Número de vitórias')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('derrotas')
                .setDescription('Número de derrotas')
                .setRequired(true)),

    async execute(interaction, client, globalConfig) {
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        const isGeneralModerator = globalConfig.moderatorRoles &&
                                   globalConfig.moderatorRoles.some(roleId => interaction.member.roles.cache.has(roleId));
        const isScoreOperator = globalConfig.scoreOperatorRoles &&
                                globalConfig.scoreOperatorRoles.some(roleId => interaction.member.roles.cache.has(roleId));

        if (!isAdmin && !isGeneralModerator && !isScoreOperator) {
            return await interaction.reply({
                content: '❌ Você não tem permissão para usar este comando! Apenas administradores, moderadores ou operadores de score.',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guildName = interaction.options.getString('guilda');
        const wins = interaction.options.getInteger('vitorias');
        const losses = interaction.options.getInteger('derrotas');

        if (wins < 0 || losses < 0) {
            return await interaction.editReply({ content: '❌ Vitórias e derrotas não podem ser números negativos.' });
        }

        try {
            const guild = await loadGuildByName(guildName);

            if (!guild) {
                return await interaction.editReply({ content: `❌ Guilda "${guildName}" não encontrada no banco de dados!` });
            }

            const oldWins = guild.score?.wins || 0;
            const oldLosses = guild.score?.losses || 0;

            guild.score = { wins: wins, losses: losses };
            guild.updatedAt = new Date().toISOString();
            guild.updatedBy = interaction.user.id;

            await saveGuildData(guild);
            await manageGuildForumPost(client, guild, globalConfig, 'update', interaction);

            client.emit('updateLeaderboard');

            await sendLogMessage(
                client, globalConfig, interaction,
                'Atualização de Score',
                `O score da guilda **${guild.name}** foi atualizado.`,
                [
                    { name: 'Guilda', value: guild.name, inline: true },
                    { name: 'Vitórias (Antigo)', value: `${oldWins}`, inline: true },
                    { name: 'Vitórias (Novo)', value: `${wins}`, inline: true },
                    { name: 'Derrotas (Antigo)', value: `${oldLosses}`, inline: true },
                    { name: 'Derrotas (Novo)', value: `${losses}`, inline: true },
                ]
            );

            const embed = new EmbedBuilder()
                .setTitle(`📊 Score Atualizado para ${guild.name}`)
                .setColor('#3498DB')
                .setDescription(`O score de **${guild.name}** foi atualizado com sucesso!`)
                .addFields(
                    { name: 'Vitórias', value: `${wins}`, inline: true },
                    { name: 'Derrotas', value: `${losses}`, inline: true },
                    { name: 'Taxa de Vitória', value: `${(wins + losses) > 0 ? Math.round((wins / (wins + losses)) * 100) : 0}%`, inline: true }
                )
                .setFooter({ text: `Atualizado por ${interaction.user.tag}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error("❌ Erro no comando /setscore:", error);
            await interaction.editReply({ content: `❌ Ocorreu um erro ao definir o score: ${error.message || 'Erro desconhecido'}` });
        }
    },
};