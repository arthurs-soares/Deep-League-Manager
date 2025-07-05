// editHandlers.js
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { loadGuildByName, loadGuildById, saveGuildData } = require('../../db/guildDb');
const { sendLogMessage } = require('../../utils/logManager');
const { resolveDisplayColor, COLOR_MAP } = require('../../utils/constants');
const { getAndValidateGuild } = require('../../utils/validation');
const { manageGuildForumPost } = require('../../../utils/guildForumPostManager');

// --- Funções Helper para construir Embed e Menu ---

function buildGuildEditEmbed(guild, globalConfig) {
    return new EmbedBuilder()
        .setTitle(`Painel de Edição - ${guild.name}`)
        .setColor(resolveDisplayColor(guild.color, globalConfig))
        .setDescription("Selecione abaixo o que você deseja editar. As alterações são salvas individualmente.")
        .addFields(
            { name: '🏷️ Nome', value: guild.name || 'Não definido', inline: true },
            { name: '🎨 Cor', value: guild.color || 'Padrão do Bot', inline: true },
            { name: '🖼️ Logo URL', value: guild.logo || 'Nenhum', inline: true },
            { name: '🚩 Banner URL', value: guild.banner || 'Nenhum', inline: true },
            // Adicione o campo Link se desejar editá-lo também
            // { name: '🔗 Link URL', value: guild.link || 'Nenhum', inline: true },
            { name: '📝 Descrição', value: guild.description || 'Não definida', inline: false }
        )
        .setFooter({ text: `ID da Guilda (DB): ${guild.id}` })
        .setTimestamp();
}

function buildGuildEditButtons(guildMongoId) {
    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId(`guildedit_button_name_${guildMongoId}`).setLabel('Nome').setStyle(ButtonStyle.Primary).setEmoji('🏷️'),
            new ButtonBuilder().setCustomId(`guildedit_button_description_${guildMongoId}`).setLabel('Descrição').setStyle(ButtonStyle.Primary).setEmoji('📝'),
            new ButtonBuilder().setCustomId(`guildedit_button_logo_${guildMongoId}`).setLabel('Logo').setStyle(ButtonStyle.Primary).setEmoji('🖼️')
        );
    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId(`guildedit_button_color_${guildMongoId}`).setLabel('Cor').setStyle(ButtonStyle.Primary).setEmoji('🎨'),
            new ButtonBuilder().setCustomId(`guildedit_button_banner_${guildMongoId}`).setLabel('Banner').setStyle(ButtonStyle.Primary).setEmoji('🚩')
            // Adicione botão para Link se desejar editá-lo
            // new ButtonBuilder().setCustomId(`guildedit_button_link_${guildMongoId}`).setLabel('Link').setStyle(ButtonStyle.Primary).setEmoji('🔗')
        );
    return [row1, row2];
}

// --- Handler Principal do Botão "Editar Perfil" ---

async function handleGuildPanelEdit(interaction, guildIdSafe, globalConfig, client) {
    const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, false, true);
    if (!guild) {
        // getAndValidateGuild já deve ter respondido à interação se a guilda não for válida ou não houver permissão.
        console.log(`[DEBUG handleGuildPanelEdit] getAndValidateGuild retornou nulo para ${guildIdSafe}. Encerrando.`);
        return;
    }

    // Verificação CRUCIAL CORRIGIDA: Verifica por guild._id
    if (!guild._id || typeof guild._id.toString !== 'function') {
        console.error(`[CRITICAL editHandlers handleGuildPanelEdit] Guild object for ${guildIdSafe} (Nome: ${guild.name}) is missing '_id' or '_id.toString' is not a function. Guild object:`, JSON.stringify(guild, null, 2));
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: "❌ Erro interno ao preparar o painel de edição (ID da guilda ausente ou inválido). Por favor, contate um administrador.", ephemeral: true });
        }
        return;
    }

    // A função buildGuildEditEmbed pode precisar ser ajustada se ela também usa guild.id
    // Vamos garantir que ela também use guild._id
    const embed = buildGuildEditEmbed(guild, globalConfig);

    // Usa guild._id.toString() para o customId dos botões
    const buttons = buildGuildEditButtons(guild._id.toString());

    await interaction.reply({ embeds: [embed], components: buttons, ephemeral: true });
}

// --- Ajuste na função buildGuildEditEmbed ---
// Certifique-se de que o rodapé (footer) desta função também use guild._id

