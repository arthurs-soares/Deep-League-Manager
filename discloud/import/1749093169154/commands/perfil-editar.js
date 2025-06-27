// commands/perfil-editar.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { loadUserProfile, saveUserProfile } = require('../handlers'); // Usa o indexador principal

module.exports = {
    data: new SlashCommandBuilder()
        .setName('perfil-editar')
        .setDescription('Edite seu perfil público.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('bio')
                .setDescription('Define ou limpa sua biografia pessoal.')
                .addStringOption(option =>
                    option.setName('texto')
                        .setDescription('Sua biografia (até 150 caracteres). Deixe em branco para remover.')
                        .setRequired(false)
                        .setMaxLength(150)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('banner')
                .setDescription('Define ou limpa seu banner de perfil.')
                .addStringOption(option =>
                    option.setName('url')
                        .setDescription('A URL da imagem para o banner. Deixe em branco para remover.')
                        .setRequired(false))),

    async execute(interaction, client, globalConfig) {
        await interaction.deferReply({ ephemeral: true });

        const subcommand = interaction.options.getSubcommand();
        const userProfile = await loadUserProfile(interaction.user.id);

        let confirmationMessage = '';

        if (subcommand === 'bio') {
            const bioText = interaction.options.getString('texto');
            userProfile.bio = bioText || null; // Salva null se o texto for vazio
            confirmationMessage = bioText
                ? '✅ Sua biografia foi atualizada com sucesso!'
                : '✅ Sua biografia foi removida com sucesso!';
        } else if (subcommand === 'banner') {
            const bannerUrl = interaction.options.getString('url');

            // Validação simples de URL
            if (bannerUrl && !bannerUrl.startsWith('https://')) {
                return interaction.editReply({ content: '❌ URL inválida. Por favor, forneça um link que comece com `https://`.' });
            }
            if (bannerUrl && !/\.(jpeg|jpg|gif|png|webp)$/i.test(bannerUrl)) {
                return interaction.editReply({ content: '❌ O link não parece ser uma imagem válida. A URL deve terminar com .jpg, .png, .gif, etc.' });
            }

            userProfile.bannerUrl = bannerUrl || null;
            confirmationMessage = bannerUrl
                ? '✅ Seu banner foi atualizado com sucesso!'
                : '✅ Seu banner foi removido com sucesso!';
        }

        await saveUserProfile(userProfile);
        await interaction.editReply({ content: confirmationMessage });
    },
};