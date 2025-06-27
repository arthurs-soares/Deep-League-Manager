// commands/registrar-time.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
// Importando handlers de Time e de Usuário/Guilda para validação cruzada
const { saveTeamData, loadTeamByName, isUserInAnyTeam } = require('../handlers/db/teamDb');
const { isUserInAnyGuild } = require('../handlers/db/guildDb');
const { sendLogMessage } = require('../handlers/utils/logManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('registrar-time')
        .setDescription('Registra um novo time no sistema (Apenas Moderadores).')
        .addStringOption(option =>
            option.setName('nome')
                .setDescription('O nome EXATO do time.')
                .setRequired(true)
                .setMaxLength(50))
        .addUserOption(option =>
            option.setName('lider')
                .setDescription('O @ do líder do time.')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, client, globalConfig) {
        // Verificação de permissão
        const isModerator = interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                                (globalConfig.moderatorRoles && globalConfig.moderatorRoles.some(roleId => interaction.member.roles.cache.has(roleId)));

        if (!isModerator) {
            return interaction.reply({
                content: '❌ Apenas moderadores podem registrar novos times!',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const teamName = interaction.options.getString('nome');
        const leader = interaction.options.getUser('lider');

        try {
            // 1. Verifica se o nome do time já existe
            const existingTeam = await loadTeamByName(teamName);
            if (existingTeam) {
                return interaction.editReply({ content: `❌ Já existe um time com o nome "${teamName}"!` });
            }

            // 2. Verifica se o líder já está em outra guilda ou time
            // DECISÃO DE NEGÓCIO: Permitimos que um membro de guilda crie um time?
            // Por enquanto, vamos manter a regra de que ele não pode estar em NENHUMA outra entidade.
            const userInGuild = await isUserInAnyGuild(leader.id);
            if (userInGuild) {
                return interaction.editReply({ content: `❌ O usuário ${leader.toString()} já está na guilda "${userInGuild.name}" e não pode liderar um time.` });
            }
            const userInTeam = await isUserInAnyTeam(leader.id);
            if (userInTeam) {
                return interaction.editReply({ content: `❌ O usuário ${leader.toString()} já está no time "${userInTeam.name}" e não pode liderar outro.` });
            }
            
            // 3. Cria a estrutura do novo time
            const newTeam = {
                name: teamName,
                leader: { id: leader.id, username: leader.username },
                roster: [], // Roster único, não dividido
                score: { wins: 0, losses: 0 },
                logo: null,
                color: '#8E44AD', // Roxo padrão para times
                createdBy: interaction.user.id,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                updatedBy: interaction.user.id,
            };

            // 4. Salva o novo time no banco de dados
            await saveTeamData(newTeam);

            // 5. Emite evento para atualizar ranking de times (será criado na Tarefa 8)
            client.emit('updateTeamLeaderboard'); 

            // 6. Envia log da ação
            await sendLogMessage( 
                client, globalConfig, interaction, 
                'Registro de Time', 
                `O time **${teamName}** foi registrado com sucesso.`,
                [
                    { name: 'Nome do Time', value: teamName, inline: true },
                    { name: 'Líder', value: leader.toString(), inline: true },
                ]
            );

            // 7. Responde ao usuário com sucesso
            const confirmEmbed = new EmbedBuilder()
                .setTitle('⚽ Time Registrado com Sucesso!')
                .setColor('#2ECC71')
                .setDescription(`O time **${teamName}** foi criado e salvo no banco de dados!`)
                .addFields(
                    { name: '👑 Líder', value: leader.toString(), inline: true },
                    { name: '💡 Próximo Passo', value: 'Use `/time-painel` para adicionar membros e editar o perfil do time!', inline: false }
                )
                .setFooter({ text: `Registrado por ${interaction.user.tag}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [confirmEmbed] });

        } catch (error) {
            console.error("Erro no comando /registrar-time:", error);
            await interaction.editReply({ content: `❌ Ocorreu um erro ao registrar o time: ${error.message || 'Erro desconhecido'}` });
        }
    },
};