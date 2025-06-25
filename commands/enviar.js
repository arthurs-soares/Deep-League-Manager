// commands/enviar.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
// Importações DIRETAS dos módulos necessários (do handler principal)
const { loadGuildByName, loadAllGuilds, loadConfig, sendLogMessage, manageGuildForumPost, resolveDisplayColor } = require('../handlers'); 


module.exports = {
    data: new SlashCommandBuilder()
        .setName('enviar')
        .setDescription('Envia uma guilda no canal configurado ou cria/atualiza seu post no fórum (apenas moderadores)')
        .addStringOption(option =>
            option.setName('guilda')
                .setDescription('Nome da guilda para enviar')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('canal-alvo')
                .setDescription('Opcional: Canal de texto para enviar o card (prioriza o fórum se configurado).')
                .addChannelTypes(0) // 0 = GuildText, 5 = GuildVoice, 10 = GuildNews, 11 = GuildNewsThread, 12 = PublicThread, 13 = PrivateThread, 14 = GuildStageVoice, 15 = GuildDirectory, 16 = GuildForum
                .setRequired(false)),


    async execute(interaction, client, globalConfig) { 
        const guildName = interaction.options.getString('guilda');
        const targetChannel = interaction.options.getChannel('canal-alvo'); // Novo: Canal alvo opcional

        const isModerator = interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                                (globalConfig.moderatorRoles && globalConfig.moderatorRoles.some(roleId => interaction.member.roles.cache.has(roleId)));

        if (!isModerator) {
            return await interaction.reply({
                content: '❌ Apenas moderadores podem usar este comando!',
                flags: MessageFlags.Ephemeral 
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 

        const guild = await loadGuildByName(guildName);

        if (!guild) {
            const allGuilds = await loadAllGuilds(); 
            const availableGuilds = allGuilds.length > 0 ? 
                                         Object.values(allGuilds).map(g => g.name).join(', ') : 
                                         '*Nenhuma guilda registrada.*';

            return await interaction.editReply({
                content: `❌ Guilda "${guildName}" não encontrada no banco de dados!\n\n**Guildas disponíveis:** ${availableGuilds}`,
            });
        }

        const botConfig = await loadConfig(); 
        
        let sentMessageUrl = '';
        let actionDescription = '';

        // Prioridade 1: Canal de Fórum (se configurado)
        if (botConfig.guildRosterForumChannelId) {
            // Criar ou atualizar o post no fórum da guilda
            await manageGuildForumPost(client, guild, globalConfig, 'update', interaction);
            sentMessageUrl = `[Ver Post no Fórum](https://discord.com/channels/${interaction.guild.id}/${botConfig.guildRosterForumChannelId}/${guild.forumPostId || ''})`;
            actionDescription = `O post da guilda **${guild.name}** no fórum foi atualizado ou criado.`;
            
            // Log para a ação de fórum
            await sendLogMessage( 
                client, globalConfig, interaction, 
                'Envio de Card de Guilda (Fórum)', 
                actionDescription,
                [
                    { name: 'Guilda', value: guild.name, inline: true },
                    { name: 'Canal de Fórum', value: `<#${botConfig.guildRosterForumChannelId}>`, inline: true },
                    { name: 'Link do Post', value: sentMessageUrl, inline: false },
                ]
            );

             await interaction.editReply({
                content: `✅ ${actionDescription} ${sentMessageUrl}`,
            });
            return; // Termina o comando aqui se o fórum foi usado
        }


        // Prioridade 2: Canal de Texto (se configurado via /definir-canal ou via opção canal-alvo)
        const targetChannelId = targetChannel?.id || botConfig.guildViewChannel;

        if (!targetChannelId) {
            return await interaction.editReply({
                content: '❌ Nenhum canal de visualização de guildas (texto) ou fórum configurado! Use `/definir-canal` para canal de texto ou `/definir-forum-rosters` para fórum.',
            });
        }

        try {
            const channel = await interaction.client.channels.fetch(targetChannelId);

            if (!channel || channel.type !== ChannelType.GuildText) { // Apenas canais de texto
                return await interaction.editReply({
                    content: '❌ Canal configurado não encontrado, não é um canal de texto, ou foi deletado! Por favor, reconfigure com `/definir-canal` ou use um `--canal-alvo` válido.',
                });
            }

            if (!channel.permissionsFor(interaction.client.user).has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
                return await interaction.editReply({
                    content: '❌ Não tenho permissões para enviar mensagens e/ou embeds no canal configurado! Preciso de: `Enviar Mensagens` e `Incorporar Links`.',
                });
            }

            const embedColor = resolveDisplayColor(guild.color, globalConfig); 
            const embed = new EmbedBuilder()
                .setTitle(`🏰 ${guild.name}`)
                .setColor(embedColor) 
                .setDescription(guild.description || 'Nova guilda registrada no sistema!') 
                .addFields(
                    { name: '👑 Líder', value: `<@${guild.leader.id}>`, inline: true },
                    { name: '⭐ Vice-Líder', value: guild.coLeader ? `<@${guild.coLeader.id}>` : '*Não definido*', inline: true },
                    { name: '📅 Registrada', value: `<t:${Math.floor(new Date(guild.createdAt).getTime() / 1000)}:R>`, inline: true }
                );

            const mainRosterText = (guild.mainRoster && guild.mainRoster.length > 0) ? 
                                         guild.mainRoster.map((p, index) => `${index + 1}. <@${p.id}>`).join('\n') : 
                                         '*Será definido posteriormente*';
            embed.addFields({ name: '🛡️ Roster Principal', value: mainRosterText, inline: true });

            const subRosterText = (guild.subRoster && guild.subRoster.length > 0) ? 
                                         guild.subRoster.map((p, index) => `${index + 1}. <@${p.id}>`).join('\n') : 
                                         '*Será definido posteriormente*';
            embed.addFields({ name: '⚔️ Roster Reserva', value: subRosterText, inline: true });

            if (guild.logo) {
                embed.setThumbnail(guild.logo);
            }
            if (guild.banner) {
                embed.setImage(guild.banner);
            }

            if (guild.createdBy) {
                embed.addFields({
                    name: '📝 Registrada por',
                    value: `<@${guild.createdBy}>`,
                    inline: false
                });
            }
            
            embed.setFooter({ text: `Use /visualizar ${guild.name} para ver detalhes completos` })
                 .setTimestamp();

            const message = await channel.send({ 
                content: ``,
                embeds: [embed] 
            });

            // Envia log da ação de envio de card de guilda para canal de texto
            await sendLogMessage( 
                client, globalConfig, interaction, 
                'Envio de Card de Guilda (Canal Texto)', 
                `O card da guilda **${guild.name}** foi enviado no canal <#${channel.id}>.`,
                [
                    { name: 'Guilda Enviada', value: guild.name, inline: true },
                    { name: 'Canal de Destino', value: `<#${channel.id}>`, inline: true },
                    { name: 'Link da Mensagem', value: `[Clique aqui](${message.url})`, inline: false },
                ]
            );

            await interaction.editReply({
                content: `✅ Guilda **${guild.name}** enviada com sucesso no canal <#${channel.id}>!\n\n[📩 Ver mensagem](${message.url})`,
            });

            console.log(`📤 Guilda "${guild.name}" enviada por ${interaction.user.username} (${interaction.user.id}) no canal ${channel.name}`);

        } catch (error) {
            console.error('❌ Erro ao enviar guilda para canal de texto:', error);

            let errorMessage = '❌ Ocorreu um erro ao tentar enviar a guilda no canal configurado!';

            if (error.code === 10003) { 
                errorMessage = '❌ O canal configurado não foi encontrado ou foi deletado! Use `/definir-canal` para reconfigurar.';
            } else if (error.code === 50013) { 
                errorMessage = '❌ Não tenho permissões para enviar mensagens e/ou embeds no canal configurado! Preciso de: `Enviar Mensagens` e `Incorporar Links`.';
            } else if (error.message.includes('Cannot read properties of null (reading \'id\')') && error.stack.includes('coLeader')) {
                 errorMessage = '❌ Erro: O vice-líder da guilda não está definido no banco de dados. Por favor, edite a guilda.';
            }

            await interaction.editReply({
                content: errorMessage,
            });
        }
    },
};
