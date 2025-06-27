// commands/ajuda.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
// A lógica principal ainda é local ou via client.guildPanelHandlers
// Este comando não importa diretamente do DB ou utils, então não é o problema principal aqui,
// mas é incluído para garantir que a versão completa está sempre presente.

// Objeto central com os detalhes de todos os comandos para fácil manutenção
const commandDetails = {
    // --- Comandos de Gerenciamento de Guilda ---
    'guilda-painel': {
        emoji: '🎛️',
        name: 'guilda-painel',
        description: 'Abre um painel interativo para gerenciar sua guilda. Permite editar perfil, gerenciar membros com opções de `Adicionar em Massa`, `Editar por Slot` e `Gerenciamento Direto`, além de controlar a liderança.', 
        permission: '🟡 Líderes, Vice-Líderes de Guilda e Moderadores',
        usage: '`/guilda-painel [guilda: Nome da Guilda (Mods)]`',
        examples: [
            '`/guilda-painel` - Acesse seu painel pessoal (se for líder/vice-líder).',
            '`/guilda-painel guilda: Minha Guilda` - Moderadores podem abrir o painel de qualquer guilda.',
            'As ações são feitas por botões interativos dentro do painel.'
        ],
    },
    'registrar': {
        emoji: '🏰',
        name: 'registrar',
        description: 'Registra uma nova guilda no sistema com um líder e, opcionalmente, um vice-líder. Apenas moderadores.',
        permission: '🔴 Apenas Moderadores',
        usage: '`/registrar nome: [Nome EXATO] leader: [@usuário] co-leader: [@usuário (opcional)]`',
        options: [
            { name: 'nome', description: 'O nome exato da nova guilda (único no sistema).' },
            { name: 'leader', description: 'O @ do líder principal da guilda.' },
            { name: 'co-leader', description: 'Opcional. O @ do vice-líder da guilda.' }
        ],
        examples: [
            '`/registrar nome: Os Imortais leader: @LíderDaGuilda`',
            '`/registrar nome: Guerreiros da Luz leader: @Líder co-leader: @ViceLíder` - Registra com líder e vice.'
        ],
    },
    'editar': {
        emoji: '✏️',
        name: 'editar',
        description: 'Edita informações específicas de uma guilda existente. Líderes podem editar seus rosters, perfil e cor. Moderadores podem editar TUDO, incluindo o nome da guilda.',
        permission: '🟡 Líderes ou Moderadores',
        usage: '`/editar guilda: [Nome EXATO] [opções...]`',
        options: [
            { name: 'guilda', description: 'O nome exato da guilda a ser editada.' },
            { name: 'novo-nome', description: 'Apenas Moderadores: Novo nome EXATO para a guilda.' },
            { name: 'novo-vice-lider', description: 'Líder/Moderador: Define um novo @vice-líder, ou deixe vazio para remover o atual.' },
            { name: 'main', description: 'Líder/Moderador: IDs dos membros do Roster Principal (separados por vírgula ou menções).' },
            { name: 'sub', description: 'Líder/Moderador: IDs dos membros do Roster Reserva (separados por vírgula ou menções).' },
            { name: 'logo', description: 'Líder/Moderador: Anexo de imagem para a nova logo, ou deixe vazio para remover.' },
            { name: 'descricao', description: 'Líder/Moderador: Nova descrição da guilda (até 500 caracteres), ou deixe vazio para remover.' },
            { name: 'link', description: 'Líder/Moderador: Novo link para a guilda (URL), ou deixe vazio para remover.' },
            { name: 'cor', description: 'Líder/Moderador: Nova cor para os embeds da guilda (Ex: #FF00FF, red, blue, black, random).' }
        ],
        examples: [
            '`/editar guilda: Os Imortais descricao: Guilda de elite para jogadores competitivos.`',
            '`/editar guilda: Os Imortais logo: [Anexar Imagem]` - Anexe a imagem ao comando.',
            '`/editar guilda: Os Imortais main: ID1, ID2, <@Membro3>` - Adiciona/substitui membros no roster principal.',
            '`/editar guilda: Os Imortais cor: #00FF00` - Muda a cor do painel e embeds da guilda para verde.',
            '`/editar guilda: GuildaAntiga novo-nome: GuildaNova` - **APENAS MODERADORES.**',
            '`/editar guilda: MinhaGuilda novo-vice-lider: @NovoVice` - Define um novo vice-líder.',
            '`/editar guilda: MinhaGuilda novo-vice-lider:` - Remove o vice-líder atual (deixando o campo em branco).'
        ],
    },
    'deletar': {
        emoji: '🗑️',
        name: 'deletar',
        description: 'Deleta uma guilda do sistema permanentemente. Esta ação é irreversível e exige confirmação.',
        permission: '🟡 Líderes ou Moderadores',
        usage: '`/deletar guilda: [Nome EXATO]`',
        options: [
            { name: 'guilda', description: 'O nome exato da guilda a ser deletada.' }
        ],
        examples: [
            '`/deletar guilda: Guilda Antiga` - Confirme cuidadosamente antes de prosseguir.'
        ],
    },
    // --- Comandos de Visualização e Interação ---
    'visualizar': {
        emoji: '👁️',
        name: 'visualizar',
        description: 'Visualiza o ranking geral de guildas ou o perfil detalhado de uma guilda específica.',
        permission: '🟢 Todos os Usuários',
        usage: '`/visualizar [guilda: nome]`',
        options: [
            { name: 'guilda', description: 'Opcional. Nome exato da guilda para ver detalhes. Deixe em branco para o ranking.' }
        ],
        examples: [
            '`/visualizar` - Mostra o ranking completo de todas as guildas registradas.',
            '`/visualizar guilda: Os Imortais` - Mostra o perfil detalhado da guilda "Os Imortais".'
        ],
    },
    'enviar': {
        emoji: '📤',
        name: 'enviar',
        description: 'Envia o card visual completo de uma guilda no canal configurado ou cria/atualiza seu post no fórum.', 
        permission: '🔴 Apenas Moderadores',
        usage: '`/enviar guilda: [Nome EXATO] [canal-alvo: #canal (opcional)]`',
        options: [
            { name: 'guilda', description: 'O nome exato da guilda cujo card será enviado.' },
            { name: 'canal-alvo', description: 'Opcional: Canal de texto para enviar o card (prioriza o fórum se configurado).'}
        ],
        examples: [
            '`/enviar guilda: Os Imortais` - Publica o card da guilda no canal definido (prioriza fórum).',
            '`/enviar guilda: Os Imortais canal-alvo: #avisos` - Publica em um canal específico.'
        ],
    },
    'setscore': {
        emoji: '📊',
        name: 'setscore',
        description: 'Define ou atualiza o score (vitórias e derrotas) de uma guilda específica. Apenas moderadores.',
        permission: '🔴 Apenas Moderadores',
        usage: '`/setscore guilda: [Nome EXATO] vitorias: [nº] derrotas: [nº]`',
        options: [
            { name: 'guilda', description: 'O nome exato da guilda.' },
            { name: 'vitorias', description: 'O número total de vitórias da guilda.' },
            { name: 'derrotas', description: 'O número total de derrotas da guilda.' }
        ],
        examples: [
            '`/setscore guilda: Os Imortais vitorias: 15 derrotas: 4` - Atualiza o score.',
            '`/setscore guilda: NascidosParaPerder vitorias: 0 derrotas: 10` - Define um score inicial.'
        ],
    },
    // --- Comandos de Configuração e Utilitários ---
    'definir-canal': {
        emoji: '⚙️',
        name: 'definir-canal',
        description: 'Define o canal de texto onde os cards de guildas serão enviados pelo comando `/enviar`.',
        permission: '🔴 Apenas Moderadores',
        usage: '`/definir-canal canal: [#canal]`',
        options: [
            { name: 'canal', description: 'O canal de texto a ser configurado.' }
        ],
        examples: [
            '`/definir-canal canal: #guildas-registradas` - Define este canal como o destino dos cards.'
        ],
    },
    'definir-forum-rosters': { 
        emoji: '🏛️',
        name: 'definir-forum-rosters',
        description: 'Define o canal de Fórum onde os posts de rosters de guildas serão criados e atualizados automaticamente.',
        permission: '🔴 Apenas Administradores',
        usage: '`/definir-forum-rosters canal-forum: [#canal-forum]`',
        options: [
            { name: 'canal-forum', description: 'O canal de fórum a ser configurado.' }
        ],
        examples: [
            '`/definir-forum-rosters canal-forum: #rosters-guildas` - Define este fórum como o destino dos posts automáticos.'
        ],
    },
    'ping': {
        emoji: '🏓',
        name: 'ping',
        description: 'Verifica a latência do bot e seu status de resposta no Discord.',
        permission: '🟢 Todos os Usuários',
        usage: '`/ping`',
        examples: [
            '`/ping` - Responde com o ping atual do bot para o Discord API.'
        ],
    },
    'ajuda': {
        emoji: '❓',
        name: 'ajuda',
        description: 'Mostra esta mensagem de ajuda completa com todos os comandos disponíveis e seus detalhes.',
        permission: '🟢 Todos os Usuários',
        usage: '`/ajuda [comando: nome]`',
        options: [
            { name: 'comando', description: 'Opcional. Selecione um comando específico para ver seus detalhes.' }
        ],
        examples: [
            '`/ajuda` - Mostra o painel principal de ajuda com categorias e um menu de seleção.',
            '`/ajuda comando: registrar` - Mostra detalhes específicos sobre o comando `/registrar` e suas opções.'
        ],
    },
    'resetar-cooldown': {
        emoji: '⏳',
        name: 'resetar-cooldown',
        description: 'Remove um usuário do cooldown de entrada/saída de guilda. Apenas moderadores.',
        permission: '🔴 Apenas Moderadores',
        usage: '`/resetar-cooldown usuario: [@usuário]`',
        options: [
            { name: 'usuario', description: 'O @ do usuário cujo cooldown será resetado.' }
        ],
        examples: [
            '`/resetar-cooldown usuario: @MembroEmCooldown` - Remove o usuário do cooldown.'
        ],
    },
};

