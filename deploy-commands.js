// deploy-commands.js
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const commands = [];

// Carregar todos os comandos da pasta commands
const commandsPath = path.join(__dirname, 'commands');

// Verificar se a pasta commands existe
if (!fs.existsSync(commandsPath)) {
    console.error('❌ Pasta /commands não encontrada!');
    process.exit(1);
}

const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Processar cada arquivo de comando
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    try {
        delete require.cache[require.resolve(filePath)]; // Limpar cache para garantir que pega a versão mais recente
        const command = require(filePath);

        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
            console.log(`✅ Comando ${command.data.name} adicionado para deploy`);
        } else {
            console.log(`⚠️ O comando em ${filePath} está faltando propriedade "data" ou "execute".`);
        }
    } catch (error) {
        console.error(`❌ Erro ao carregar comando de ${file}:`, error);
        // Não sair aqui para tentar carregar o máximo de comandos possível
    }
}

// Verificar se há comandos para deploy
if (commands.length === 0) {
    console.warn('⚠️ Nenhum comando válido encontrado para deploy. Prosseguindo apenas com limpeza (se solicitada) ou sem registro.');
    // Não sair aqui imediatamente, pois pode ser uma execução de limpeza
}

// Configurar o REST
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Função para deploy dos comandos
async function deployCommands() {
    try {
        const CLIENT_ID = process.env.CLIENT_ID;
        const GUILD_ID = process.env.GUILD_ID;
        // Removida a opção de deploy global - apenas deploy por servidor será permitido
        const cleanOnly = process.argv.includes('--clean'); // Argumento para limpeza
        const cleanGlobal = process.argv.includes('--clean-global'); // Novo argumento para limpar comandos globais

        if (!CLIENT_ID) {
            throw new Error('CLIENT_ID não definido no .env. Impossível prosseguir.');
        }

        console.log(`🚀 Iniciando operações de deploy/limpeza...`);

        // --- ETAPA DE LIMPEZA ---
        if (cleanOnly) {
            console.log(`🧹 Limpando todos os comandos...`);
            if (GUILD_ID) {
                console.log(`🧹 Limpando comandos do servidor ${GUILD_ID}...`);
                await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
                console.log(`✅ Comandos do servidor ${GUILD_ID} limpos com sucesso.`);
            } else {
                console.log(`🧹 Limpando comandos globais... (Isso pode demorar)`);
                await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
                console.log(`✅ Comandos globais limpos com sucesso. Pode levar até 1 hora para sumirem do Discord.`);
            }
            console.log(`🎉 Limpeza concluída. Se quiser fazer deploy, execute novamente SEM a flag --clean.`);
            return; // Sair após a limpeza
        }

        // --- ETAPA DE LIMPEZA DE COMANDOS GLOBAIS ---
        if (cleanGlobal) {
            console.log(`🧹 Limpando comandos globais... (Isso pode demorar)`);
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
            console.log(`✅ Comandos globais limpos com sucesso. Pode levar até 1 hora para sumirem do Discord.`);
            console.log(`🎉 Limpeza de comandos globais concluída.`);
            return; // Sair após a limpeza
        }

        // --- ETAPA DE DEPLOY (APENAS PARA SERVIDOR) ---
        if (!GUILD_ID) {
            throw new Error('GUILD_ID não definido no .env para deploy em servidor. Adicione GUILD_ID no arquivo .env.');
        }
        console.log(`📍 Fazendo deploy para o SERVIDOR ${GUILD_ID} de ${commands.length} comando(s)...`);
        const data = await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );
        console.log(`✅ ${data.length} comando(s) registrados no SERVIDOR com sucesso!`);
        console.log('🎉 Deploy concluído com sucesso!');

    } catch (error) {
        console.error('❌ Erro durante a operação de deploy:', error);
        if (error.code === 50001) {
            console.log('💡 Erro: Bot não tem permissões suficientes no servidor. Verifique se o bot tem o escopo `applications.commands` no link de convite e permissão de criar comandos.');
        } else if (error.code === 10013) {
            console.log('💡 Erro: CLIENT_ID ou GUILD_ID inválido. Verifique suas variáveis de ambiente.');
        } else if (error.status === 401) {
            console.log('💡 Erro: Token do bot inválido ou expirado.');
        }
        process.exit(1);
    }
}

// Executar deploy
deployCommands();