function buildGuildEditEmbed(guild, globalConfig) {
    return new EmbedBuilder()
        .setTitle(`Painel de Edição - ${guild.name}`)
        .setColor(resolveDisplayColor(guild.color, globalConfig))
        .setDescription("Selecione abaixo o que você deseja editar. As alterações são salvas individualmente.")
        .addFields(
            { name: '🏷️ Nome', value: guild.name || 'Não definido', inline: true },
            { name: '🎨 Cor', value: guild.color || 'Padrão do Bot', inline: true },
            { name: '🖼️ Logo URL', value: guild.logo || 'Nenhum', inline: true },
            { name: '🚩 Banner URL', value: guild.banner || 'Nenhum', inline: true },
            { name: '📝 Descrição', value: guild.description || 'Não definida', inline: false }
        )
        .setFooter({ text: `ID da Guilda (DB): ${guild._id}` }) // <-- CORRIGIDO para guild._id
        .setTimestamp();
}

// --- Handlers para cliques nos botões de edição (mostram os modais) ---

async function showSpecificEditModal(interaction, guildMongoId, fieldToEdit, globalConfig, client) {
    console.log(`[DEBUG showSpecificEditModal] RAW ENTRY - GuildMongoId: ${guildMongoId}, Field: ${fieldToEdit}, User: ${interaction.user.id}, CustomId: ${interaction.customId}`);
    console.log(`[DEBUG showSpecificEditModal] Interaction ID at entry: ${interaction.id}, Replied: ${interaction.replied}, Deferred: ${interaction.deferred}`);
    try {

        let guild;
        try {
            guild = await loadGuildById(guildMongoId);
        } catch (dbError) {
            console.error(`[DEBUG showSpecificEditModal] Error loading guild ID ${guildMongoId} from DB:`, dbError);
            // If interaction is deferred and not replied, try to followUp.
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ Erro ao carregar dados da guilda. Tente novamente.', flags: MessageFlags.Ephemeral }).catch(e => console.error("Reply error after DB load fail:", e));
            }
            return; // Stop further processing
        }


        if (!guild) {
            console.log(`[DEBUG showSpecificEditModal] Guild not found for ID: ${guildMongoId}`);
            // If interaction is deferred and not replied, try to followUp.
            if (!interaction.replied && !interaction.deferred) {
                 await interaction.reply({ content: '❌ Guilda não encontrada para edição. Tente novamente.', flags: MessageFlags.Ephemeral }).catch(e => console.error("Reply error for guild not found:", e));
            }
            return; // Stop further processing
        }
        console.log(`[DEBUG showSpecificEditModal] Guild loaded: ${guild.name}`);

        let member;
        try {
            member = await interaction.guild.members.fetch(interaction.user.id);
        } catch (fetchError) {
            console.error(`[DEBUG showSpecificEditModal] Failed to fetch member ${interaction.user.id}:`, fetchError);
            // If interaction is deferred and not replied, try to followUp.
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ Não foi possível verificar suas permissões neste servidor.', flags: MessageFlags.Ephemeral }).catch(e => console.error("Reply error after member fetch fail:", e));
            }
            return; // Stop further processing
        }
        console.log(`[DEBUG showSpecificEditModal] Member fetched: ${member.user.tag}`);

        const isOwner = guild.ownerId === interaction.user.id;
        const isLeader = guild.leader && guild.leader.id === interaction.user.id;
        const isCoLeader = guild.coLeader && guild.coLeader.id === interaction.user.id;
        const moderatorRoles = globalConfig.moderatorRoles || [];
        const isAdmin = member.roles.cache.some(role => moderatorRoles.includes(role.id));
        console.log(`[DEBUG showSpecificEditModal] Permissions: isOwner=${isOwner}, isLeader=${isLeader}, isCoLeader=${isCoLeader}, isAdmin=${isAdmin}`);

        if (!isOwner && !isLeader && !isCoLeader && !isAdmin) {
            console.log(`[DEBUG showSpecificEditModal] Permission denied for user: ${interaction.user.tag}`);
            // If interaction is deferred and not replied, try to followUp.
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: "❌ Você não tem permissão para editar esta guilda.", flags: MessageFlags.Ephemeral }).catch(e => console.error("Reply error for permission denied:", e));
            }
            return; // Stop further processing
        }

        console.log(`[DEBUG showSpecificEditModal] Field to edit: ${fieldToEdit}`);
        let modal;

        switch (fieldToEdit) {
            case 'name':
                modal = new ModalBuilder().setCustomId(`guildedit_modal_name_${guildMongoId}`).setTitle(`Editar Nome - ${guild.name}`);
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('field_value').setLabel("Novo Nome da Guilda").setStyle(TextInputStyle.Short)
                        .setValue(guild.name).setRequired(true).setMinLength(3).setMaxLength(50)
                ));
                break;
            case 'description':
                modal = new ModalBuilder().setCustomId(`guildedit_modal_description_${guildMongoId}`).setTitle(`Editar Descrição - ${guild.name}`);
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('field_value').setLabel("Nova Descrição").setStyle(TextInputStyle.Paragraph)
                        .setValue(guild.description || '').setRequired(false).setMaxLength(500)
                ));
                break;
            case 'logo':
                modal = new ModalBuilder().setCustomId(`guildedit_modal_logo_${guildMongoId}`).setTitle(`Editar Logo - ${guild.name}`);
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('field_value').setLabel("Nova URL do Logo").setStyle(TextInputStyle.Short)
                        .setValue(guild.logo || '').setRequired(false).setPlaceholder("https://exemplo.com/logo.png")
                ));
                break;
            case 'color':
                modal = new ModalBuilder().setCustomId(`guildedit_modal_color_${guildMongoId}`).setTitle(`Editar Cor - ${guild.name}`);
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('field_value').setLabel("Nova Cor (Hex, Nome ou 'random')").setStyle(TextInputStyle.Short)
                        .setValue(guild.color || '').setRequired(false).setPlaceholder("#FF0000, red, blue, random")
                ));
                break;
            case 'banner':
                modal = new ModalBuilder().setCustomId(`guildedit_modal_banner_${guildMongoId}`).setTitle(`Editar Banner - ${guild.name}`);
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('field_value').setLabel("Nova URL do Banner").setStyle(TextInputStyle.Short)
                        .setValue(guild.banner || '').setRequired(false).setPlaceholder("https://exemplo.com/banner.png")
                ));
                break;
            default:
                console.log(`[DEBUG showSpecificEditModal] Invalid field to edit: ${fieldToEdit}`);
                // If interaction is deferred and not replied, try to followUp.
                if (!interaction.replied && !interaction.deferred) { 
                     await interaction.reply({ content: '❌ Campo de edição inválido selecionado.', flags: MessageFlags.Ephemeral }).catch(e => console.error("Reply error for invalid field:", e));
                }
                return; // Stop further processing
        }
        
        console.log(`[DEBUG showSpecificEditModal] Modal built for field: ${fieldToEdit}. Custom ID: ${modal.data.custom_id}`);
        try {
            // Crucial check before showModal
            if (interaction.replied || interaction.deferred) { 
                console.error(`[CRITICAL showSpecificEditModal] Interaction ID: ${interaction.id}. State is ALREADY replied or deferred before direct showModal attempt. Replied: ${interaction.replied}, Deferred: ${interaction.deferred}`);
                // Do not attempt showModal if this condition is met, as it will fail.
            } else {
                await interaction.showModal(modal);
                console.log(`[DEBUG showSpecificEditModal] Modal shown successfully for field: ${fieldToEdit}`);
            }
        } catch (modalError) {
            console.error(`[DEBUG showSpecificEditModal] Error showing modal for field ${fieldToEdit}:`, modalError);
            // If showModal fails, the interaction might have been replied to by Discord's error.
            // Avoid followUp here to prevent another "InteractionAlreadyReplied".
        }
    } catch (error) { // Outer catch for the entire function
        console.error(`[ERROR in showSpecificEditModal] GuildMongoId: ${guildMongoId}, Field: ${fieldToEdit}, User: ${interaction.user.id}, Error:`, error);
        // If no reply/defer has happened yet, attempt to reply with an error.
        if (!interaction.replied && !interaction.deferred) { 
            try {
                await interaction.reply({ content: '❌ Ocorreu um erro crítico ao tentar exibir o formulário de edição. Por favor, tente novamente.', flags: MessageFlags.Ephemeral });
            } catch (followUpError) {
                console.error('[ERROR in showSpecificEditModal] Failed to send critical error followUp:', followUpError);
            }
        }
    }
}

