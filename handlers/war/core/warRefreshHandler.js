// handlers/war/core/warRefreshHandler.js
const { loadWarTicketByThreadId } = require('../../db/warDb');
const { createWarCurrentButtons } = require('../actions/warTicketButtons');
const { sendLogMessage } = require('../../utils/logManager');

/**
 * Manipula o clique no botão de atualizar os botões da war.
 * Este handler simplesmente recarrega os dados da war e atualiza a mensagem com novos componentes.
 * Isso resolve o problema de expiração dos componentes interativos do Discord.
 */
async function handleWarRefreshButton(interaction, client, globalConfig) {
    console.log(`[DEBUG] handleWarRefreshButton chamado - Timestamp: ${new Date().toISOString()}`);
    console.log(`[DEBUG] Botão clicado por: ${interaction.user.tag} (${interaction.user.id})`);
    
    await interaction.deferUpdate();

    const threadId = interaction.channel.id;
    console.log(`[DEBUG] Buscando dados da war para threadId: ${threadId}`);
    const warData = await loadWarTicketByThreadId(threadId);
    
    if (!warData) {
        console.log(`[DEBUG] Dados da war não encontrados para threadId: ${threadId}`);
        return interaction.followUp({ 
            content: '❌ Não foi possível encontrar os dados desta war. O ticket pode ter sido excluído.', 
            ephemeral: true 
        });
    }

    console.log(`[DEBUG] Dados da war encontrados. Status: ${warData.status}`);
    
    // Recria os botões com base no status atual da war
    const components = createWarCurrentButtons(warData);
    
    // Atualiza a mensagem com os novos componentes
    await interaction.message.edit({ 
        embeds: interaction.message.embeds, 
        components: components 
    });

    // Envia uma mensagem efêmera para o usuário
    await interaction.followUp({ 
        content: '✅ Os botões da war foram atualizados com sucesso!', 
        ephemeral: true 
    });

    // Registra a ação no log
    await sendLogMessage(
        client, globalConfig, interaction,
        'Botões de War Atualizados',
        `Os botões da War/Glad entre **${warData.yourEntity.name}** e **${warData.enemyEntity.name}** foram atualizados.`,
        [
            { name: 'Status Atual', value: warData.status, inline: true },
            { name: 'Thread da War', value: interaction.channel.url, inline: true },
        ]
    );
}

module.exports = { handleWarRefreshButton };