// commands/setup-war-ticket.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const { saveConfig, sendLogMessage } = require('../handlers'); 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-war-ticket')
        .setDescription('Cria o painel para puxar guerras neste canal (Apenas Administradores).')
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('O canal onde o painel de tickets de guerra será enviado.')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // APENAS ADMINISTRADORES

    async execute(interaction, client, globalConfig) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await interaction.reply({ content: '❌ Você não tem permissão para usar este comando!', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const channel = interaction.options.getChannel('canal');

        try {
            // Verifica as permissões do bot no canal alvo
            if (!channel.permissionsFor(client.user).has([
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.ManageThreads,       // Necessário para criar threads
                PermissionFlagsBits.SendMessagesInThreads, // Necessário para enviar mensagens em threads
                PermissionFlagsBits.ManageRoles,          // Necessário para adicionar cargos (se o bot precisar para adicionar usuários)
                PermissionFlagsBits.ManageMessages        // Necessário para fixar mensagens
            ])) {
                return await interaction.editReply({
                    content: '❌ O bot não tem as permissões necessárias neste canal para criar o painel de tickets de guerra e threads. Preciso de: `Enviar Mensagens`, `Incorporar Links`, `Ver Canal`, `Gerenciar Threads`, `Enviar Mensagens em Threads`, `Gerenciar Cargos`, `Gerenciar Mensagens` (para fixar).',
                    ephemeral: true
                });
            }

            const panelEmbed = new EmbedBuilder()
                .setTitle('⚔️ Painel de Guerra ⚔️')
                .setColor(globalConfig.embedColor || '#FFD700')
                .setDescription('Clique no botão abaixo para preencher o formulário e puxar uma War/Glad contra outra guilda.')
                .setImage('https://placehold.co/1920x400/0d1117/ffffff?text=Painel+de+War');

            const pullWarButton = new ButtonBuilder()
                .setCustomId('pull_war_ticket')
                .setLabel('Puxar War/Glad')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔥');

            const row = new ActionRowBuilder().addComponents(pullWarButton);

            const sentMessage = await channel.send({
                embeds: [panelEmbed],
                components: [row]
            });

            // Salva o ID do canal E O ID DA MENSAGEM DO PAINEL na configuração global
            let botConfig = { ...globalConfig }; // Cria uma cópia mutável
            botConfig.warTicketChannelId = channel.id;
            botConfig.warTicketPanelMessageId = sentMessage.id; // Salva o ID da mensagem do painel
            await saveConfig(botConfig);

            // Envia log da ação
            await sendLogMessage(
                client, globalConfig, interaction,
                'Configuração de Painel',
                `O painel de tickets de guerra foi configurado no canal <#${channel.id}>. ID da Mensagem: \`${sentMessage.id}\`.`,
                [{ name: 'Canal', value: `<#${channel.id}>`, inline: true }]
            );

            await interaction.editReply({ content: `✅ Painel de tickets de guerra criado com sucesso em <#${channel.id}>! ID da Mensagem: \`${sentMessage.id}\`` });

        } catch (error) {
            console.error('❌ Erro ao criar painel de tickets de guerra:', error);
            await interaction.editReply({ content: '❌ Ocorreu um erro ao criar o painel de tickets de guerra. Verifique as permissões do bot ou tente novamente.' });
        }
    },
};