// Função interna para mostrar os detalhes de um comando específico
async function showSpecificCommand(interaction, commandName) {
    const cmd = commandDetails[commandName];
    if (!cmd) {
        return interaction.reply({ content: '❌ Comando não encontrado.', flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
        .setTitle(`${cmd.emoji} Ajuda: /${cmd.name}`)
        .setColor('#3498DB') 
        .setDescription(cmd.description)
        .addFields(
            { name: '🔐 Permissão Necessária', value: cmd.permission, inline: false },
            { name: '💬 Como Usar', value: `\`${cmd.usage}\``, inline: false }
        );

    if (cmd.options && cmd.options.length > 0) {
        const optionsText = cmd.options.map(opt => `• \`${opt.name}\`: ${opt.description}`).join('\n');
        embed.addFields({ name: '🛠️ Opções', value: optionsText, inline: false });
    }

    if (cmd.examples && cmd.examples.length > 0) {
        embed.addFields({ name: '📝 Exemplos', value: cmd.examples.map(e => `> ${e}`).join('\n'), inline: false });
    }

    if (interaction.isStringSelectMenu()) {
        await interaction.update({ embeds: [embed], components: [] }); 
    } else {
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ajuda')
        .setDescription('Mostra todos os comandos disponíveis e como usá-los.')
        .addStringOption(option => {
            option.setName('comando')
                  .setDescription('Comando específico para ver detalhes')
                  .setRequired(false);
            for (const cmdName in commandDetails) {
                if (cmdName !== 'ajuda') { 
                    option.addChoices({ name: cmdName, value: cmdName });
                }
            }
            return option;
        }),

    async execute(interaction) {
        const specificCommand = interaction.options.getString('comando');

        if (specificCommand) {
            return await showSpecificCommand(interaction, specificCommand);
        }

        const mainEmbed = new EmbedBuilder()
            .setTitle('🤖 Central de Ajuda do Bot de Guildas')
            .setColor('#3498DB')
            .setDescription('Bem-vindo! Aqui estão todos os comandos disponíveis para gerenciar e visualizar as guildas. Selecione um comando no menu abaixo para obter mais detalhes.')
            .addFields(
                { 
                    name: '🏰 Gerenciamento de Guilda (Líderes/Mods)', 
                    value: '`/guilda-painel`, `/registrar`, `/editar`, `/deletar`, `/setscore`' 
                },
                { 
                    name: '⚙️ Configuração (Mods/Admin)', 
                    value: '`/definir-canal`, `/definir-forum-rosters`, `/enviar`, `/resetar-cooldown`' 
                }, 
                { 
                    name: '✨ Geral (Todos)', 
                    value: '`/visualizar`, `/ping`, `/ajuda`' 
                }
            )
            .setFooter({ text: 'Selecione um comando no menu para mais informações.' })
            .setTimestamp();
        
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_select_menu')
            .setPlaceholder('🔍 Ver detalhes de um comando específico...')
            .addOptions(
                Object.values(commandDetails).map(cmd => ({
                    label: cmd.name,
                    description: cmd.description.substring(0, 100), 
                    value: cmd.name,
                    emoji: cmd.emoji
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const response = await interaction.reply({
            embeds: [mainEmbed],
            components: [row],
            flags: MessageFlags.Ephemeral
        });

        const collector = response.createMessageComponentCollector({ 
            filter: i => i.user.id === interaction.user.id, 
            time: 300_000 
        });

        collector.on('collect', async i => {
            if (!i.isStringSelectMenu()) return; 
            await showSpecificCommand(i, i.values[0]); 
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') { 
                try {
                    await interaction.editReply({ components: [] });
                } catch (error) {
                    if (error.code !== 10008) { 
                        console.error("Erro ao remover componentes do menu de ajuda (coletor expirou):", error);
                    }
                }
            }
        });
    },
};