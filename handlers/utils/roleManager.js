// handlers/utils/roleManager.js
// Módulo para gerenciar cargos (roles) de membros em um servidor Discord.

/**
 * Atribui ou remove um cargo específico de um usuário em uma guilda Discord.
 * Inclui verificações de permissão e hierarquia de cargos do bot.
 * @param {Client} client - A instância do bot Discord.js.
 * @param {string} guildDiscordId - O ID do servidor Discord onde a operação será realizada.
 * @param {string} userId - O ID do usuário Discord.
 * @param {string} roleId - O ID do cargo a ser atribuído/removido.
 * @param {boolean} assign - true para atribuir o cargo, false para remover.
 * @returns {Promise<boolean>} True se a operação foi bem-sucedida ou o estado já era o desejado, false se houve erro.
 */
async function manageGuildRole(client, guildDiscordId, userId, roleId, assign) {
    // Valida parâmetros essenciais.
    if (!client || !guildDiscordId || !userId || !roleId) {
        console.warn("⚠️ [RoleManager] Parâmetros faltando para manageGuildRole. Ignorando.");
        return false;
    }
    
    try {
        // Busca a guilda (servidor) pelo ID.
        const guild = await client.guilds.fetch(guildDiscordId);
        if (!guild) {
            console.warn(`⚠️ [RoleManager] Guilda Discord (Servidor) com ID ${guildDiscordId} não encontrada. Não é possível gerenciar cargos.`);
            return false;
        }

        // Busca o membro dentro da guilda.
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
            console.warn(`⚠️ [RoleManager] Membro com ID ${userId} não encontrado na guilda Discord '${guild.name}' (${guildDiscordId}). Não é possível gerenciar cargos.`);
            return false;
        }

        // Busca o cargo pela ID.
        let role = guild.roles.cache.get(roleId);
        if (!role) {
            // Tenta buscar o cargo se não estiver no cache (pode ter sido criado recentemente).
            try {
                role = await guild.roles.fetch(roleId);
                if (!role) { // Se ainda não encontrou o cargo, desiste.
                    console.warn(`⚠️ [RoleManager] Cargo com ID ${roleId} não pôde ser encontrado/buscado. Não é possível gerenciar cargos.`);
                    return false;
                }
            } catch (fetchError) {
                console.error(`❌ [RoleManager] Erro ao buscar cargo ${roleId}:`, fetchError);
                return false;
            }
        }

        // CRÍTICO: Verifica a hierarquia de cargos. O cargo do bot deve estar acima do cargo a ser gerenciado.
        if (role.position >= guild.members.me.roles.highest.position) {
            console.warn(`⚠️ [RoleManager] Cargo '${role.name}' (ID: ${roleId}) está acima ou no mesmo nível que o cargo mais alto do bot. Não é possível gerenciar devido à hierarquia.`);
            // Opcional: Notificar o usuário sobre a falha de permissão aqui.
            return false;
        }

        // Lógica para atribuir ou remover o cargo.
        if (assign) {
            if (!member.roles.cache.has(roleId)) {
                await member.roles.add(role, `Definido como líder/co-líder da guilda via bot.`);
                console.log(`✅ [RoleManager] Cargo '${role.name}' atribuído a ${member.user.tag} na guilda '${guild.name}'.`);
                return true;
            } else {
                // console.log(`ℹ️ [RoleManager] Cargo '${role.name}' já atribuído a ${member.user.tag}.`);
            }
        } else { // Remove
            if (member.roles.cache.has(roleId)) {
                await member.roles.remove(role, `Removido como líder/co-líder da guilda via bot.`);
                console.log(`✅ [RoleManager] Cargo '${role.name}' removido de ${member.user.tag} na guilda '${guild.name}'.`);
                return true;
            } else {
                // console.log(`ℹ️ [RoleManager] Cargo '${role.name}' já removido de ${member.user.tag}.`);
            }
        }
        return true; // Retorna true se a operação foi bem-sucedida ou o estado desejado já existia.
    } catch (error) {
        console.error(`❌ [RoleManager] Erro fatal ao gerenciar cargo (${assign ? 'atribuir' : 'remover'} ${roleId}) para ${userId} na guilda ${guildDiscordId}:`, error);
        return false;
    }
}

