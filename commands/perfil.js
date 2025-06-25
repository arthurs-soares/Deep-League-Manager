// commands/perfil.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isUserInAnyGuild } = require('../handlers/db/guildDb');
const humanizeDuration = require('humanize-duration'); // Usaremos uma lib para formatar o tempo

// Função auxiliar para formatar a duração do cooldown
function formatCooldown(ms) {
    if (ms <= 0) return "alguns instantes";
    return humanizeDuration(ms, {
        language: 'pt',
        largest: 2, // Mostra os 2 maiores valores (ex: "1 mês e 2 dias")
        round: true,
        conjunction: ' e ',
        serialComma: false,
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
        // Resposta pública por padrão
        await interaction.deferReply();

        const targetUserOption = interaction.options.getUser('usuario');
        const targetUser = targetUserOption || interaction.user;
        const targetMember = await interaction.guild.members.fetch(targetUser.id);

        const profileEmbed = new EmbedBuilder()
            .setAuthor({ name: `Perfil de ${targetMember.displayName}`, iconURL: targetMember.displayAvatarURL() })
            .setTimestamp();

        const userGuild = await isUserInAnyGuild(targetUser.id);

        if (userGuild) {
            // --- Usuário ESTÁ em uma guilda ---
            let userRole = 'Membro';
            let userRoster = 'Não especificado';
            let memberData;

            if (userGuild.leader?.id === targetUser.id) userRole = '👑 Líder';
            else if (userGuild.coLeader?.id === targetUser.id) userRole = '⭐ Vice-Líder';

            memberData = userGuild.mainRoster.find(m => m.id === targetUser.id);
            if (memberData) {
                userRoster = '🛡️ Roster Principal';
            } else {
                memberData = userGuild.subRoster.find(m => m.id === targetUser.id);
                if (memberData) userRoster = '⚔️ Roster Reserva';
            }

            let loyaltyString = 'Desde (data não registrada)';
            if (memberData && memberData.joinedAt) {
                loyaltyString = `Há ${formatCooldown(Date.now() - new Date(memberData.joinedAt).getTime())}`;
            }

            profileEmbed
                .setTitle(`Membro da Guilda: ${userGuild.name}`)
                .setColor(userGuild.color || '#2ECC71')
                .setThumbnail(userGuild.logo || null)
                .setDescription(`${targetUser.toString()} atualmente faz parte da guilda **${userGuild.name}**.`)
                .addFields(
                    { name: 'Cargo na Guilda', value: userRole, inline: true },
                    { name: 'Lealdade', value: loyaltyString, inline: true },
                    { name: 'Status', value: '🟢 **Ativo**', inline: true }
                );
        } else {
            // --- Usuário NÃO ESTÁ em uma guilda ---
            // Lógica de cooldown permanece a mesma
            profileEmbed
                .setTitle('Sem Guilda (Livre)')
                .setColor('#3498DB') // Azul padrão para neutro
                .setDescription(`${targetUser.toString()} não está em nenhuma guilda e está livre para se juntar a uma!`)
                .addFields({ name: 'Status', value: '✅ **Disponível**', inline: true });
            
            const COOLDOWN_DAYS = 3;
            const recentlyLeftUser = globalConfig.recentlyLeftUsers.find(u => u.userId === targetUser.id);
            if (recentlyLeftUser) {
                const COOLDOWN_MILLISECONDS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
                const leaveTime = new Date(recentlyLeftUser.leaveTimestamp).getTime();
                const cooldownEndTime = leaveTime + COOLDOWN_MILLISECONDS;

                if (Date.now() < cooldownEndTime) {
                    profileEmbed.setTitle('Sem Guilda (Em Cooldown)')
                        .setColor('#E67E22')
                        .setDescription(`${targetUser.toString()} não pode se juntar a uma nova guilda no momento.`)
                        .setFields(
                            { name: 'Status', value: '⏳ **Em Cooldown**', inline: true },
                            { name: 'Tempo Restante', value: formatCooldown(cooldownEndTime - Date.now()), inline: true },
                            { name: 'Fim do Cooldown', value: `<t:${Math.floor(cooldownEndTime / 1000)}:F>`, inline: false }
                        );
                }
            }
        }

        await interaction.editReply({ embeds: [profileEmbed] });
    },
};