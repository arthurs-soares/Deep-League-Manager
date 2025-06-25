// handlers/utils/validation.js
// Módulo para funções de validação de permissões e existência de guilda.

const { MessageFlags, PermissionFlagsBits } = require('discord.js');

/**
 * Função utilitária para carregar a guilda e verificar as permissões do usuário interagindo.
 * Esta função é crucial para controlar o acesso às operações da guilda.
 * @param {string} guildIdSafe - ID seguro da guilda (nome minusculo com hífens).
 * @param {Interaction} interaction - Objeto de interação do Discord (para obter o usuário e suas permissões).
 * @param {Object} globalConfig - Objeto de configuração global do bot (para moderatorRoles).
 * @param {Client} client - O objeto Discord.js client (para acesso a guilds/members).
 * @param {function} loadGuildByNameFunction - A função loadGuildByName do guildDb a ser usada (injetada para evitar dependência circular).
 * @param {boolean} requireLeader - Se true, exige que o usuário seja o líder principal da guilda.
 * @param {boolean} allowCoLeader - Se true (e requireLeader for false), permite que o usuário seja o co-líder da guilda.
 * @returns {Promise<Object|null>} A guilda encontrada, ou null se não for encontrada/sem permissão.
 */
async function getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByNameFunction, requireLeader = false, allowCoLeader = true) { 
    const guildName = guildIdSafe.replace(/-/g, ' '); // Converte o ID seguro de volta para o nome original.
    const guild = await loadGuildByNameFunction(guildName); // Carrega a guilda do DB.

    if (!guild) {
        await interaction.reply({ content: '❌ Guilda não encontrada.', ephemeral: true });
        return null;
    }

    // Identifica se o usuário é líder, co-líder ou moderador.
    const isLeader = guild.leader?.id === interaction.user.id;
    const isCoLeader = guild.coLeader?.id === interaction.user.id;
    const isModerator = interaction.member?.permissions.has(PermissionFlagsBits.Administrator) ||
                        (globalConfig.moderatorRoles && interaction.member?.roles.cache.some(roleId => globalConfig.moderatorRoles.includes(roleId)));

    // Se o usuário é um moderador, ele tem permissão total.
    if (isModerator) {
        return guild;
    }

    // Verifica permissões baseadas em `requireLeader` e `allowCoLeader`.
    if (requireLeader && !isLeader) {
        await interaction.reply({ content: '❌ Apenas o líder principal da guilda pode realizar esta ação.', ephemeral: true });
        return null;
    }
    // Se não exige ser líder principal, mas não é líder, verifica se é co-líder (se permitido).
    if (!requireLeader && !isLeader && (!allowCoLeader || !isCoLeader)) {
        await interaction.reply({ content: '❌ Você não tem permissão para realizar esta ação na guilda.', ephemeral: true });
        return null;
    }

    return guild; // Retorna o objeto da guilda se todas as validações passarem.
}

module.exports = {
    getAndValidateGuild,
};