// Funções wrapper para cada botão
async function handleGuildShowEditNameModal(interaction, guildMongoId, globalConfig, client) {
    console.log(`[DEBUG editHandlers] ENTERING handleGuildShowEditNameModal for guild ${guildMongoId}`);
    await showSpecificEditModal(interaction, guildMongoId, 'name', globalConfig, client);
}
async function handleGuildShowEditDescriptionModal(interaction, guildMongoId, globalConfig, client) {
    console.log(`[DEBUG editHandlers] ENTERING handleGuildShowEditDescriptionModal for guild ${guildMongoId}`);
    await showSpecificEditModal(interaction, guildMongoId, 'description', globalConfig, client);
}
async function handleGuildShowEditLogoModal(interaction, guildMongoId, globalConfig, client) {
    console.log(`[DEBUG editHandlers] ENTERING handleGuildShowEditLogoModal for guild ${guildMongoId}`);
    await showSpecificEditModal(interaction, guildMongoId, 'logo', globalConfig, client);
}
async function handleGuildShowEditColorModal(interaction, guildMongoId, globalConfig, client) {
    console.log(`[DEBUG editHandlers] ENTERING handleGuildShowEditColorModal for guild ${guildMongoId}`);
    await showSpecificEditModal(interaction, guildMongoId, 'color', globalConfig, client);
}
async function handleGuildShowEditBannerModal(interaction, guildMongoId, globalConfig, client) {
    console.log(`[DEBUG editHandlers] ENTERING handleGuildShowEditBannerModal for guild ${guildMongoId}`);
    await showSpecificEditModal(interaction, guildMongoId, 'banner', globalConfig, client);
}

