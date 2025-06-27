// commands/perfil.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { isUserInAnyGuild } = require('../handlers/db/guildDb');
const { loadUserProfile } = require('../handlers/db/userProfileDb');
const { isUserInAnyTeam, findTeamByLeader } = require('../handlers/db/teamDb'); // New import
const { resolveDisplayColor } = require('../handlers/utils/constants');
const humanizeDuration = require('humanize-duration');

function formatCooldown(ms) {
    if (ms <= 0) return "alguns instantes";
    return humanizeDuration(ms, { language: 'pt', largest: 2, round: true, conjunction: ' e ', serialComma: false });
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
        const userTeam = await isUserInAnyTeam(targetUser.id); // New line

        const profileEmbed = new EmbedBuilder()
            .setAuthor({ name: `Perfil de ${targetMember.displayName}`, iconURL: targetMember.displayAvatarURL() })
            .setTimestamp();
        
        let description = userProfile.bio ? `> ${userProfile.bio}` : `Perfil público de ${targetUser.toString()}.`;
        if (userProfile.bannerUrl) profileEmbed.setImage(userProfile.bannerUrl);

        const personalWins = userProfile.personalScore.wins || 0;
        const personalLosses = userProfile.personalScore.losses || 0;
        const personalTotalGames = personalWins + personalLosses;
        const personalWinRate = personalTotalGames > 0 ? Math.round((personalWins / personalTotalGames) * 100) : 0;

        profileEmbed.addFields({
            name: '🏆 Histórico de Carreira (Todas as Guildas)',
            value: `**Score Pessoal:** ${personalWins}V / ${personalLosses}D\n**Aproveitamento Geral:** ${personalWinRate}%`,
            inline: false
        });

        const components = []; // Array para armazenar os botões

        if (userGuild) {
            let userRole = 'Membro';
            let memberData;

            if (userGuild.leader?.id === targetUser.id) userRole = '👑 Líder';
            else if (userGuild.coLeader?.id === targetUser.id) userRole = '⭐ Vice-Líder';

            memberData = userGuild.mainRoster.find(m => m.id === targetUser.id);
            if (!memberData) memberData = userGuild.subRoster.find(m => m.id === targetUser.id);

            let loyaltyString = 'Desde (data não registrada)';
            if (memberData && memberData.joinedAt) {
                loyaltyString = `Há ${formatCooldown(Date.now() - new Date(memberData.joinedAt).getTime())}`;
            }

            description += `\n\nAtualmente faz parte da guilda **[${userGuild.name}](https://discord.com/channels/${interaction.guild.id})**.`;

            profileEmbed
                .setColor(resolveDisplayColor(userGuild.color, globalConfig))
                .setThumbnail(userGuild.logo || null)
                .addFields(
                    { name: 'Cargo na Guilda', value: userRole, inline: true },
                    { name: 'Lealdade', value: loyaltyString, inline: true },
                    { name: 'Status', value: '🟢 **Ativo**', inline: true }
                );

            // <-- LÓGICA DO BOTÃO -->
            // Adiciona o botão "Sair da Guilda" apenas se o usuário está vendo o próprio perfil
            if (isSelfProfile) {
                const leaveGuildButton = new ButtonBuilder()
                    .setCustomId(`profile_leave_guild_${userGuild.id}`) // Passa o ID da guilda no customId
                    .setLabel('Sair da Guilda')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🚪');
                
                const row = new ActionRowBuilder().addComponents(leaveGuildButton);
                components.push(row);
            }
            
        } 
        
        if (userTeam) {
            let teamRole = 'Membro';
            if (userTeam.leader?.id === targetUser.id) teamRole = '👑 Líder';

            profileEmbed.addFields(
                { name: '⚽ Time Atual', value: `Faz parte do time **${userTeam.name}**`, inline: false },
                { name: 'Cargo no Time', value: teamRole, inline: true },
                { name: 'Score do Time', value: `${userTeam.score.wins || 0}V / ${userTeam.score.losses || 0}D`, inline: true }
            );
        } 
        
        const isInAnyOrg = userGuild || userTeam; // Check if user is in any organization

        if (!isInAnyOrg) { // Only apply this if user is NOT in any guild or team
            description += `\n\nAtualmente não faz parte de nenhuma guilda ou time.`;
            profileEmbed.setColor('#3498DB'); // Default color for non-members
            const COOLDOWN_DAYS = 3;
            const recentlyLeftUser = globalConfig.recentlyLeftUsers.find(u => u.userId === targetUser.id);
            if (recentlyLeftUser) {
                const COOLDOWN_MILLISECONDS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
                const leaveTime = new Date(recentlyLeftUser.leaveTimestamp).getTime();
                const cooldownEndTime = leaveTime + COOLDOWN_MILLISECONDS;
                if (Date.now() < cooldownEndTime) {
                    profileEmbed.setColor('#E67E22').addFields(
                        { name: 'Status', value: '⏳ **Em Cooldown**', inline: true },
                        { name: 'Tempo Restante', value: formatCooldown(cooldownEndTime - Date.now()), inline: true }
                    );
                } else {
                     profileEmbed.addFields({ name: 'Status', value: '✅ **Disponível**', inline: true });
                }
            } else {
                profileEmbed.addFields({ name: 'Status', value: '✅ **Disponível**', inline: true });
            }
        }

        // Adiciona botão para Painel da Guilda se for líder/vice-líder
        if (isSelfProfile && (userGuild && (userGuild.leader?.id === targetUser.id || userGuild.coLeader?.id === targetUser.id))) {
            const guildPanelButton = new ButtonBuilder()
                .setCustomId(`profile_guild_panel_${userGuild.name.toLowerCase().replace(/\s+/g, '-')}`)
                .setLabel('Painel da Guilda')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🎛️');
            
            let guildRow = components.find(row => row.components.length < 5); 
            if (!guildRow) {
                guildRow = new ActionRowBuilder();
                components.push(guildRow);
            }
            guildRow.addComponents(guildPanelButton);
        }

        // Adiciona botão para Painel do Time se for líder do time
        if (isSelfProfile && (userTeam && userTeam.leader?.id === targetUser.id)) {
            const teamPanelButton = new ButtonBuilder()
                .setCustomId(`profile_team_panel_${userTeam.name.toLowerCase().replace(/\s+/g, '-')}`)
                .setLabel('Painel do Time')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⚽');
            
            let teamRow = components.find(row => row.components.length < 5); 
            if (!teamRow) {
                teamRow = new ActionRowBuilder();
                components.push(teamRow);
            }
            teamRow.addComponents(teamPanelButton);
        }
        
        profileEmbed.setDescription(description);
        await interaction.editReply({ embeds: [profileEmbed], components: components });
    },
};
