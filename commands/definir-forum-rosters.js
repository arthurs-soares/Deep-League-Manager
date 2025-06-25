// commands/definir-forum-rosters.js
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { loadConfig, saveConfig } = require('../handlers/db/configDb'); 
const { sendLogMessage } = require('../handlers/utils/logManager'); 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('definir-forum-rosters')
        .setDescription('Define o canal de Fórum onde os posts de rosters de guildas serão criados e atualizados.')
        .addChannelOption(option =>
            option.setName('canal-forum')
                .setDescription('O canal de Fórum a ser configurado.')
                .addChannelTypes(ChannelType.GuildForum) 
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), 

    async execute(interaction, client, globalConfig) { 
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await interaction.reply({
                content: '❌ Apenas administradores podem usar este comando!',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const forumChannel = interaction.options.getChannel('canal-forum');

        console.log(`[DIAGNÓSTICO DEFINE-FORUM] Comando /definir-forum-rosters executado por ${interaction.user.tag}.`);
        console.log(`[DIAGNÓSTICO DEFINE-FORUM] Canal selecionado: ${forumChannel.name} (${forumChannel.id}).`);

        try {
            // Verifica as permissões do bot no canal alvo
            const botPermissions = forumChannel.permissionsFor(client.user);
            const requiredPerms = [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.ManageChannels,       // Para criar/deletar posts (threads)
                PermissionFlagsBits.ManageThreads,        // Para gerenciar threads dentro do fórum
                PermissionFlagsBits.CreatePublicThreads,  // Para criar posts (threads)
                PermissionFlagsBits.SendMessagesInThreads // Para enviar o embed dentro do post
            ];
            const missingPerms = requiredPerms.filter(p => !botPermissions.has(p));

            if (missingPerms.length > 0) {
                const missingNames = missingPerms.map(p => Object.keys(PermissionFlagsBits).find(key => PermissionFlagsBits[key] === p)).join(', ');
                console.error(`❌ [DIAGNÓSTICO DEFINE-FORUM] Bot não tem permissões suficientes no canal de fórum ${forumChannel.name}. Faltando: ${missingNames}`);
                return await interaction.editReply({
                    content: `❌ Não tenho permissões suficientes no canal de fórum <#${forumChannel.id}> para criar/gerenciar posts. Faltando: \`${missingNames}\`. Por favor, ajuste as permissões.`,
                });
            }
            console.log(`[DIAGNÓSTICO DEFINE-FORUM] Permissões do bot no fórum verificadas: OK.`);

            let botConfig = await loadConfig();
            console.log(`[DIAGNÓSTICO DEFINE-FORUM] Config carregada ANTES da atualização: ${JSON.stringify(botConfig.guildRosterForumChannelId)}`);
            botConfig.guildRosterForumChannelId = forumChannel.id; // Salva o ID do canal de fórum

            console.log(`[DIAGNÓSTICO DEFINE-FORUM] Config pronta para salvar: ${JSON.stringify(botConfig.guildRosterForumChannelId)}`);
            await saveConfig(botConfig); // Salva a configuração atualizada
            console.log(`[DIAGNÓSTICO DEFINE-FORUM] saveConfig concluído.`);


            await sendLogMessage( 
                client, globalConfig, interaction, 
                'Configuração de Canal de Fórum', 
                `O canal de fórum para rosters de guildas foi configurado para <#${forumChannel.id}>.`,
                [
                    { name: 'Canal de Fórum Definido', value: `<#${forumChannel.id}>`, inline: true },
                ]
            );

            await interaction.editReply({
                content: `✅ Canal de fórum para rosters de guildas definido para <#${forumChannel.id}> com sucesso!`,
            });

            console.log(`🔧 Canal de fórum para rosters configurado: ${forumChannel.name} (${forumChannel.id}) por ${interaction.user.tag}`);

        } catch (error) {
            console.error('❌ [DIAGNÓSTICO DEFINE-FORUM] Erro ao definir o canal de fórum para rosters:', error);
            await interaction.editReply({
                content: '❌ Ocorreu um erro ao tentar definir o canal de fórum. Verifique as permissões do bot e tente novamente mais tarde.',
            });
        }
    },
};