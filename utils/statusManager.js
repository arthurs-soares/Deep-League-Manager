// utils/statusManager.js
// Módulo para gerenciar a atividade (status) do bot no Discord.

const { ActivityType, PresenceUpdateStatus } = require('discord.js');

// Lista de status predefinidos para rotação.
const statusList = [
    { name: 'Deep League Brasil', type: ActivityType.Watching },
    { name: 'Gerenciando guildas', type: ActivityType.Playing },
];

let currentStatusIndex = 0; // Índice do status atual na lista.

/**
 * Atualiza o status do bot no Discord.
 * Rota o status entre uma lista predefinida e inclui a contagem de servidores.
 * Esta função é projetada para ser chamada periodicamente.
 * @param {Client} client - A instância do bot Discord.js.
 */
function updateStatus(client) {
    // Garante que o cliente do bot está pronto e tem um usuário.
    if (!client.user) return;

    // Adiciona um status dinâmico com a contagem de servidores.
    const serverCountStatus = { name: `${client.guilds.cache.size} servidores`, type: ActivityType.Watching };
    // Combina a lista predefinida com o status da contagem de servidores.
    const allStatuses = [...statusList, serverCountStatus];

    // Obtém o status atual da lista.
    const status = allStatuses[currentStatusIndex];

    // Define a presença do bot no Discord.
    client.user.setPresence({
        activities: [{ name: status.name, type: status.type }],
        status: PresenceUpdateStatus.Online // Define o status como online.
    });

    // Avança para o próximo status na lista (circular).
    currentStatusIndex = (currentStatusIndex + 1) % allStatuses.length;
}

module.exports = {
    updateStatus,
};
