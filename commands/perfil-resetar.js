// commands/perfil-resetar.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getDatabaseInstance } = require('../utils/database');
const { loadUserProfile, saveUserProfile } = require('../handlers');
const { sendLogMessage } = require('../handlers/utils/logManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('perfil-resetar')
        .setDescription('Reseta o perfil de um ou de todos os usuários (Apenas Administradores).')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('individual')
                .setDescription('Reseta o perfil de um usuário específico.')
                .addUserOption(option =>
                    option.setName('usuario')
                        .setDescription('O usuário cujo perfil será resetado.')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('todos')
                .setDescription('Reseta o perfil de TODOS os usuários do bot (requer confirmação).')),

    async execute(interaction, client, globalConfig) {
        // Verificação de permissão
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ 
                content: '❌ Apenas administradores do servidor podem usar este comando.',
                ephemeral: true 
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'individual') {
            // ---- Lógica para resetar um perfil individual ----
            await interaction.deferReply({ ephemeral: true });

            const targetUser = interaction.options.getUser('usuario');
            const userProfile = await loadUserProfile(targetUser.id);

            // Reseta os campos customizáveis e o score
            userProfile.personalScore = { wins: 0, losses: 0 };
            userProfile.bio = null;
            userProfile.bannerUrl = null;
            // Adicione outros campos que queira resetar aqui

            await saveUserProfile(userProfile);

            await sendLogMessage(
                client, globalConfig, interaction,
                'Reset de Perfil Individual',
                `O perfil de ${targetUser.tag} foi resetado.`,
                [
                    { name: 'Usuário Alvo', value: targetUser.toString(), inline: true },
                    { name: 'Administrador Responsável', value: interaction.user.toString(), inline: true },
                ]
            );

            await interaction.editReply({ 
                content: `✅ O perfil de **${targetUser.tag}** foi resetado com sucesso.`
            });

        } else if (subcommand === 'todos') {
            // ---- Lógica para resetar TODOS os perfis com confirmação ----
            const confirmEmbed = new EmbedBuilder()
                .setTitle('⚠️ Confirmação de Reset Global ⚠️')
                .setColor('#E74C3C')
                .setDescription('**Você tem certeza que deseja resetar o perfil (Score, Bio, Banner) de TODOS os usuários do bot?**\n\nEsta ação é **IRREVERSÍVEL**.\n\nClique em "Confirmar" para prosseguir.')
                .setFooter({ text: 'Esta operação pode levar alguns segundos.' });

            const confirmButton = new ButtonBuilder().setCustomId('confirm_reset_all_profiles').setLabel('Sim, Resetar Tudo').setStyle(ButtonStyle.Danger);
            const cancelButton = new ButtonBuilder().setCustomId('cancel_reset_all_profiles').setLabel('Cancelar').setStyle(ButtonStyle.Secondary);
            const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

            const response = await interaction.reply({
                embeds: [confirmEmbed],
                components: [row],
                ephemeral: true
            });

            const filter = i => i.user.id === interaction.user.id;
            try {
                const confirmation = await response.awaitMessageComponent({ filter, time: 30_000 });

                if (confirmation.customId === 'confirm_reset_all_profiles') {
                    await confirmation.update({ content: '⏳ Processando reset global... por favor, aguarde.', embeds: [], components: [] });

                    const db = getDatabaseInstance();
                    const profilesCollection = db.collection('user_profiles');

                    // Atualiza todos os documentos na coleção
                    const result = await profilesCollection.updateMany(
                        {}, // Filtro vazio para afetar todos os documentos
                        { $set: { 
                            'personalScore': { wins: 0, losses: 0 },
                            'bio': null,
                            'bannerUrl': null,
                        }}
                    );

                    const successMessage = `✅ Reset global concluído! **${result.modifiedCount}** perfis de usuário foram resetados.`;

                    await sendLogMessage(
                        client, globalConfig, confirmation,
                        'Reset Global de Perfis',
                        successMessage,
                        [{ name: 'Administrador Responsável', value: interaction.user.toString(), inline: true }]
                    );

                    await confirmation.editReply({ content: successMessage });
                
                } else if (confirmation.customId === 'cancel_reset_all_profiles') {
                    await confirmation.update({ content: 'ℹ️ Operação de reset global cancelada.', embeds: [], components: [] });
                }
            } catch (error) {
                await interaction.editReply({ 
                    content: 'Tempo de confirmação esgotado. A operação foi cancelada.', 
                    embeds: [], 
                    components: [] 
                }).catch(() => {});
            }
        }
    },
};