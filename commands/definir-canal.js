// commands/definir-canal.js
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
// Importações DIRETAS dos módulos necessários
const { loadConfig, saveConfig } = require('../handlers/db/configDb'); 
const { sendLogMessage } = require('../handlers/utils/logManager'); 


module.exports = {
    data: new SlashCommandBuilder()
        .setName('definir-canal')
        .setDescription('Define o canal onde as guildas serão enviadas para visualização (apenas moderadores).')
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('O canal onde as guildas serão enviadas.')
                .addChannelTypes(ChannelType.GuildText) 
                .setRequired(true)),

    async execute(interaction, client, globalConfig) { 
        const isModerator = interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                                (globalConfig.moderatorRoles && globalConfig.moderatorRoles.some(roleId => interaction.member.roles.cache.has(roleId)));

        if (!isModerator) {
            return await interaction.reply({
                content: '❌ Apenas moderadores podem usar este comando!',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const channel = interaction.options.getChannel('canal');

        try {
            let botConfig = await loadConfig();

            // Adiciona o ID do canal de logs (se ainda não tiver)
            if (!botConfig.logChannelId) {
                console.warn('⚠️ [config.json] logChannelId não definido. Considere configurá-lo para logs completos.');
            }

            // Salva o ID do canal de visualização de guildas
            botConfig.guildViewChannel = channel.id;

            await saveConfig(botConfig);

            // Envia log da ação de configuração de canal
            await sendLogMessage( 
                client, globalConfig, interaction, 
                'Configuração de Canal de Visualização', 
                `O canal de visualização de guildas foi configurado para <#${channel.id}>.`,
                [
                    { name: 'Canal Definido', value: `<#${channel.id}>`, inline: true },
                ]
            );

            await interaction.editReply({
                content: `✅ Canal de visualização de guildas definido para <#${channel.id}> com sucesso!`,
            });

            console.log(`🔧 Canal de guildas configurado: ${channel.name} (${channel.id}) por ${interaction.user.tag}`);

        } catch (error) {
            console.error('❌ Erro ao definir o canal de visualização:', error);
            await interaction.editReply({
                content: '❌ Ocorreu um erro ao tentar definir o canal de visualização. Tente novamente mais tarde.',
            });
        }
    },
};
