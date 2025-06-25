// handlers/panel/editHandlers.js
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { loadGuildByName, loadGuildById, saveGuildData } = require('../db/guildDb');
const { loadTeamByName, loadTeamById, saveTeamData } = require('../db/teamDb');
const { sendLogMessage } = require('../utils/logManager');
const { resolveDisplayColor, COLOR_MAP } = require('../utils/constants');
const { getAndValidateGuild } = require('../utils/validation'); // Manteremos para guildas
const { manageGuildForumPost } = require('../../utils/guildForumPostManager');

// --- FUNÇÕES HELPER GENÉRICAS ---

function buildEntityEditEmbed(entity, entityType, globalConfig) {
    const typeName = entityType === 'guild' ? 'Guilda' : 'Time';
    const embed = new EmbedBuilder()
        .setTitle(`Painel de Edição - ${entity.name}`)
        .setColor(resolveDisplayColor(entity.color, globalConfig))
        .setDescription(`Selecione abaixo o que você deseja editar no(a) ${typeName.toLowerCase()}. As alterações são salvas individualmente.`)
        .addFields(
            { name: '🏷️ Nome', value: entity.name || 'Não definido', inline: true },
            { name: '🎨 Cor', value: entity.color || 'Padrão do Bot', inline: true },
            { name: '🖼️ Logo URL', value: entity.logo || 'Nenhum', inline: true },
        )
        .setFooter({ text: `ID da Entidade: ${entity.id}` })
        .setTimestamp();

    if (entityType === 'guild') {
        embed.addFields(
            { name: '🚩 Banner URL', value: entity.banner || 'Nenhum', inline: true },
            { name: '📝 Descrição', value: entity.description || 'Não definida', inline: false }
        );
    }

    return embed;
}

