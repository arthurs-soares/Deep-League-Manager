// index.js
// Ponto de entrada principal para o bot Discord.js.

// Carrega as variáveis de ambiente do arquivo .env (necessário no topo do arquivo).
require('dotenv').config();

const { Client, Collection, GatewayIntentBits, ActivityType, PresenceUpdateStatus, InteractionType, EmbedBuilder } = require('discord.js');
const fs = require('fs');   // Módulo para interagir com o sistema de arquivos.
const path = require('path'); // Módulo para lidar com caminhos de arquivos.

// Importações dos módulos utilitários e de tarefas, com caminhos relativos à raiz.
const { connectToDatabase } = require('./utils/database'); // Conexão com o DB.
const { handleError } = require('./utils/errorHandler');   // Gerenciamento de erros.
const { updateStatus } = require('./utils/statusManager'); // Gerenciamento de status do bot.
const { updateLeaderboardPanel } = require('./tasks/leaderboardUpdater'); // Atualizador de ranking.

// Importa o handler principal que consolida todas as funções de lógica de negócio.
const allHandlers = require('./handlers/index.js');

// Cria uma nova instância do cliente Discord.js com os intents necessários.
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,           // Necessário para comandos slash, info de servidor, canais.
        GatewayIntentBits.GuildMessages,    // Para eventos de mensagem (se necessário para comandos de prefixo ou outros).
        GatewayIntentBits.MessageContent,   // Para acessar o conteúdo das mensagens (CRÍTICO para comandos de prefixo, se usados).
        GatewayIntentBits.GuildMembers,     // Necessário para buscar membros, roles, etc. (permissões, rosters, guildMemberUpdate).
        GatewayIntentBits.GuildPresences    // Potencialmente útil para guildMemberUpdate, embora GuildMembers cobre muito.
    ]
});

// Inicializa uma coleção para armazenar os comandos slash do bot.
client.commands = new Collection();
// Anexa todos os handlers de lógica de negócio ao objeto 'client' para fácil acesso em qualquer lugar do bot.
client.guildPanelHandlers = allHandlers;

let globalConfig = {}; // Variável para armazenar a configuração global do bot (carregada de config.json).


/**
 * Carrega todos os comandos slash do diretório 'commands'.
 * Cada arquivo .js na pasta 'commands' é tratado como um comando.
 */
function loadCommands() {
    const commandsPath = path.join(__dirname, 'commands');
    // Verifica se a pasta 'commands' existe.
    if (!fs.existsSync(commandsPath)) {
        console.log('Pasta /commands não encontrada. Nenhum comando será carregado.');
        return;
    }
    // Lê todos os arquivos .js na pasta 'commands'.
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        try {
            delete require.cache[require.resolve(filePath)]; // Limpa o cache para garantir que as versões mais recentes sejam carregadas.
            const command = require(filePath); // Carrega o módulo do comando.

            // Valida se o objeto do comando possui as propriedades 'data' (com toJSON) e 'execute'.
            if (command.data && typeof command.data.toJSON === 'function' && 'execute' in command) {
                client.commands.set(command.data.name, command); // Adiciona o comando à coleção.
                console.log(`✅ Comando ${command.data.name} carregado.`);
            } else {
                console.warn(`⚠️ O comando em ${filePath} está inválido (não possui as propriedades "data" ou "execute" necessárias).`);
            }
        } catch (error) {
            console.error(`❌ Erro ao carregar comando de ${file}:`, error);
        }
    }
}

/**
 * Inicializa os arquivos de configuração necessários, como 'config.json'.
 * Garante que a variável globalConfig tenha todas as propriedades padrão definidas.
 */
async function initializeRequiredFiles() {
    console.log(`[DIAGNÓSTICO INDEX] Iniciando initializeRequiredFiles.`);

    const defaultConfig = {
        moderatorRoles: [],
        scoreOperatorRoles: [],
        embedColor: "#0099ff",
        botName: "Deep League Manager",
        guildLeaderRoleId: "",
        guildCoLeaderRoleId: "",
        logChannelId: "",
        recentlyLeftUsers: [],
        warTicketChannelId: "",
        warTicketPanelMessageId: "",
        rankingChannelId: "",
        rankingMessageId: "",
        dodgeLogChannelId: "",
        guildRosterForumChannelId: "",
        guildViewChannel: "",
        leaderboard: {
            channelId: "",
            messageId: "",
        },
    };

    const loadedConfig = await allHandlers.loadConfig() || {}; 

    globalConfig = {
        ...defaultConfig,
        ...loadedConfig,
        moderatorRoles: loadedConfig.moderatorRoles || defaultConfig.moderatorRoles,
        scoreOperatorRoles: loadedConfig.scoreOperatorRoles || defaultConfig.scoreOperatorRoles,
        recentlyLeftUsers: loadedConfig.recentlyLeftUsers || defaultConfig.recentlyLeftUsers,
        leaderboard: { ...defaultConfig.leaderboard, ...(loadedConfig.leaderboard || {}) } // Mescla o objeto aninhado
    };

    let needsSave = false;
    for (const key in defaultConfig) {
        if (!(key in globalConfig)) {
            console.log(`[DIAGNÓSTICO INDEX] Chave de configuração padrão ausente: "${key}". Será adicionada.`);
            needsSave = true;
        }
    }

    if (needsSave) {
        console.log(`[DIAGNÓSTICO INDEX] Configuração com chaves padrão ausentes. Salvando para completar.`);
        // Remove _id antes de salvar para evitar conflitos se a função saveConfig não o fizer.
        delete globalConfig._id; 
        await allHandlers.saveConfig(globalConfig);
    } else {
        console.log('[DIAGNÓSTICO INDEX] Configuração carregada e completa. Nenhum salvamento automático necessário.');
    }

    // Apenas para debug, para ver o que foi carregado
    console.log(`[DIAGNÓSTICO INDEX] globalConfig finalizada: guildRosterForumChannelId = ${globalConfig.guildRosterForumChannelId}`);
}


