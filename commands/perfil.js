// commands/perfil.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { isUserInAnyGuild } = require('../handlers/db/guildDb');
const { loadUserProfile } = require('../handlers/db/userProfileDb');
const { isUserInAnyTeam, findTeamByLeader } = require('../handlers/db/teamDb');
const { resolveDisplayColor } = require('../handlers/utils/constants');
const { getEloRank, formatRankDisplay } = require('../handlers/elo/eloRanks');
const { ELO_CONFIG } = require('../utils/eloConstants');
const humanizeDuration = require('humanize-duration');

function formatCooldown(ms) {
    if (ms <= 0) return "alguns instantes";
    return humanizeDuration(ms, { language: 'pt', largest: 2, round: true, conjunction: ' e ', serialComma: false });
}

// Constantes para os IDs dos cargos de insígnias
const ROLE_IDS = {
    MODERACAO: ['1274456218815172621', '1326694166423404594', '1274456218794070045', '1274456218794070044'],
    HOSTER: ['1341162654374297630', '1274456218794070042', '1358557290835218534'],
    TOPS: ['1385804971747840052', '1274456218794070041', '1366194420889944086', '1348284990924001290', '1353770664024080485'],
    PARCEIROS: ['1388616416802111518', '1274456218756448280'],
    CONTENT_CREATOR: ['1274456218756448282'],
    ARTIST: ['1350498906177540197'],
    BOOSTER: ['1308929049392844851'],
    GUILD_LEADER: ['1274456218756448281', '1354091407480062065']
};

