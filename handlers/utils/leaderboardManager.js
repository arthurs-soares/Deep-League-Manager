// handlers/utils/leaderboardManager.js (VERSÃO FINAL AJUSTADA)
const { EmbedBuilder } = require('discord.js');
const path = require('path');

const { getLeaderboardInfo } = require(path.resolve(process.cwd(), 'handlers', 'db', 'configDb.js'));
const { getAllGuilds } = require(path.resolve(process.cwd(), 'handlers', 'db', 'guildDb.js'));

// [AJUSTE] A função agora aceita um parâmetro opcional 'initialMessage'
async function updateLeaderboard(client, initialMessage = null) {
    try {
        let messageToEdit = initialMessage;

        // [AJUSTE] Se a mensagem não foi passada diretamente, busca no DB
        if (!messageToEdit) {
            const config = await getLeaderboardInfo();
            if (!config || !config.messageId) {
                console.log("[Leaderboard] ID da mensagem do leaderboard não encontrado. Use /leaderboard para criar um.");
                return;
            }
            const channel = await client.channels.fetch(config.channelId);
            messageToEdit = await channel.messages.fetch(config.messageId);
        }

        const allGuilds = await getAllGuilds();

        allGuilds.sort((a, b) => {
            const vitoriasA = a.vitorias || 0;
            const derrotasA = a.derrotas || 0;
            const vitoriasB = b.vitorias || 0;
            const derrotasB = b.derrotas || 0;

            const wl_a = (derrotasA === 0) ? (vitoriasA > 0 ? Infinity : 0) : vitoriasA / derrotasA;
            const wl_b = (derrotasB === 0) ? (vitoriasB > 0 ? Infinity : 0) : vitoriasB / derrotasB;
            
            if (wl_b !== wl_a) return wl_b - wl_a;
            return vitoriasB - vitoriasA;
        });

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('🏆 Leaderboard das Guildas 🏆')
            .setTimestamp()
            .setFooter({ text: 'Atualizado em' });

        let description = '';
        if (allGuilds.length === 0) {
            description = 'Nenhuma guilda registrada ainda. Use `/registrar`!';
        } else {
            allGuilds.slice(0, 15).forEach((guild, index) => {
                const rank = index + 1;
                const vitorias = guild.vitorias || 0;
                const derrotas = guild.derrotas || 0;
                const wl_ratio = (derrotas === 0) ? 'Invicta' : (vitorias / derrotas).toFixed(2);
                description += `**${rank}. ${guild.name}**\n`;
                description += `> W: \`${vitorias}\` | L: \`${derrotas}\` | W/L: \`${wl_ratio}\`\n\n`;
            });
        }
        
        embed.setDescription(description);

        // Edita a mensagem correta
        await messageToEdit.edit({ content: '', embeds: [embed] });
        console.log("Leaderboard atualizado com sucesso.");

    } catch (error) {
        console.error("Falha ao atualizar o leaderboard:", error);
    }
}

module.exports = { updateLeaderboard };