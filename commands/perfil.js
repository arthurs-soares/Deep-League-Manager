// commands/perfil.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isUserInAnyGuild } = require('../handlers/db/guildDb');
const { loadUserProfile } = require('../handlers/db/userProfileDb');
const { resolveDisplayColor } = require('../handlers/utils/constants'); // <-- 1. IMPORTAR NOSSO HELPER
const humanizeDuration = require('humanize-duration');

function formatCooldown(ms) {
    if (ms <= 0) return "alguns instantes";
    return humanizeDuration(ms, {
        language: 'pt', largest: 2, round: true, conjunction: ' e ', serialComma: false,
    });
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
        const targetUser = targetUserOption || interaction.user;
        const targetMember = await interaction.guild.members.fetch(targetUser.id);
        
        const userGuild = await isUserInAnyGuild(targetUser.id);
        const userProfile = await loadUserProfile(targetUser.id);

        const profileEmbed = new EmbedBuilder()
            .setAuthor({ name: `Perfil de ${targetMember.displayName}`, iconURL: targetMember.displayAvatarURL() })
            .setTimestamp();
        
        let description = userProfile.bio ? `> ${userProfile.bio}` : `Perfil público de ${targetUser.toString()}.`;

        if (userProfile.bannerUrl) {
            profileEmbed.setImage(userProfile.bannerUrl);
        }

        const personalWins = userProfile.personalScore.wins || 0;
        const personalLosses = userProfile.personalScore.losses || 0;
        const personalTotalGames = personalWins + personalLosses;
        const personalWinRate = personalTotalGames > 0 ? Math.round((personalWins / personalTotalGames) * 100) : 0;

        profileEmbed.addFields({
            name: 'Estatísticas de Combate Pessoal',
            value: `**Score:** ${personalWins}V / ${personalLosses}D\n**Aproveitamento:** ${personalWinRate}%`,
            inline: false
        });

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
                // v-- 2. USAR O HELPER AQUI --v
                .setColor(resolveDisplayColor(userGuild.color, globalConfig))
                .setThumbnail(userGuild.logo || null)
                .addFields(
                    { name: 'Cargo na Guilda', value: userRole, inline: true },
                    { name: 'Lealdade', value: loyaltyString, inline: true },
                    { name: 'Status', value: '🟢 **Ativo**', inline: true }
                );
        } else {
            description += `\n\nAtualmente não faz parte de nenhuma guilda.`;
            profileEmbed.setColor('#3498DB');
            
            const COOLDOWN_DAYS = 3;
            const recentlyLeftUser = globalConfig.recentlyLeftUsers.find(u => u.userId === targetUser.id);
            if (recentlyLeftUser) {
                const COOLDOWN_MILLISECONDS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
                const leaveTime = new Date(recentlyLeftUser.leaveTimestamp).getTime();
                const cooldownEndTime = leaveTime + COOLDOWN_MILLISECONDS;

                if (Date.now() < cooldownEndTime) {
                    profileEmbed.setColor('#E67E22');
                    profileEmbed.addFields(
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
        
        profileEmbed.setDescription(description);

        await interaction.editReply({ embeds: [profileEmbed] });
    },
};