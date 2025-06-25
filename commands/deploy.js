// commands/deploy.js

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Carrega as variáveis de ambiente do arquivo .env.
require('dotenv').config();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deploy')
        .setDescription('Faz deploy manual dos comandos slash do bot')
        .addBooleanOption(option =>
            option.setName('global')
                .setDescription('Se deve fazer deploy global (padrão: apenas neste servidor)')
                .setRequired(false))
        .addBooleanOption(option => // Nova opção para limpeza.
            option.setName('clean')
                .setDescription('Se deve limpar todos os comandos antes do deploy (ou apenas limpar se for TRUE).')
                .setRequired(false)),

    async execute(interaction) {
        // Verificar permissões (apenas administradores podem usar este comando).
        if (!interaction.member.permissions.has('Administrator')) {
            return await interaction.reply({
                content: '❌ Apenas administradores podem usar este comando!',
                flags: 64 // MessageFlags.Ephemeral
            });
        }

        const isGlobal = interaction.options.getBoolean('global') || false;
        const cleanOnly = interaction.options.getBoolean('clean') || false; // Obtém a flag de limpeza.

        // Resposta inicial efêmera para que o usuário saiba que o comando está a ser processado.
        const loadingEmbed = new EmbedBuilder()
            .setTitle('⏳ Iniciando Deploy...')
            .setDescription('Carregando comandos e preparando operações...')
            .setColor('#ffa500');

        await interaction.reply({
            embeds: [loadingEmbed],
            flags: 64 // MessageFlags.Ephemeral
        });

        try {
            const commands = [];
            const commandsPath = path.join(__dirname);

            // Carregar todos os comandos do diretório 'commands'.
            // Filtra para incluir apenas arquivos .js e exclui o próprio deploy.js.
            const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') && file !== 'deploy.js');

            for (const file of commandFiles) {
                const filePath = path.join(commandsPath, file);
                delete require.cache[require.resolve(filePath)]; // Limpa o cache para garantir que as versões mais recentes dos comandos sejam carregadas.
                const command = require(filePath);

                // Valida se o objeto do comando tem as propriedades 'data' e 'execute' necessárias.
                if ('data' in command && 'execute' in command) {
                    commands.push(command.data.toJSON()); // Adiciona os dados JSON do comando.
                } else {
                    console.warn(`⚠️ O comando em ${filePath} está inválido (não possui as propriedades "data" ou "execute" necessárias).`);
                }
            }

            // Se não houver comandos válidos, mas a flag `cleanOnly` estiver ativa, prossegue com a limpeza.
            if (commands.length === 0 && !cleanOnly) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Erro no Deploy')
                    .setDescription('Nenhum comando válido encontrado para deploy!')
                    .setColor('#ff0000');

                return await interaction.editReply({
                    embeds: [errorEmbed]
                });
            }

            // Configura o cliente REST do Discord.js com a versão da API e o token do bot.
            const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

            const CLIENT_ID = process.env.CLIENT_ID;
            const GUILD_ID = process.env.GUILD_ID;

            if (!CLIENT_ID) {
                throw new Error('CLIENT_ID não definido no .env. Impossível prosseguir com deploy.');
            }

            let deployData;
            let deployLocation;

            // --- ETAPA DE LIMPEZA (prioridade máxima se `cleanOnly` é TRUE) ---
            if (cleanOnly) {
                console.log(`🧹 Limpando todos os comandos...`);
                if (GUILD_ID && !isGlobal) { // Limpeza específica do servidor se GUILD_ID está definido e não é global.
                    console.log(`🧹 Limpando comandos do servidor ${GUILD_ID}...`);
                    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
                    console.log(`✅ Comandos do servidor ${GUILD_ID} limpos com sucesso.`);
                } else { // Limpeza global (se isGlobal é TRUE ou GUILD_ID não está definido).
                    console.log(`🧹 Limpando comandos globais... (Isso pode demorar até 1 hora para aparecer)`);
                    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
                    console.log(`✅ Comandos globais limpos com sucesso. Pode levar até 1 hora para sumirem do Discord.`);
                }
                const cleanEmbed = new EmbedBuilder()
                    .setTitle('🧹 Limpeza Concluída!')
                    .setDescription('Todos os comandos foram removidos. Se você deseja registrar novos comandos, execute `/deploy` novamente sem a opção `clean`.')
                    .setColor('#3498DB');
                await interaction.editReply({ embeds: [cleanEmbed] });
                return; // Sai da execução após a limpeza.
            }

            // --- ETAPA DE DEPLOY (se `cleanOnly` não foi TRUE) ---
            if (isGlobal) {
                deployLocation = 'Globalmente';
                deployData = await rest.put(
                    Routes.applicationCommands(CLIENT_ID),
                    { body: commands }
                );
            } else {
                if (!GUILD_ID) {
                    throw new Error('GUILD_ID não definido no .env para deploy em servidor. Adicione GUILD_ID ou use --global para deploy global.');
                }
                deployLocation = `Servidor: ${interaction.guild.name}`;
                deployData = await rest.put(
                    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
                    { body: commands }
                );
            }

            // Sucesso no deploy.
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Deploy Concluído!')
                .setDescription(`${deployData.length} comando(s) foram atualizados/registrados com sucesso!`)
                .addFields(
                    { name: '📍 Local', value: deployLocation, inline: true },
                    { name: '📊 Comandos Registrados', value: deployData.length.toString(), inline: true },
                    { name: '⏱️ Deploy por', value: `<@${interaction.user.id}>`, inline: true }
                )
                .setColor('#00ff00')
                .setTimestamp();

            if (isGlobal) {
                successEmbed.addFields({
                    name: '⚠️ Nota',
                    value: 'Comandos globais podem demorar até 1 hora para aparecer.',
                    inline: false
                });
            }

            // Lista os comandos que foram deployados.
            const commandList = commands.map(cmd => `• \`/${cmd.name}\` - ${cmd.description}`).join('\n');
            if (commandList.length < 1024) { // Verifica limite de campo de embed.
                successEmbed.addFields({
                    name: '📋 Comandos Atualizados',
                    value: commandList,
                    inline: false
                });
            }

            await interaction.editReply({
                embeds: [successEmbed]
            });

            // Log no console para monitoramento.
            console.log(`🚀 Deploy manual executado por ${interaction.user.username} (${interaction.user.id})`);
            console.log(`📍 Local: ${deployLocation}`);
            console.log(`📊 ${deployData.length} comando(s) atualizados`);

        } catch (error) {
            console.error('❌ Erro durante deploy manual:', error);

            // Cria um embed de erro detalhado.
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Erro no Deploy')
                .setDescription('Ocorreu um erro durante o deploy dos comandos.')
                .addFields(
                    { name: '🔍 Erro', value: error.message.substring(0, 1000), inline: false }
                )
                .setColor('#ff0000')
                .setTimestamp();

            // Adiciona dicas para erros comuns.
            if (error.code === 50001) {
                errorEmbed.addFields({
                    name: '💡 Dica',
                    value: 'Bot não tem permissões suficientes no servidor. Verifique se o bot tem o escopo `applications.commands` no link de convite e permissão de criar comandos.',
                    inline: false
                });
            } else if (error.code === 10013) {
                errorEmbed.addFields({
                    name: '💡 Dica',
                    value: 'CLIENT_ID ou GUILD_ID inválido. Verifique as variáveis de ambiente.',
                    inline: false
                });
            } else if (error.status === 401) {
                errorEmbed.addFields({
                    name: '💡 Dica',
                    value: 'Token do bot inválido ou expirado.',
                    inline: false
                });
            }

            await interaction.editReply({
                embeds: [errorEmbed]
            });
        }
    },
};