// Função para obter as insígnias do usuário
function getUserInsignias(member) {
    const insignias = [];
    const userRoleIds = member.roles.cache.map(role => role.id);
    
    // Verificar Moderação (apenas o cargo mais alto)
    for (const roleId of ROLE_IDS.MODERACAO) {
        if (userRoleIds.includes(roleId)) {
            insignias.push(`<@&${roleId}>`);
            break; // Apenas o primeiro encontrado
        }
    }
    
    // Verificar Hoster (apenas o cargo mais alto)
    for (const roleId of ROLE_IDS.HOSTER) {
        if (userRoleIds.includes(roleId)) {
            insignias.push(`<@&${roleId}>`);
            break; // Apenas o primeiro encontrado
        }
    }
    
    // Verificar Tops (todos os cargos)
    for (const roleId of ROLE_IDS.TOPS) {
        if (userRoleIds.includes(roleId)) {
            insignias.push(`<@&${roleId}>`);
        }
    }
    
    // Verificar Parceiros e Patrocinadores
    for (const roleId of ROLE_IDS.PARCEIROS) {
        if (userRoleIds.includes(roleId)) {
            insignias.push(`<@&${roleId}>`);
        }
    }
    
    // Verificar Content Creator
    for (const roleId of ROLE_IDS.CONTENT_CREATOR) {
        if (userRoleIds.includes(roleId)) {
            insignias.push(`<@&${roleId}>`);
        }
    }
    
    // Verificar Artist
    for (const roleId of ROLE_IDS.ARTIST) {
        if (userRoleIds.includes(roleId)) {
            insignias.push(`<@&${roleId}>`);
        }
    }
    
    // Verificar Booster
    for (const roleId of ROLE_IDS.BOOSTER) {
        if (userRoleIds.includes(roleId)) {
            insignias.push(`<@&${roleId}>`);
        }
    }
    
    // Verificar Guild Leader/Co-Leader
    for (const roleId of ROLE_IDS.GUILD_LEADER) {
        if (userRoleIds.includes(roleId)) {
            insignias.push(`<@&${roleId}>`);
        }
    }
    
    return insignias;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('perfil')
        .setDescription('Mostra seu perfil de guilda ou de outro usuário.')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('O usuário para visualizar o perfil.')
                .setRequired(false)),

    async execute(interaction, client, globalConfig) {
        await interaction.deferReply();

        const targetUserOption = interaction.options.getUser('usuario');
        const isSelfProfile = !targetUserOption || targetUserOption.id === interaction.user.id;
        const targetUser = targetUserOption || interaction.user;
        const targetMember = await interaction.guild.members.fetch(targetUser.id);
        
        const userGuild = await isUserInAnyGuild(targetUser.id);
        const userProfile = await loadUserProfile(targetUser.id);
        const userTeam = await isUserInAnyTeam(targetUser.id);

        // Novo formato de embed baseado na imagem de referência
        const profileEmbed = new EmbedBuilder()
            .setColor(userGuild ? resolveDisplayColor(userGuild.color, globalConfig) : '#3498DB')
            .setAuthor({ name: `Perfil de ${targetUser.username}`, iconURL: targetUser.displayAvatarURL() })
            .setTimestamp();

        // Obter as insígnias do usuário
        const userInsignias = getUserInsignias(targetMember);
        
        // Seção de insígnias
        let insigniasValue = userInsignias.length > 0 
            ? userInsignias.join('\n') 
            : 'Nenhuma insígnia encontrada';
        
        profileEmbed.addFields({ name: 'Insígnias:', value: insigniasValue, inline: false });
        
        // Seção de RANK (inline)
        let rankEmoji = '🥇'; // Emoji padrão
        let rankName = 'Rank do usuário';
        
        if (userProfile.eloData && userProfile.eloData.currentElo !== undefined) {
            const rank = getEloRank(userProfile.eloData.currentElo);
            rankEmoji = rank.emoji;
            rankName = rank.name;
        }
        
        const currentElo = userProfile.eloData?.currentElo || ELO_CONFIG.STARTING_ELO;
        const peakElo = userProfile.eloData?.peakElo || currentElo;
        const mvpCount = userProfile.eloData?.mvpCount || 0;
        
        profileEmbed.addFields({ 
            name: `${rankEmoji} ${rankName}`, 
            value: `ELO ATUAL: ${currentElo}\nPEAK ELO: ${peakElo}\nMVPs: ${mvpCount}`,
            inline: true 
        });

        // Seção de estatísticas
        const personalWins = userProfile.personalScore?.wins || 0;
        const personalLosses = userProfile.personalScore?.losses || 0;
        const personalWinRate = personalWins + personalLosses > 0 
            ? Math.round((personalWins / (personalWins + personalLosses)) * 100) 
            : 100;

        const statsField = {
            name: '📊 Estatísticas',
            value: `**Wars:** ${personalWins}V/${personalLosses}D\n**Score pessoal:** ${personalWins}V/${personalLosses}D\n**Wagers:** 0V/0D\n**Aproveitamento pessoal:** ${personalWinRate}%`,
            inline: true
        };
        
        // Seção de histórico
        const historicoField = {
            name: '📜 Histórico',
            value: `**Score pessoal:** ${personalWins}V/${personalLosses}D\n**Aproveitamento pessoal:** ${personalWinRate}%`,
            inline: true
        };
        
        profileEmbed.addFields(statsField, historicoField);

        // Seção de Guilda e Time
        let userRole = 'Membro';
        if (userGuild) {
            if (userGuild.leader?.id === targetUser.id) userRole = '👑 Líder';
            else if (userGuild.coLeader?.id === targetUser.id) userRole = '⭐ Vice-Líder';
        }
        
        let guildaField = {
            name: '🏰 Guilda',
            value: userGuild ? `${userGuild.name} (${userRole})` : 'Sem guilda',
            inline: true
        };
        
        let timeField = {
            name: '⚔️ Time',
            value: userTeam ? `${userTeam.name}` : 'Sem time',
            inline: true
        };
        
        profileEmbed.addFields(guildaField, timeField);
        
        // Banner personalizado
        if (userProfile.bannerUrl) {
            profileEmbed.setImage(userProfile.bannerUrl);
        } else {
            // Banner padrão se o usuário não tiver um personalizado
            profileEmbed.setImage('https://media.discordapp.net/attachments/1386151023864975431/1390007676842278922/DEEP_LEAGUE_BRASIL_2.png'); // URL do banner padrão do Deep League Brasil
        }
        
        // Rodapé com ID e data
        profileEmbed.setFooter({ text: `ID: ${targetUser.id} • ${new Date().toLocaleDateString('pt-BR')}` });
        
        // Botões
        const components = [];
        
        // Botão para ver estatísticas
        const statsButton = new ButtonBuilder()
            .setCustomId(`profile_view_elo_stats_${targetUser.id}`)
            .setLabel('Ver stats')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🎖️');
            
        // Botões para sair da guilda/time
        if (isSelfProfile) {
            // Se o usuário está vendo o próprio perfil
            const buttonsRow = new ActionRowBuilder().addComponents(statsButton);
            
            if (userGuild) {
                const leaveGuildButton = new ButtonBuilder()
                    .setCustomId(`profile_leave_guild_${userGuild._id}`)
                    .setLabel('Sair da Guilda')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('⛔');
                    
                buttonsRow.addComponents(leaveGuildButton);
            }
            
            if (userTeam) {
                const leaveTeamButton = new ButtonBuilder()
                    .setCustomId(`profile_leave_team_${userTeam._id}`)
                    .setLabel('Sair do Time')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('⛔');
                    
                buttonsRow.addComponents(leaveTeamButton);
            }
            
            components.push(buttonsRow);
        } else {
            // Se está vendo o perfil de outro usuário
            const buttonsRow = new ActionRowBuilder().addComponents(statsButton);
            components.push(buttonsRow);
        }
        
        await interaction.editReply({ embeds: [profileEmbed], components: components });
    },
};