function buildEntityEditButtons(entityType, entityMongoId) {
    const customIdPrefix = `${entityType}edit_button`;
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${customIdPrefix}_name_${entityMongoId}`).setLabel('Nome').setStyle(ButtonStyle.Primary).setEmoji('🏷️'),
        new ButtonBuilder().setCustomId(`${customIdPrefix}_logo_${entityMongoId}`).setLabel('Logo').setStyle(ButtonStyle.Primary).setEmoji('🖼️'),
        new ButtonBuilder().setCustomId(`${customIdPrefix}_color_${entityMongoId}`).setLabel('Cor').setStyle(ButtonStyle.Primary).setEmoji('🎨')
    );
    const components = [row1];

    if (entityType === 'guild') {
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`${customIdPrefix}_description_${entityMongoId}`).setLabel('Descrição').setStyle(ButtonStyle.Primary).setEmoji('📝'),
            new ButtonBuilder().setCustomId(`${customIdPrefix}_banner_${entityMongoId}`).setLabel('Banner').setStyle(ButtonStyle.Primary).setEmoji('🚩')
        );
        components.push(row2);
    }
    return components;
}

// --- HANDLER PRINCIPAL DO BOTÃO "EDITAR PERFIL" ---

async function handleEntityPanelEdit(interaction, entityType, entityId, globalConfig, client) {
    let entity;
    const typeName = entityType === 'guild' ? 'Guilda' : 'Time';

    if (entityType === 'guild') {
        entity = await getAndValidateGuild(entityId.replace(/-/g, ' '), interaction, globalConfig, client, loadGuildByName, false, true);
    } else {
        // Validação de permissão para times
        entity = await loadTeamByName(entityId.replace(/-/g, ' '));
        if (entity) {
            const isLeader = entity.leader.id === interaction.user.id;
            const isModerator = interaction.member.permissions.has(PermissionFlagsBits.Administrator); // Simplificado
            if (!isLeader && !isModerator) {
                return interaction.reply({ content: `❌ Apenas o líder do time ou moderadores podem editar o perfil.`, ephemeral: true });
            }
        }
    }
    
    if (!entity) return interaction.reply({ content: `❌ ${typeName} não encontrada.`, ephemeral: true });

    const embed = buildEntityEditEmbed(entity, entityType, globalConfig);
    const buttons = buildEntityEditButtons(entityType, entity.id.toString());
    await interaction.reply({ embeds: [embed], components: buttons, flags: MessageFlags.Ephemeral });
}

// --- HANDLER PARA CLIQUE NOS BOTÕES DE EDIÇÃO (MOSTRA MODAIS) ---

async function showSpecificEditModal(interaction, entityType, entityMongoId, fieldToEdit, globalConfig, client) {
    let entity;
    const typeName = entityType === 'guild' ? 'Guilda' : 'Time';
    
    if (entityType === 'guild') {
        entity = await loadGuildById(entityMongoId);
    } else {
        entity = await loadTeamById(entityMongoId);
    }

    if (!entity) return interaction.reply({ content: `❌ ${typeName} não encontrada para edição.`, ephemeral: true });
    
    // Validação de permissão
    const isLeader = entity.leader.id === interaction.user.id;
    const isCoLeader = entityType === 'guild' ? entity.coLeader?.id === interaction.user.id : false;
    const isModerator = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    if (!isLeader && !isCoLeader && !isModerator) {
        return interaction.reply({ content: `❌ Você não tem permissão para editar este(a) ${typeName.toLowerCase()}.`, ephemeral: true });
    }

    const modalIdPrefix = `${entityType}edit_modal`;
    let modal;

    switch (fieldToEdit) {
        case 'name':
            modal = new ModalBuilder().setCustomId(`${modalIdPrefix}_name_${entityMongoId}`).setTitle(`Editar Nome - ${entity.name}`);
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('field_value').setLabel(`Novo Nome do(a) ${typeName}`).setStyle(TextInputStyle.Short).setValue(entity.name).setRequired(true).setMaxLength(50)
            ));
            break;
        case 'description': // Apenas Guilda
            if (entityType !== 'guild') return;
            modal = new ModalBuilder().setCustomId(`${modalIdPrefix}_description_${entityMongoId}`).setTitle(`Editar Descrição - ${entity.name}`);
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('field_value').setLabel("Nova Descrição").setStyle(TextInputStyle.Paragraph).setValue(entity.description || '').setRequired(false).setMaxLength(500)
            ));
            break;
        case 'logo':
            modal = new ModalBuilder().setCustomId(`${modalIdPrefix}_logo_${entityMongoId}`).setTitle(`Editar Logo - ${entity.name}`);
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('field_value').setLabel("Nova URL do Logo").setStyle(TextInputStyle.Short).setValue(entity.logo || '').setRequired(false).setPlaceholder("https://exemplo.com/logo.png")
            ));
            break;
        case 'color':
            modal = new ModalBuilder().setCustomId(`${modalIdPrefix}_color_${entityMongoId}`).setTitle(`Editar Cor - ${entity.name}`);
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('field_value').setLabel("Nova Cor (Hex, Nome ou 'random')").setStyle(TextInputStyle.Short).setValue(entity.color || '').setRequired(false).setPlaceholder("#FF0000, red, random")
            ));
            break;
        case 'banner': // Apenas Guilda
            if (entityType !== 'guild') return;
            modal = new ModalBuilder().setCustomId(`${modalIdPrefix}_banner_${entityMongoId}`).setTitle(`Editar Banner - ${entity.name}`);
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('field_value').setLabel("Nova URL do Banner").setStyle(TextInputStyle.Short).setValue(entity.banner || '').setRequired(false).setPlaceholder("https://exemplo.com/banner.png")
            ));
            break;
        default:
            return interaction.reply({ content: '❌ Campo de edição inválido.', ephemeral: true });
    }
    await interaction.showModal(modal);
}

// --- HANDLER DE SUBMISSÃO DE MODAIS ---

async function handleGenericFieldEditSubmit(interaction, entityType, entityMongoId, fieldName, fieldLabel, globalConfig, client) {
    await interaction.deferUpdate();

    let entity, saveFunction, loadByNameFunction;
    const typeName = entityType === 'guild' ? 'Guilda' : 'Time';

    if (entityType === 'guild') {
        entity = await loadGuildById(entityMongoId);
        saveFunction = saveGuildData;
        loadByNameFunction = loadGuildByName;
    } else {
        entity = await loadTeamById(entityMongoId);
        saveFunction = saveTeamData;
        loadByNameFunction = loadTeamByName;
    }

    if (!entity) return interaction.followUp({ content: `❌ ${typeName} não encontrada.`, ephemeral: true });

    const newValue = interaction.fields.getTextInputValue('field_value').trim();
    const oldValue = entity[fieldName];

    // Validação
    if (fieldName === 'name') {
        const existingEntity = await loadByNameFunction(newValue);
        if (existingEntity && existingEntity.id.toString() !== entity.id.toString()) {
            return interaction.followUp({ content: `❌ Já existe um(a) ${typeName.toLowerCase()} com o nome "${newValue}".`, ephemeral: true });
        }
    }

    if (fieldName === 'logo' || fieldName === 'banner') {
        if (newValue && !newValue.startsWith('https://')) {
            return interaction.followUp({ content: '❌ A URL deve começar com `https://`.', ephemeral: true });
        }
    }
    
    entity[fieldName] = newValue || null;
    entity.updatedAt = new Date().toISOString();
    entity.updatedBy = interaction.user.id;

    await saveFunction(entity);

    if (entityType === 'guild') {
        await manageGuildForumPost(client, entity, globalConfig, 'update', interaction);
        client.emit('updateLeaderboard');
    } else {
        client.emit('updateTeamLeaderboard');
    }

    await sendLogMessage(client, globalConfig, interaction, `Edição de ${typeName}`, `O campo ${fieldLabel} de **${entity.name}** foi atualizado.`);
    await interaction.followUp({ content: `✅ ${fieldLabel} do(a) ${typeName.toLowerCase()} atualizado com sucesso!`, ephemeral: true });
}

module.exports = {
    handleEntityPanelEdit,
    showSpecificEditModal,
    handleGenericFieldEditSubmit,
};