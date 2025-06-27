// commands/editar.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { loadGuildByName, saveGuildData } = require('../handlers/db/guildDb');
const { sendLogMessage, manageGuildForumPost, resolveDisplayColor, isUserInAnyGuild, saveConfig } = require('../handlers'); 


const COOLDOWN_DAYS = 3;

// Função auxiliar para formatar a duração do cooldown
function formatDuration(ms) {
    if (ms <= 0) return "alguns instantes";

    const totalSeconds = Math.floor(ms / 1000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    const days = Math.floor(totalHours / 24);

    const hours = totalHours % 24;
    const minutes = totalMinutes % 60;

    let parts = [];
    if (days > 0) parts.push(`${days} dia${days > 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hora${hours > 1 ? 's' : ''}`);
    if (minutes > 0 && (days === 0 || hours === 0)) { // Mostrar minutos se dias ou horas for 0
        parts.push(`${minutes} minuto${minutes > 1 ? 's' : ''}`);
    }
    
    if (parts.length === 0) return "menos de um minuto";
    return parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' e ' + parts.slice(-1);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('editar')
        .setDescription('Edita informações de uma guilda. Líderes podem editar perfil e rosters; Moderadores TUDO.')
        .addStringOption(option =>
            option.setName('guilda')
                .setDescription('O nome EXATO da guilda a ser editada')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('novo-nome')
                .setDescription('Novo nome EXATO para a guilda (apenas moderadores)')
                .setRequired(false)
                .setMaxLength(50))
        .addUserOption(option =>
            option.setName('novo-vice-lider')
                .setDescription('O @ do novo vice-líder, ou deixe vazio para remover')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('main')
                .setDescription('IDs dos membros do Roster Principal (separados por vírgula ou menções)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('sub')
                .setDescription('IDs dos membros do Roster Reserva (separados por vírgula ou menções)')
                .setRequired(false))
        .addAttachmentOption(option =>
            option.setName('logo')
                .setDescription('Anexo de imagem para a nova logo (ou deixe vazio para remover)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('descricao')
                .setDescription('Nova descrição da guilda (até 500 caracteres, deixe vazio para remover)')
                .setRequired(false)
                .setMaxLength(500))
        .addStringOption(option =>
            option.setName('link')
                .setDescription('Novo link para a guilda (URL, deixe vazio para remover)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('cor')
                .setDescription('Nova cor para os embeds da guilda (Hex: #RRGGBB, ou nome: red, blue, random)')
                .setRequired(false)),

    async execute(interaction, client, globalConfig) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guildName = interaction.options.getString('guilda');
        let guild = await loadGuildByName(guildName);

        if (!guild) {
            return await interaction.editReply({ content: `❌ Guilda "${guildName}" não encontrada no banco de dados!` });
        }

        const isModerator = interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                            (globalConfig.moderatorRoles && globalConfig.moderatorRoles.some(roleId => interaction.member.roles.cache.has(roleId)));
        const isLeader = guild.leader && guild.leader.id === interaction.user.id;
        const isCoLeader = guild.coLeader && guild.coLeader.id === interaction.user.id;

        if (!isModerator && !isLeader && !isCoLeader) {
            return await interaction.editReply({ content: '❌ Você não tem permissão para editar esta guilda! Apenas líderes, vice-líderes ou moderadores.' });
        }

        let changesMade = false;
        const oldGuild = { ...guild }; // Copia a guilda antes das mudanças para log

        // 1. Edição de Nome (Apenas Moderadores)
        const newName = interaction.options.getString('novo-nome');
        if (newName && newName !== guild.name) {
            if (!isModerator) {
                return await interaction.editReply({ content: '❌ Apenas moderadores podem alterar o nome da guilda!' });
            }
            const existingGuildWithNewName = await loadGuildByName(newName);
            if (existingGuildWithNewName) {
                return await interaction.editReply({ content: `❌ Já existe uma guilda com o nome "${newName}"!` });
            }
            guild.name = newName;
            changesMade = true;
        }

        // 2. Edição de Vice-Líder
        const newCoLeader = interaction.options.getUser('novo-vice-lider');
        if (newCoLeader !== null) { // Se o usuário forneceu um valor (mesmo que vazio para remover)
            if (!isModerator && !isLeader) {
                return await interaction.editReply({ content: '❌ Apenas líderes ou moderadores podem alterar o vice-líder da guilda!' });
            }
            if (newCoLeader && newCoLeader.id === guild.leader.id) {
                return await interaction.editReply({ content: '❌ O vice-líder não pode ser o mesmo que o líder!' });
            }

            // Verificação de elegibilidade do novo vice-líder (se houver)
            if (newCoLeader) {
                const userInGuild = await isUserInAnyGuild(newCoLeader.id);
                if (userInGuild && userInGuild.name !== guild.name) {
                    return interaction.editReply({ content: `❌ O usuário ${newCoLeader.toString()} já está na guilda **${userInGuild.name}** e não pode ser vice-líder desta!` });
                }
                const recentlyLeftUser = globalConfig.recentlyLeftUsers.find(u => u.userId === newCoLeader.id);
                if (recentlyLeftUser) {
                    const leaveTime = new Date(recentlyLeftUser.leaveTimestamp).getTime();
                    const now = Date.now();
                    const cooldownPeriodMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
                    const cooldownEndTime = leaveTime + cooldownPeriodMs;

                    if (now < cooldownEndTime) {
                        const remainingTimeMs = cooldownEndTime - now;
                        const remainingTimeString = formatDuration(remainingTimeMs);
                        return interaction.editReply({ content: `❌ O usuário ${newCoLeader.toString()} está em cooldown e precisa esperar mais ${remainingTimeString} para se tornar vice-líder desta guilda!` });
                    }
                }
            }

            // Aplica as mudanças
            const oldCoLeaderId = guild.coLeader?.id;
            guild.coLeader = newCoLeader ? { id: newCoLeader.id, username: newCoLeader.username } : null;
            changesMade = true;

            // Remove do cooldown se foi adicionado com sucesso
            if (newCoLeader) {
                globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== newCoLeader.id);
                await saveConfig(globalConfig);
            }
            // Adiciona ao cooldown se foi removido
            if (oldCoLeaderId && !newCoLeader) {
                 const now = new Date();
                globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== oldCoLeaderId);
                globalConfig.recentlyLeftUsers.push({ userId: oldCoLeaderId, leaveTimestamp: now.toISOString() });
                const threeDaysAgo = new Date(now - (COOLDOWN_DAYS * 24 * 60 * 60 * 1000));
                globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => new Date(u.leaveTimestamp) > threeDaysAgo);
                await saveConfig(globalConfig);
            }
        }
        
        // 3. Edição de Roster Principal
        const mainRosterInput = interaction.options.getString('main');
        if (mainRosterInput !== null) {
            if (!isModerator && !isLeader && !isCoLeader) {
                return await interaction.editReply({ content: '❌ Você não tem permissão para editar os rosters da guilda!' });
            }
            // Acessa processRosterInput diretamente de rosterHandlers.js
            const { processRosterInput } = require('../handlers/panel/rosterHandlers');
            const { memberIds: newMainIds, errors: mainErrors } = processRosterInput(mainRosterInput);
            if (mainErrors.length > 0) {
                return await interaction.editReply({ content: `❌ Erros no Roster Principal:\n${mainErrors.join('\n')}` });
            }
            
            // Lógica de cooldown: identificar removidos e checar elegibilidade para novos
            const oldMainIds = guild.mainRoster.map(m => m.id);
            const playersRemovedFromMain = oldMainIds.filter(id => !newMainIds.includes(id));
            const playersAddedToMain = newMainIds.filter(id => !oldMainIds.includes(id));

            // Para jogadores removidos, aplicar cooldown apenas se não estiverem no sub-roster ou na liderança
            const now = Date.now();
            const threeDaysAgo = new Date(now - (COOLDOWN_DAYS * 24 * 60 * 60 * 1000));
            
            for (const removedId of playersRemovedFromMain) {
                if (!guild.subRoster.some(m => m.id === removedId) && removedId !== guild.leader?.id && removedId !== guild.coLeader?.id) {
                    globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== removedId);
                    globalConfig.recentlyLeftUsers.push({ userId: removedId, leaveTimestamp: now.toISOString() });
                }
            }

            // Para jogadores adicionados, verificar cooldown e outras guildas
            for (const addedId of playersAddedToMain) {
                const userInGuild = await isUserInAnyGuild(addedId);
                if (userInGuild && userInGuild.name !== guild.name) {
                    return interaction.editReply({ content: `❌ O usuário <@${addedId}> já está na guilda "${userInGuild.name}" e não pode ser adicionado ao roster!` });
                }
                const recentlyLeftUser = globalConfig.recentlyLeftUsers.find(u => u.userId === addedId);
                if (recentlyLeftUser) {
                    const leaveTime = new Date(recentlyLeftUser.leaveTimestamp).getTime();
                    // 'now' e 'cooldownPeriodMs' já definidos acima no loop ou podem ser recalculados aqui
                    const cooldownPeriodMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
                    const cooldownEndTime = leaveTime + cooldownPeriodMs;
                    if (now < cooldownEndTime) {
                        const remainingTimeMs = cooldownEndTime - now;
                        const remainingTimeString = formatDuration(remainingTimeMs);
                        return interaction.editReply({ content: `❌ O usuário <@${addedId}> está em cooldown e precisa esperar mais ${remainingTimeString} para entrar nesta guilda!` });
                    }
                }
                globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== addedId);
            }
            await saveConfig(globalConfig); // Salva a config atualizada

            guild.mainRoster = newMainIds.map(id => ({ id: id, username: client.users.cache.get(id)?.username || 'Desconhecido' }));
            changesMade = true;
        }

        // 4. Edição de Roster Reserva (similar ao principal)
        const subRosterInput = interaction.options.getString('sub');
        if (subRosterInput !== null) {
            if (!isModerator && !isLeader && !isCoLeader) {
                return await interaction.editReply({ content: '❌ Você não tem permissão para editar os rosters da guilda!' });
            }
            // Acessa processRosterInput diretamente de rosterHandlers.js
            const { processRosterInput } = require('../handlers/panel/rosterHandlers');
            const { memberIds: newSubIds, errors: subErrors } = processRosterInput(subRosterInput);
            if (subErrors.length > 0) {
                return await interaction.editReply({ content: `❌ Erros no Roster Reserva:\n${subErrors.join('\n')}` });
            }

            const oldSubIds = guild.subRoster.map(m => m.id);
            const playersRemovedFromSub = oldSubIds.filter(id => !newSubIds.includes(id));
            const playersAddedToSub = newSubIds.filter(id => !oldSubIds.includes(id));

            const now = Date.now();
            const threeDaysAgo = new Date(now - (COOLDOWN_DAYS * 24 * 60 * 60 * 1000));

            for (const removedId of playersRemovedFromSub) {
                if (!guild.mainRoster.some(m => m.id === removedId) && removedId !== guild.leader?.id && removedId !== guild.coLeader?.id) {
                    globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== removedId);
                    globalConfig.recentlyLeftUsers.push({ userId: removedId, leaveTimestamp: now.toISOString() });
                }
            }

            for (const addedId of playersAddedToSub) {
                const userInGuild = await isUserInAnyGuild(addedId);
                if (userInGuild && userInGuild.name !== guild.name) {
                    return interaction.editReply({ content: `❌ O usuário <@${addedId}> já está na guilda "${userInGuild.name}" e não pode ser adicionado ao roster!` });
                }
                const recentlyLeftUser = globalConfig.recentlyLeftUsers.find(u => u.userId === addedId);
                if (recentlyLeftUser) {
                    const leaveTime = new Date(recentlyLeftUser.leaveTimestamp).getTime();
                    // 'now' e 'cooldownPeriodMs' já definidos acima no loop ou podem ser recalculados aqui
                    const cooldownPeriodMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
                    const cooldownEndTime = leaveTime + cooldownPeriodMs;
                    if (now < cooldownEndTime) {
                        const remainingTimeMs = cooldownEndTime - now;
                        const remainingTimeString = formatDuration(remainingTimeMs);
                        return interaction.editReply({ content: `❌ O usuário <@${addedId}> está em cooldown e precisa esperar mais ${remainingTimeString} para entrar nesta guilda!` });
                    }
                }
                globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== addedId);
            }
            await saveConfig(globalConfig);

            guild.subRoster = newSubIds.map(id => ({ id: id, username: client.users.cache.get(id)?.username || 'Desconhecido' }));
            changesMade = true;
        }


        // 5. Edição de Logo, Descrição, Link, Cor, Banner (Permissão para Líder/Co-Líder)
        const newLogo = interaction.options.getAttachment('logo');
        if (newLogo !== null) {
            if (!newLogo.contentType.startsWith('image/')) {
                 return await interaction.editReply({ content: '❌ O anexo da logo deve ser uma imagem!' });
            }
            guild.logo = newLogo.url;
            changesMade = true;
        } else if (interaction.options.get('logo')?.value === '') { // Se o usuário esvaziou o campo
             guild.logo = null;
             changesMade = true;
        }

        const newDescription = interaction.options.getString('descricao');
        if (newDescription !== null) {
            if (newDescription !== guild.description) {
                guild.description = newDescription || null;
                changesMade = true;
            }
        }

        const newLink = interaction.options.getString('link');
        if (newLink !== null) {
            if (newLink !== guild.link) {
                // Validação simples de URL
                try { 
                    if (newLink !== '') new URL(newLink); 
                } catch (e) { 
                    if (newLink !== '') return await interaction.editReply({ content: '❌ O link fornecido é inválido. Certifique-se de que é uma URL completa (ex: `https://discord.gg/minhaguilda`).' }); 
                }
                guild.link = newLink || null;
                changesMade = true;
            }
        }

        const newColor = interaction.options.getString('cor');
        if (newColor !== null) {
            if (newColor !== guild.color) { // Somente muda se for diferente
                const resolvedColor = resolveDisplayColor(newColor, globalConfig); 
                // Se a cor resolvida é a default, mas o input não é 'random' nem a cor atual, E não é um hex válido
                if (resolvedColor === globalConfig.embedColor && newColor.toLowerCase() !== 'random' && !/^#([0-9A-F]{3}){1,2}$/i.test(newColor)) {
                    // A cor não é um hex válido, não é um nome conhecido, nem "random".
                    // E a função resolveDisplayColor a retornou como default, o que pode ser um erro de input.
                     return await interaction.editReply({ content: '❌ Cor inválida. Use um código hexadecimal (ex: `#FF0000`), um nome de cor padrão (ex: `red`, `blue`), ou `random`.' });
                }
                guild.color = newColor; // Salva a string original para consistência
                changesMade = true;
            }
        }

        guild.updatedAt = new Date().toISOString();
        guild.updatedBy = interaction.user.id;

        if (!changesMade) {
            return await interaction.editReply({ content: 'ℹ️ Nenhuma alteração detectada. Por favor, forneça pelo menos uma opção para editar.' });
        }

        await saveGuildData(guild);

        // NOVO: Atualizar o post no fórum da guilda
        await manageGuildForumPost(client, guild, globalConfig, 'update', interaction);

        client.emit('updateLeaderboard');

        // Construir mensagem de log detalhada
        let logDescription = `A guilda **${guild.name}** foi editada.`;
        const logFields = [
            { name: 'Nome Antigo', value: oldGuild.name, inline: true },
            { name: 'Nome Novo', value: guild.name, inline: true },
            { name: 'Editado por', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Roster Principal Antigo', value: oldGuild.mainRoster.map(p => `<@${p.id}>`).join(', ') || 'N/A', inline: false },
            { name: 'Roster Principal Novo', value: guild.mainRoster.map(p => `<@${p.id}>`).join(', ') || 'N/A', inline: false },
            { name: 'Roster Reserva Antigo', value: oldGuild.subRoster.map(p => `<@${p.id}>`).join(', ') || 'N/A', inline: false },
            { name: 'Roster Reserva Novo', value: guild.subRoster.map(p => `<@${p.id}>`).join(', ') || 'N/A', inline: false },
            { name: 'Vice-Líder Antigo', value: oldGuild.coLeader ? `<@${oldGuild.coLeader.id}>` : 'N/A', inline: true },
            { name: 'Vice-Líder Novo', value: guild.coLeader ? `<@${guild.coLeader.id}>` : 'N/A', inline: true },
            { name: 'Logo Antiga', value: oldGuild.logo || 'N/A', inline: false },
            { name: 'Logo Nova', value: guild.logo || 'N/A', inline: false },
            { name: 'Descrição Antiga', value: oldGuild.description || 'N/A', inline: false },
            { name: 'Descrição Nova', value: guild.description || 'N/A', inline: false },
            { name: 'Link Antigo', value: oldGuild.link || 'N/A', inline: false },
            { name: 'Link Novo', value: guild.link || 'N/A', inline: false },
            { name: 'Cor Antiga', value: oldGuild.color || 'N/A', inline: true },
            { name: 'Cor Nova', value: guild.color || 'N/A', inline: true },
        ];

        await sendLogMessage(client, globalConfig, interaction, 'Edição de Guilda', logDescription, logFields);

        const replyEmbed = new EmbedBuilder()
            .setTitle('✅ Guilda Atualizada com Sucesso!')
            .setColor(resolveDisplayColor(guild.color, globalConfig))
            .setDescription(`As informações de **${guild.name}** foram atualizadas!`);

        await interaction.editReply({ embeds: [replyEmbed] });
    },
};
