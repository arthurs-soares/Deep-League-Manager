const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('add')
        .setDescription('Adiciona usuários à thread atual.')
        .addUserOption(option =>
            option.setName('usuario1')
                .setDescription('O primeiro usuário a adicionar à thread.')
                .setRequired(true))
        .addUserOption(option =>
            option.setName('usuario2')
                .setDescription('O segundo usuário a adicionar (opcional).')
                .setRequired(false))
        .addUserOption(option =>
            option.setName('usuario3')
                .setDescription('O terceiro usuário a adicionar (opcional).')
                .setRequired(false))
        .addUserOption(option =>
            option.setName('usuario4')
                .setDescription('O quarto usuário a adicionar (opcional).')
                .setRequired(false))
        .addUserOption(option =>
            option.setName('usuario5')
                .setDescription('O quinto usuário a adicionar (opcional).')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads) // Sugere que apenas quem pode gerenciar threads use
        .setDMPermission(false), // Comando não funciona em DMs

    async execute(interaction, client) { // 'client' é passado pelo seu interactionHandler
        // Verifica se o comando foi usado dentro de uma thread
        if (!interaction.channel || !interaction.channel.isThread()) {
            return interaction.reply({
                content: '❌ Este comando só pode ser usado dentro de uma thread.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const thread = interaction.channel;
        const usersToProcess = [];

        // Coleta todos os usuários fornecidos nas opções
        for (let i = 1; i <= 5; i++) {
            const user = interaction.options.getUser(`usuario${i}`);
            if (user) {
                // Evita adicionar o próprio bot
                if (user.id === client.user.id) {
                    // console.log(`[ADD COMMAND] Skipping bot user: ${user.tag}`); // Log opcional
                    continue;
                }
                usersToProcess.push(user);
            }
        }

        if (usersToProcess.length === 0) {
            return interaction.reply({
                content: 'ℹ️ Nenhum usuário válido foi especificado para adicionar (além do próprio bot).',
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const addedUsers = [];
        const alreadyInThreadUsers = [];
        const failedToAddUsers = [];

        for (const user of usersToProcess) {
            try {
                // Verifica se o usuário já é membro da thread
                if (thread.members.cache.has(user.id)) {
                    alreadyInThreadUsers.push(user.tag);
                    continue;
                }
                await thread.members.add(user.id);
                addedUsers.push(user.tag);
            } catch (error) {
                console.error(`Falha ao adicionar ${user.tag} à thread ${thread.id}:`, error);
                failedToAddUsers.push(user.tag);
            }
        }

        // Construindo o Embed para a resposta
        const resultEmbed = new EmbedBuilder()
            .setTitle('✨ Resultado da Adição à Thread ✨')
            // Tenta usar a função de resolução de cor do seu handler.
            // Se globalConfig não for passada para execute, client.guildPanelHandlers.resolveDisplayColor pode precisar
            // buscar globalConfig de client ou usar um fallback interno.
            // Para este exemplo, assumimos que resolveDisplayColor pode lidar com globalConfig sendo undefined
            // ou você pode ajustar para passar globalConfig para esta função execute.
            .setColor(client.guildPanelHandlers?.resolveDisplayColor?.(interaction, null) || '#0099ff') // Passando interaction para contexto se necessário
            .setTimestamp();

        let descriptionLines = [];

        if (addedUsers.length > 0) {
            descriptionLines.push(`✅ **Adicionados:** ${addedUsers.join(', ')}`);
        }
        if (alreadyInThreadUsers.length > 0) {
            descriptionLines.push(`👍 **Já estavam na thread:** ${alreadyInThreadUsers.join(', ')}`);
        }
        if (failedToAddUsers.length > 0) {
            descriptionLines.push(`❌ **Falha ao adicionar:** ${failedToAddUsers.join(', ')}`);
            descriptionLines.push(`*Verifique as permissões do bot e se os usuários podem ser adicionados.*`);
        }
        
        if (descriptionLines.length === 0) { // Se nenhuma das condições acima for atendida
             if (usersToProcess.length > 0 && alreadyInThreadUsers.length === usersToProcess.length) {
                // Todos os usuários especificados já estavam na thread
                descriptionLines.push('ℹ️ Todos os usuários especificados já estavam na thread.');
            } else {
                // Caso genérico se nenhuma outra mensagem se aplicar (ex: todos eram o bot)
                descriptionLines.push('ℹ️ Nenhum usuário novo foi adicionado ou processado.');
            }
        }


        resultEmbed.setDescription(descriptionLines.join('\n\n')); // Junta as linhas com um espaço maior

        await interaction.editReply({ embeds: [resultEmbed] });
    },
};
