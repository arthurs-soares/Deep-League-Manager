// commands/registrar.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { saveGuildData, loadGuildByName, isUserInAnyGuild, manageLeaderRole, manageCoLeaderRole, saveConfig, sendLogMessage, manageGuildForumPost } = require('../handlers'); 


const COOLDOWN_DAYS = 3;

// Função auxiliar para formatar a duração do cooldown
function formatDuration(ms) {
    if (ms <= 0) return "alguns instantes";

    const totalSeconds = Math.floor(ms / 1000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    const days = Math.floor(totalHours / 24);

    const hours = totalHours % 24;
    const minutes = totalMinutes % 60;

    let parts = [];
    if (days > 0) parts.push(`${days} dia${days > 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hora${hours > 1 ? 's' : ''}`);
    if (minutes > 0 && (days === 0 || hours === 0)) { // Mostrar minutos se dias ou horas for 0
        parts.push(`${minutes} minuto${minutes > 1 ? 's' : ''}`);
    }
    
    if (parts.length === 0) return "menos de um minuto";
    return parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' e ' + parts.slice(-1);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('registrar')
        .setDescription('Registra uma nova guilda no sistema')
        .addStringOption(option =>
            option.setName('nome')
                .setDescription('O nome EXATO da guilda')
                .setRequired(true)
                .setMaxLength(50))
        .addUserOption(option =>
            option.setName('leader')
                .setDescription('O @ do líder da guilda')
                .setRequired(true))
        .addUserOption(option =>
            option.setName('co-leader')
                .setDescription('O @ do vice-líder da guilda')
                .setRequired(false)),

    async execute(interaction, client, globalConfig) {
        const isModerator = interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                                (globalConfig.moderatorRoles && globalConfig.moderatorRoles.some(roleId => interaction.member.roles.cache.has(roleId)));

        if (!isModerator) {
            return interaction.reply({
                content: '❌ Apenas moderadores podem registrar novas guildas!',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guildName = interaction.options.getString('nome');
        const leader = interaction.options.getUser('leader');
        const coLeader = interaction.options.getUser('co-leader');
        const discordGuildId = interaction.guild.id; 

        if (coLeader && leader.id === coLeader.id) {
            return interaction.editReply({ content: '❌ O Líder e o Vice-Líder devem ser pessoas diferentes!' });
        }

        try {
            const existingGuild = await loadGuildByName(guildName);
            if (existingGuild) {
                return interaction.editReply({ content: `❌ Já existe uma guilda com o nome "${guildName}"!` });
            }

            // Verificação de jogador já em guilda ou em cooldown
            const checkUserEligibility = async (user, roleName) => {
                const userInGuild = await isUserInAnyGuild(user.id); 
                if (userInGuild) {
                    return `❌ O usuário ${user.toString()} já está na guilda "${userInGuild.name}" e não pode ser ${roleName} de uma nova guilda!`;
                }

                const recentlyLeftUser = globalConfig.recentlyLeftUsers.find(u => u.userId === user.id);
                if (recentlyLeftUser) {
                    const leaveTime = new Date(recentlyLeftUser.leaveTimestamp).getTime();
                    const now = Date.now();
                    const cooldownPeriodMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
                    const cooldownEndTime = leaveTime + cooldownPeriodMs;

                    if (now < cooldownEndTime) {
                        const remainingTimeMs = cooldownEndTime - now;
                        const remainingTimeString = formatDuration(remainingTimeMs);
                        return `❌ O usuário ${user.toString()} está em cooldown e precisa esperar mais ${remainingTimeString} para ser ${roleName} de uma nova guilda!`;
                    }
                }
                return null; // Usuário é elegível
            };

            let validationError = await checkUserEligibility(leader, 'líder');
            if (validationError) {
                return interaction.editReply({ content: validationError });
            }

            if (coLeader) {
                validationError = await checkUserEligibility(coLeader, 'vice-líder');
                if (validationError) {
                    return interaction.editReply({ content: validationError });
                }
            }

            // Remove o líder/co-líder da lista de `recentlyLeftUsers` se eles estavam lá
            // e salva a config para persistir a remoção do cooldown
            globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== leader.id);
            if (coLeader) {
                globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== coLeader.id);
            }
            await saveConfig(globalConfig); 


            const newGuild = {
                name: guildName,
                leader: { id: leader.id, username: leader.username },
                coLeader: coLeader ? { id: coLeader.id, username: coLeader.username } : null,
                mainRoster: [],
                subRoster: [],
                score: { wins: 0, losses: 0 },
                logo: null,
                banner: null, 
                description: null,
                link: null,
                color: '#3498DB', 
                createdBy: interaction.user.id,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                updatedBy: interaction.user.id,
                forumPostId: null,
            };

            await saveGuildData(newGuild);

            await manageLeaderRole(client, discordGuildId, leader.id, true, globalConfig); 
            if (coLeader) {
                await manageCoLeaderRole(client, discordGuildId, coLeader.id, true, globalConfig); 
            }

            console.log(`[DIAGNÓSTICO REGISTRAR] Tentando criar post no fórum para guilda: ${newGuild.name}`);
            console.log(`[DIAGNÓSTICO REGISTRAR] globalConfig.guildRosterForumChannelId: ${globalConfig.guildRosterForumChannelId}`);
            // NOVO: Criar o post no fórum da guilda
            await manageGuildForumPost(client, newGuild, globalConfig, 'create', interaction);
            console.log(`[DIAGNÓSTICO REGISTRAR] manageGuildForumPost chamado. newGuild.forumPostId: ${newGuild.forumPostId}`);


            client.emit('updateLeaderboard'); 

            // Envia log da ação de registro de guilda
            await sendLogMessage( 
                client, globalConfig, interaction, 
                'Registro de Guilda', 
                `A guilda **${guildName}** foi registrada.`,
                [
                    { name: 'Nome da Guilda', value: guildName, inline: true },
                    { name: 'Líder', value: `<@${leader.id}>`, inline: true },
                    { name: 'Vice-Líder', value: coLeader ? `<@${coLeader.id}>` : 'N/A', inline: true },
                    { name: 'Post no Fórum', value: newGuild.forumPostId ? `[Ver Post](https://discord.com/channels/${interaction.guild.id}/${globalConfig.guildRosterForumChannelId}/${newGuild.forumPostId})` : 'N/A (Fórum não configurado ou falha na criação)', inline: false } // Link dinâmico
                ]
            );

            const confirmEmbed = new EmbedBuilder()
                .setTitle('🏰 Guilda Registrada com Sucesso!')
                .setColor('#2ECC71')
                .setDescription(`A guilda **${guildName}** foi criada e salva no banco de dados!`)
                .addFields(
                    { name: '👑 Líder', value: `<@${leader.id}>`, inline: true },
                    { name: '⭐ Vice-Líder', value: coLeader ? `<@${coLeader.id}>` : '*Não definido*', inline: true },
                    { name: '💡 Próximo Passo', value: 'Use `/guilda-painel` para adicionar membros e editar o perfil!', inline: false }
                )
                .setFooter({ text: `Registrada por ${interaction.user.tag}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [confirmEmbed] });

        } catch (error) {
            console.error("Erro no comando /registrar:", error);
            await interaction.editReply({ content: `❌ Ocorreu um erro ao registrar a guilda no banco de dados: ${error.message || 'Erro desconhecido'}` });
        }
    },
};
