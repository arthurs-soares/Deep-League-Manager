// tasks/leaderboardUpdater.js
// Módulo para gerenciar a atualização periódica do painel de ranking global de guildas.

const { EmbedBuilder } = require('discord.js');
// Importações DIRETAS dos módulos necessários (caminhos relativos à raiz do projeto, pois este arquivo está em 'tasks/')
const { loadConfig } = require('../handlers/db/configDb'); // Para carregar a config do bot
const { loadAllGuilds } = require('../handlers/db/guildDb'); // Para carregar todas as guildas
const { resolveDisplayColor } = require('../handlers/utils/constants'); // Para resolver cores de embed


/**
 * Função para atualizar o painel de ranking no canal configurado.
 * Esta função é chamada por eventos (criação/edição/deleção de guilda) e periodicamente.
 * @param {Client} client - A instância do bot Discord.js.
 * @param {Object} globalConfig - Objeto de configuração global do bot (para IDs de canais, cores).
 */
async function updateLeaderboardPanel(client, globalConfig) {
    console.log('🔄 Tentando atualizar painel de ranking...');
    
    try {
        const botConfig = await loadConfig(); // Carrega a configuração mais recente.
        const rankingChannelId = botConfig.rankingChannelId;
        const rankingMessageId = botConfig.rankingMessageId;
        const globalEmbedColor = botConfig.embedColor; // Cor padrão para os embeds do ranking.

        // Se o painel de ranking não estiver configurado no config.json, não pode operar.
        if (!rankingChannelId || !rankingMessageId) {
            console.warn('⚠️ Painel de ranking não configurado. Use /painel-ranking para configurar primeiro.');
            return;
        }

        // Tenta buscar o canal e a mensagem do painel de ranking.
        const channel = await client.channels.fetch(rankingChannelId).catch(() => null);
        if (!channel) {
            console.error(`❌ Canal de ranking (ID: ${rankingChannelId}) não encontrado ou inacessível. Verifique as permissões do bot.`);
            return;
        }

        const message = await channel.messages.fetch(rankingMessageId).catch(() => null);
        if (!message) {
            console.error(`❌ Mensagem do painel de ranking (ID: ${rankingMessageId}) não encontrada no canal ${channel.name}.`);
            return;
        }

        const allGuilds = await loadAllGuilds(); // Carrega todas as guildas do DB.
        if (!allGuilds || allGuilds.length === 0) {
            // Se não há guildas, limpa o painel.
            await message.edit({ content: '❌ Nenhuma guilda foi registrada no bot ainda. O ranking está vazio.', embeds: [] });
            return;
        }

        // Lógica de ordenação:
        // 1. Mais vitórias para menos vitórias.
        // 2. Em caso de empate nas vitórias, menos derrotas para mais derrotas.
        const sortedGuilds = allGuilds.sort((a, b) => {
            const winsA = a.score?.wins || 0;
            const winsB = b.score?.wins || 0;
            
            if (winsB !== winsA) {
                return winsB - winsA; // Ordena por vitórias (decrescente)
            }
            
            const lossesA = a.score?.losses || 0;
            const lossesB = b.score?.losses || 0;
            return lossesA - lossesB; // Em caso de empate, ordena por derrotas (crescente)
        });

        // Constrói a descrição do Embed do ranking.
        const leaderboardDescription = sortedGuilds.map((guild, index) => {
            let rankEmoji = `**${index + 1}º** `;
            if (index === 0) rankEmoji = '🥇 '; // Primeiro lugar
            else if (index === 1) rankEmoji = '🥈 '; // Segundo lugar
            else if (index === 2) rankEmoji = '🥉 '; // Terceiro lugar
            
            const wins = guild.score?.wins || 0;
            const losses = guild.score?.losses || 0;
            const totalGames = wins + losses; 
            // Calcula a taxa de vitória, evitando divisão por zero.
            const winRate = totalGames > 0 ? Math.round((wins / (totalGames)) * 100) : 0;
            const scoreInfo = totalGames > 0 ? `**${wins}V** / **${losses}D** (${winRate}%)` : '*Sem partidas*';
            
            return `${rankEmoji} **${guild.name}**\n   └ 👑 <@${guild.leader.id}> • 📊 ${scoreInfo}`;
        }).join('\n\n');

        // Cria o Embed final do ranking.
        const leaderboardEmbed = new EmbedBuilder()
            .setTitle('🏆 Ranking de Guildas')
            .setColor(resolveDisplayColor(globalEmbedColor, botConfig)) // Usa a cor configurada.
            .setDescription('As guildas são classificadas pelo número de vitórias (e menos derrotas em caso de empate).\n\n' + leaderboardDescription)
            .setFooter({ text: `Última atualização: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} | Total de ${allGuilds.length} guildas` })
            .setTimestamp(); // Define o timestamp do embed.

        // Tenta editar a mensagem existente do painel.
        await message.edit({ content: '', embeds: [leaderboardEmbed] });
        console.log('✅ Painel de ranking atualizado com sucesso!');

    } catch (error) {
        console.error('❌ Erro ao atualizar painel de ranking:', error);
        // Não envia followUp aqui, pois é uma tarefa em segundo plano.
    }
}

module.exports = {
    updateLeaderboardPanel,
};
