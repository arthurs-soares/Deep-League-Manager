// utils/errorHandler.js
// Módulo para lidar com erros de forma centralizada.

/**
 * Função utilitária para lidar com erros e enviar uma resposta ao usuário de forma consistente.
 * Registra o erro no console e tenta enviar uma mensagem efêmera ao usuário.
 * @param {Error} error - O objeto de erro.
 * @param {string} context - O contexto da interação (nome do comando, customId do botão/modal).
 * @param {Interaction} interaction - O objeto de interação original (pode ser nulo para erros de cliente).
 */
const handleError = async (error, context, interaction) => { 
    console.error(`❌ Erro processando interação de ${context}:`, error);
    let errorMessage = '❌ Ocorreu um erro interno ao processar sua solicitação. Por favor, tente novamente mais tarde.';

    // Mensagens de erro específicas baseadas em códigos Discord API ou mensagens de erro conhecidas
    if (error.message.includes('A conexão com o banco de dados não foi estabelecida')) {
        errorMessage = '❌ Erro de conexão com o banco de dados. O bot pode estar inicializando ou com problemas. Tente novamente em breve.';
    } else if (error.code === 10008) { // Unknown Message / Unknown Interaction
        // Esta é uma interação antiga/já respondida ou a mensagem foi deletada.
        // Não é necessário enviar uma mensagem de erro ao usuário, apenas logar.
        return; 
    } else if (error.code === 50001) { // Missing Access (Bot não tem acesso ao canal/servidor)
        errorMessage = '❌ O bot não tem permissão para acessar ou realizar esta ação (e.g., enviar mensagem ou incorporar links) no canal ou servidor. Verifique as permissões do bot.';
    } else if (error.code === 50013) { // Missing Permissions (Bot não tem permissões para uma ação específica)
        errorMessage = '❌ O bot não tem as permissões necessárias para operar neste canal/servidor. Verifique as permissões do bot para `Enviar Mensagens`, `Incorporar Links`, `Gerenciar Mensagens`, etc.';
    } else if (error.message.includes('Cannot show a modal to a replied interaction')) {
        // Erro comum se deferReply/reply for chamado antes de showModal em User/String Select menus
        errorMessage = '❌ Erro interno: O bot tentou exibir um formulário de forma inválida. Isso geralmente é um erro no código interno ou o fluxo foi interrompido.';
    } else if (error.message.includes('No access to channel')) {
        errorMessage = '❌ O bot não tem permissão para acessar o canal alvo. Verifique as permissões.';
    }

    try {
        // Tenta responder à interação de forma efêmera se ainda for possível.
        // É crucial verificar se a interação não foi respondida/adiada para evitar `InteractionAlreadyReplied`.
        if (interaction) { // Garante que há um objeto de interação para tentar responder
            if (interaction.replied || interaction.deferred) {
                // Se já respondeu/adiou, tenta um followUp
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                // Se não respondeu/adiou, tenta responder diretamente
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    } catch (e) {
        // Se falhar ao enviar a mensagem de erro ao usuário, apenas loga.
        console.error("⚠️ Falha crítica ao enviar mensagem de erro ao usuário:", e);
    }
};

module.exports = {
    handleError,
};