// --- Evento: Bot pronto ---
client.once('ready', async () => {
    try {
        console.log(`🤖 Bot logado como ${client.user.tag}!`);

        console.log(`[DIAGNÓSTICO INDEX] Bot pronto. globalConfig carregada. guildRosterForumChannelId: ${globalConfig.guildRosterForumChannelId}`);

        // Inicia a rotação de status do bot.
        updateStatus(client);
        setInterval(() => updateStatus(client), 30000);
        console.log('🔄 Sistema de rotação de status ativado!');

        // Verifica se o logger está funcionando.
        if (typeof client.guildPanelHandlers.sendLogMessage !== 'function') {
            console.error("❌ ERRO CRÍTICO NA INICIALIZAÇÃO: client.guildPanelHandlers.sendLogMessage NÃO é uma função! Verifique handlers/index.js e handlers/utils/logManager.js exports.");
        } else {
            console.log('✅ client.guildPanelHandlers.sendLogMessage carregado com sucesso.');
        }

        // Atualiza o painel de ranking pela primeira vez e configura a atualização periódica.
        updateLeaderboardPanel(client, globalConfig);
        setInterval(() => updateLeaderboardPanel(client, globalConfig), 300000);
        console.log('🔄 Sistema de atualização de ranking ativado (a cada 5 minutos e por eventos).');

    } catch (error) {
        console.error("❌ Erro crítico durante o evento 'ready':", error);
        handleError(error, 'client.once(ready)', null); // Usa seu handler de erro global.
    }
});

// Evento personalizado para forçar a atualização do painel de ranking.
client.on('updateLeaderboard', () => updateLeaderboardPanel(client, globalConfig));

// --- Evento: Lidar com interações (comandos, botões, modais) ---
client.on('interactionCreate', async interaction => {
    await client.guildPanelHandlers.handleInteraction(interaction, client, globalConfig);
});

// --- Evento: Lidar com atualizações de membros (incluindo boosts) ---
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    await client.guildPanelHandlers.handleBoostUpdate(oldMember, newMember, client, globalConfig);
});

client.on('error', e => handleError(e, 'client.error', null));
client.on('warn', w => console.warn('⚠️ Aviso do Cliente Discord:', w));

/**
 * Função principal para iniciar o bot:
 * 1. Conecta ao banco de dados.
 * 2. Carrega configurações e comandos.
 * 3. Faz login no Discord.
 */
async function startBot() {
    try {
        console.log("--- INICIALIZAÇÃO DO BOT ---");

        // ORDEM CORRIGIDA: Conectar ao DB ANTES de inicializar as configurações que usam o DB.
        const DATABASE_URI_FOR_CONNECTION = process.env.DATABASE_URI;
        const DB_NAME = process.env.DB_NAME;

        if (!DATABASE_URI_FOR_CONNECTION || !DB_NAME) {
            console.error("ERRO CRÍTICO: DATABASE_URI ou DB_NAME não definidos no arquivo .env!");
            process.exit(1);
        }
        await connectToDatabase(DATABASE_URI_FOR_CONNECTION, DB_NAME);
        console.log("✅ Conexão com o banco de dados estabelecida.");

        // Agora que o DB está conectado, podemos inicializar as configurações.
        await initializeRequiredFiles();

        loadCommands(); // Carrega os comandos slash.

        console.log("Fazendo login no Discord...");
        if (!process.env.DISCORD_TOKEN) {
            console.error("ERRO CRÍTICO: DISCORD_TOKEN não definido no arquivo .env!");
            process.exit(1);
        }
        await client.login(process.env.DISCORD_TOKEN);

    } catch (error) {
        console.error("❌ ERRO FATAL NA INICIALIZAÇÃO DO BOT:", error);
        handleError(error, 'bot initialization', null);
        process.exit(1);
    }
}

// Inicia o bot quando o script é executado.
startBot();