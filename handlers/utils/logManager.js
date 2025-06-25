// handlers/utils/logManager.js
// Módulo para centralizar o envio de mensagens de log para um canal específico no Discord.

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

/**
 * Envia uma mensagem de log para o canal de logs configurado.
 * A mensagem de log incluirá detalhes da ação e do usuário que a executou,
 * e tentará capturar o contexto do privilégio do usuário.
 * @param {Client} client - A instância do bot Discord.js.
 * @param {Object} globalConfig - Objeto de configuração global do bot (contém logChannelId e roles).
 * @param {Interaction} interaction - Objeto de interação original que disparou a ação (para contexto de usuário/guilda).
 * @param {string} actionType - O tipo de ação realizada (ex: "Registro de Guilda", "Edição de Perfil").
 * @param {string} description - Uma breve descrição da ação.
 * @param {Array<Object>} fields - Campos adicionais para o embed de log (ex: [{ name: 'Guilda', value: 'Nome' }]).
 */
async function sendLogMessage(client, globalConfig, interaction, actionType, description, fields = []) {
    const logChannelId = globalConfig.logChannelId;

    // Se o canal de log não estiver configurado, apenas avisa no console e não envia.
    if (!logChannelId) {
        console.warn('⚠️ [LogManager] Canal de log não configurado em config.json. Nenhuma mensagem de log será enviada.');
        return;
    }

    try {
        // Busca o canal de log pelo ID.
        const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
        if (!logChannel) {
            console.error(`❌ [LogManager] Canal de log (ID: ${logChannelId}) não encontrado ou inacessível. Verifique as permissões do bot.`);
            return;
        }

        // Verifica se o bot tem permissão para enviar mensagens e embeds no canal de log.
        if (!logChannel.permissionsFor(client.user).has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
            console.error(`❌ [LogManager] Bot sem permissão para enviar mensagens e/ou embeds no canal de log (${logChannel.name}).`);
            return;
        }

        // Determina o contexto de privilégio do usuário que executou a ação para o log.
        let userRoleContext = 'Usuário Padrão';
        if (interaction.member?.permissions.has(PermissionFlagsBits.Administrator)) {
            userRoleContext = 'Administrador';
        } else if (globalConfig.moderatorRoles && interaction.member?.roles.cache.some(roleId => globalConfig.moderatorRoles.includes(roleId))) {
            userRoleContext = 'Moderador Geral';
        } else if (globalConfig.scoreOperatorRoles && interaction.member?.roles.cache.some(roleId => globalConfig.scoreOperatorRoles.includes(roleId))) {
            userRoleContext = 'Operador de Score';
        }

        // Cria o embed de log.
        const logEmbed = new EmbedBuilder()
            .setTitle(`🗒️ Ação de ${userRoleContext}`) // Título dinâmico baseado no cargo do usuário.
            .setColor(globalConfig.embedColor || '#0099ff') // Usa a cor de embed global.
            .setDescription(description)
            .addFields(
                { name: 'Usuário', value: `${interaction.user?.tag || interaction.user?.username} (${interaction.user?.id})`, inline: true },
                { name: 'Ação', value: actionType, inline: true },
                { name: 'Comando/ID de Interação', value: interaction.commandName || interaction.customId || 'N/A', inline: true},
                { name: 'Canal de Execução', value: interaction.channel ? `<#${interaction.channel.id}>` : 'DM/N/A', inline: true },
            );
        
        // Adiciona o servidor se a interação ocorreu em um (e não em DM).
        if (interaction.guild) {
            logEmbed.addFields({ name: 'Servidor', value: `${interaction.guild.name} (${interaction.guild.id})`, inline: true });
        }

        // Adiciona campos adicionais específicos da ação, se fornecidos.
        if (fields.length > 0) {
            logEmbed.addFields(fields);
        }

        logEmbed.setTimestamp(); // Adiciona um carimbo de data/hora ao embed.

        // Envia a mensagem de log para o canal.
        await logChannel.send({ embeds: [logEmbed] });
        console.log(`✅ [LogManager] Ação de log enviada para o canal ${logChannel.name}: ${actionType}`);

    } catch (error) {
        // Loga qualquer erro que ocorra ao tentar enviar a mensagem de log.
        console.error('❌ [LogManager] Erro ao enviar mensagem de log:', error);
    }
}

module.exports = {
    sendLogMessage,
};
