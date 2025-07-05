// commands/definir-canal-dodge.js
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { saveConfig } = require('../handlers'); // Importa do agregador

module.exports = {
    data: new SlashCommandBuilder()
        .setName('definir-canal-dodge')
        .setDescription('Define o canal de texto para onde os logs de Dodge serão enviados.')
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('O canal de texto para os logs de dodge.')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, client, globalConfig) {
        await interaction.deferReply({ ephemeral: true });

        const channel = interaction.options.getChannel('canal');

        try {
            // Cria uma cópia mutável da configuração global em memória
            const newConfig = { ...globalConfig, dodgeLogChannelId: channel.id };

            // Salva a nova configuração no DB e no arquivo local
            await saveConfig(newConfig);

            // Envia log da ação
            await client.guildPanelHandlers.sendLogMessage(
                client, newConfig, interaction,
                'Configuração de Canal',
                `O canal para logs de Dodge foi definido para <#${channel.id}>.`,
                [{ name: 'Canal de Logs de Dodge', value: `<#${channel.id}>`, inline: true }]
            );

            await interaction.editReply({
                content: `✅ Canal para logs de Dodge definido para <#${channel.id}> com sucesso!`,
            });

        } catch (error) {
            console.error('❌ Erro ao definir o canal de logs de dodge:', error);
            await interaction.editReply({ content: '❌ Ocorreu um erro ao tentar definir o canal.' });
        }
    },
};