// --- Handlers de Submissão de Modais Individuais ---

async function handleGenericFieldEditSubmit(interaction, guildMongoId, fieldName, fieldLabel, globalConfig, client, validationFn) {
    await interaction.deferUpdate(); // Acknowledge a interação do modal para evitar erro, não envia resposta visível ainda.

    const guild = await loadGuildById(guildMongoId);
    if (!guild) {
        return interaction.followUp({ content: '❌ Guilda não encontrada para salvar a alteração.', flags: MessageFlags.Ephemeral });
    }
     // Validar permissão novamente
    const memberInteraction = await interaction.guild.members.fetch(interaction.user.id);
    const isOwnerSubmit = guild.ownerId === interaction.user.id;
    const isLeaderSubmit = guild.leader && guild.leader.id === interaction.user.id;
    const isCoLeaderSubmit = guild.coLeader && guild.coLeader.id === interaction.user.id;
    const isAdminSubmit = memberInteraction.roles.cache.some(role => globalConfig.moderatorRoles.includes(role.id));

    if (!isOwnerSubmit && !isLeaderSubmit && !isCoLeaderSubmit && !isAdminSubmit) {
        return interaction.followUp({ content: "❌ Você não tem mais permissão para editar esta guilda.", flags: MessageFlags.Ephemeral });
    }

    const newValue = interaction.fields.getTextInputValue('field_value').trim();
    const oldValue = guild[fieldName];

    let processedNewValue = newValue || null; // Tratar string vazia como null para a maioria dos campos

    // Validação específica do campo
    if (validationFn) {
        const validationError = await validationFn(processedNewValue, guild, globalConfig, client);
        if (validationError) {
            // No longer trying to edit the original message. Send a follow-up.
            return interaction.followUp({ content: validationError, flags: MessageFlags.Ephemeral });
        }
    }
    
    if ((oldValue === null && processedNewValue === null) || String(oldValue) === String(processedNewValue)) {
        // No longer trying to edit the original message. Send a follow-up.
        return interaction.followUp({ content: `ℹ️ Nenhuma alteração detectada para ${fieldLabel}.`, flags: MessageFlags.Ephemeral });
    }

    guild[fieldName] = processedNewValue;
    guild.updatedAt = new Date().toISOString();
    guild.updatedBy = interaction.user.id;

    await saveGuildData(guild);

    const logFields = [
        { name: 'Guilda', value: guild.name, inline: true },
        { name: 'Campo Editado', value: fieldLabel, inline: true },
        { name: 'Editado por', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Valor Antigo', value: `\`\`\`${oldValue || 'Nenhum/Padrão'}\`\`\``, inline: false },
        { name: 'Valor Novo', value: `\`\`\`${guild[fieldName] || 'Nenhum/Padrão'}\`\`\``, inline: false },
    ];
    await sendLogMessage(client, globalConfig, interaction, `Edição de Guilda - ${fieldLabel}`, `O campo ${fieldLabel} da guilda **${guild.name}** foi atualizado.`, logFields);

    await manageGuildForumPost(client, guild, globalConfig, 'update', interaction);
    client.emit('updateLeaderboard');

    // Send a new follow-up message instead of trying to edit the original ephemeral message.
    // The original panel (which was ephemeral) won't be updated directly.
    // The user receives a confirmation, and subsequent interactions with the panel will show fresh data.
    await interaction.followUp({ content: `✅ ${fieldLabel} da guilda atualizado com sucesso! Para ver as alterações no painel, por favor, use o comando novamente.`, flags: MessageFlags.Ephemeral });
}

// --- Funções de Validação Específicas ---
async function validateName(value, guild, globalConfig, client) {
    if (!value || value.length < 3 || value.length > 50) { // Adicionado check para !value
        return `❌ O nome da guilda deve ter entre 3 e 50 caracteres. O nome fornecido tem ${value ? value.length : 0} caracteres.`;
    }
    const existingGuildWithNewName = await loadGuildByName(value);
    if (existingGuildWithNewName && existingGuildWithNewName.id.toString() !== guild.id.toString()) {
        return `❌ Já existe uma guilda chamada "**${value}**". Por favor, escolha outro nome.`;
    }
    return null; // Sem erro
}

function validateUrl(value, fieldType = "URL") { 
    if (value && (!value.startsWith('http://') && !value.startsWith('https://'))) {
        return `❌ A ${fieldType} deve ser uma URL válida começando com http:// ou https://.`;
    }
    if (value && (fieldType === "Logo URL" || fieldType === "Banner URL") && !/\.(jpeg|jpg|gif|png|webp)$/i.test(value)) {
        return `❌ A ${fieldType} não parece ser uma imagem válida (deve terminar com .jpg, .png, .gif, .webp, etc.).`;
    }
    return null;
}

function validateColor(value) {
    if (value && !/^#([0-9A-F]{3}){1,2}$/i.test(value) && !Object.keys(COLOR_MAP).includes(value.toLowerCase()) && value.toLowerCase() !== 'random') {
        return `❌ A cor "${value}" é inválida. Use um código hexadecimal (ex: \`#FF0000\`), um nome de cor padrão (ex: \`red\`), ou \`random\`.`;
    }
    return null;
}

// --- Handlers de Submissão Específicos (usam o genérico) ---
async function handleGuildEditNameSubmit(interaction, guildMongoId, globalConfig, client) {
    await handleGenericFieldEditSubmit(interaction, guildMongoId, 'name', 'Nome da Guilda', globalConfig, client, validateName);
}
async function handleGuildEditDescriptionSubmit(interaction, guildMongoId, globalConfig, client) {
    await handleGenericFieldEditSubmit(interaction, guildMongoId, 'description', 'Descrição', globalConfig, client, (val) => {
        if (val && val.length > 500) return "❌ A descrição não pode exceder 500 caracteres.";
        return null;
    });
}
async function handleGuildEditLogoSubmit(interaction, guildMongoId, globalConfig, client) {
    await handleGenericFieldEditSubmit(interaction, guildMongoId, 'logo', 'Logo URL', globalConfig, client, (val) => validateUrl(val, "Logo URL"));
}
async function handleGuildEditColorSubmit(interaction, guildMongoId, globalConfig, client) {
    await handleGenericFieldEditSubmit(interaction, guildMongoId, 'color', 'Cor da Guilda', globalConfig, client, validateColor);
}
async function handleGuildEditBannerSubmit(interaction, guildMongoId, globalConfig, client) {
    await handleGenericFieldEditSubmit(interaction, guildMongoId, 'banner', 'Banner URL', globalConfig, client, (val) => validateUrl(val, "Banner URL"));
}

module.exports = {
    handleGuildPanelEdit,          
    handleGuildShowEditNameModal,
    handleGuildShowEditDescriptionModal,
    handleGuildShowEditLogoModal,
    handleGuildShowEditColorModal,
    handleGuildShowEditBannerModal,
    handleGuildEditNameSubmit,
    handleGuildEditDescriptionSubmit,
    handleGuildEditLogoSubmit,
    handleGuildEditColorSubmit,
    handleGuildEditBannerSubmit,
};
