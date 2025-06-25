// handlers/utils/autocompleteHelper.js
const { loadAllGuilds } = require('../db/guildDb');

/**
 * Lida com a lógica de autocompletar nomes de guildas para comandos slash.
 * @param {import('discord.js').AutocompleteInteraction} interaction - A interação de autocomplete.
 */
async function autocompleteGuilds(interaction) {
    try {
        // Pega o que o usuário está digitando no momento.
        const focusedValue = interaction.options.getFocused();

        // Carrega todas as guildas do banco de dados (usará o cache se implementado no futuro).
        const allGuilds = await loadAllGuilds();

        // Filtra as guildas cujos nomes começam com o texto digitado (insensível a maiúsculas/minúsculas).
        // Limita a 25 resultados, que é o máximo que o Discord permite.
        const filtered = allGuilds
            .filter(guild => guild.name.toLowerCase().startsWith(focusedValue.toLowerCase()))
            .slice(0, 25);

        // Responde à interação com as opções filtradas no formato que o Discord espera.
        await interaction.respond(
            filtered.map(choice => ({ name: choice.name, value: choice.name })),
        );
    } catch (error) {
        console.error("❌ Erro no helper de autocomplete de guildas:", error);
        // Em caso de erro, envia uma resposta vazia para não travar o Discord do usuário.
        await interaction.respond([]);
    }
}

module.exports = {
    autocompleteGuilds,
};