/**
 * Atribui/Remove o cargo de Líder de Guilda.
 * @param {Client} client - A instância do bot Discord.js.
 * @param {string} guildDiscordId - O ID do servidor Discord.
 * @param {string} userId - O ID do usuário Discord.
 * @param {boolean} assign - True para atribuir, false para remover.
 * @param {Object} globalConfig - Configurações globais do bot (contém guildLeaderRoleId).
 */
async function manageLeaderRole(client, guildDiscordId, userId, assign, globalConfig) { 
    // Chama a função genérica de gerenciamento de cargo com o ID da role de líder.
    return manageGuildRole(client, guildDiscordId, userId, globalConfig.guildLeaderRoleId, assign); 
}

/**
 * Atribui/Remove o cargo de Co-Líder de Guilda.
 * @param {Client} client - A instância do bot Discord.js.
 * @param {string} guildDiscordId - O ID do servidor Discord.
 * @param {string} userId - O ID do usuário Discord.
 * @param {boolean} assign - True para atribuir, false para remover.
 * @param {Object} globalConfig - Configurações globais do bot (contém guildCoLeaderRoleId).
 */
async function manageCoLeaderRole(client, guildDiscordId, userId, assign, globalConfig) { 
    // Chama a função genérica de gerenciamento de cargo com o ID da role de co-líder.
    return manageGuildRole(client, guildDiscordId, userId, globalConfig.guildCoLeaderRoleId, assign); 
}

/**
 * Limpa os cargos de liderança de um membro específico, removendo ambos os cargos
 * se ele não for líder ou co-líder de NENHUMA guilda mais (verificado via findGuildByLeaderFunction).
 * @param {Client} client - A instância do bot Discord.js.
 * @param {string} guildDiscordId - O ID do servidor Discord.
 * @param {string} userId - O ID do usuário Discord.
 * @param {Object} globalConfig - Configurações globais do bot.
 * @param {function} findGuildByLeaderFunction - A função findGuildByLeader do guildDb a ser usada para verificar a liderança.
 */
async function cleanUpLeadershipRoles(client, guildDiscordId, userId, globalConfig, findGuildByLeaderFunction) { 
    // Valida se todos os parâmetros necessários e a função de callback foram fornecidos.
    if (!client || !guildDiscordId || !userId || !globalConfig.guildLeaderRoleId || !globalConfig.guildCoLeaderRoleId || typeof findGuildByLeaderFunction !== 'function') {
        console.warn("⚠️ [RoleManager] Faltando dados ou função findGuildByLeaderFunction para limpar cargos. Ignorando.");
        return;
    }

    try {
        // Tenta buscar o membro.
        const member = await client.guilds.fetch(guildDiscordId).then(g => g.members.fetch(userId)).catch(() => null);
        if (!member) return; // Se o membro não for encontrado, não há cargos para limpar.

        // Verifica se o usuário é líder ou co-líder em qualquer guilda através da função fornecida.
        const isLeaderOrCoLeaderInAnyGuild = await findGuildByLeaderFunction(userId); 

        // Se o usuário não é mais líder ou co-líder em nenhuma guilda, remove os cargos.
        if (!isLeaderOrCoLeaderInAnyGuild) {
            if (globalConfig.guildLeaderRoleId && member.roles.cache.has(globalConfig.guildLeaderRoleId)) {
                await manageLeaderRole(client, guildDiscordId, userId, false, globalConfig); // Remove cargo de líder.
            }
            if (globalConfig.guildCoLeaderRoleId && member.roles.cache.has(globalConfig.guildCoLeaderRoleId)) {
                await manageCoLeaderRole(client, guildDiscordId, userId, false, globalConfig); // Remove cargo de co-líder.
            }
        }

    } catch (error) {
        console.error(`❌ [RoleManager] Erro ao limpar cargos de liderança para ${userId}:`, error);
    }
}

module.exports = {
    manageLeaderRole,
    manageCoLeaderRole,
    cleanUpLeadershipRoles, 
};
