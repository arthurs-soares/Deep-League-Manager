const { UserSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { loadGuildByName, saveGuildData } = require('../../db/guildDb');
const { getAndValidateGuild } = require('../../utils/validation');
const { sendLogMessage } = require('../../utils/logManager');

/**
 * Inicia o fluxo de troca de membros, apresentando os menus de seleção.
 */
async function handleGuildPanelSwapMember_Initial(interaction, guildIdSafe, client, globalConfig) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, false, true);
        if (!guild) return;

        if (guild.mainRoster.length === 0 || guild.subRoster.length === 0) {
            return interaction.editReply({
                content: '❌ Para trocar membros, é necessário ter pelo menos um membro em cada roster (Principal e Reserva).',
                components: [],
                flags: MessageFlags.Ephemeral
            });
        }

        const mainRosterMenu = new UserSelectMenuBuilder()
            .setCustomId(`swap_select_main_${guildIdSafe}`)
            .setPlaceholder('Selecione o membro do Roster Principal');

        const subRosterMenu = new UserSelectMenuBuilder()
            .setCustomId(`swap_select_sub_${guildIdSafe}`)
            .setPlaceholder('Selecione o membro do Roster Reserva');

        const confirmButton = new ButtonBuilder()
            .setCustomId(`swap_confirm_${guildIdSafe}_none_none`) // none_none são placeholders para os IDs dos usuários
            .setLabel('Confirmar Troca')
            .setStyle(ButtonStyle.Success)
            .setDisabled(true);

        const row1 = new ActionRowBuilder().addComponents(mainRosterMenu);
        const row2 = new ActionRowBuilder().addComponents(subRosterMenu);
        const row3 = new ActionRowBuilder().addComponents(confirmButton);

        await interaction.editReply({
            content: `**Troca de Membros para ${guild.name}**\n\n1. Selecione um membro do Roster Principal.\n2. Selecione um membro do Roster Reserva.\n3. Clique em "Confirmar Troca".`,
            components: [row1, row2, row3],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        console.error('Erro em handleGuildPanelSwapMember_Initial:', error);
        await interaction.editReply({ content: '❌ Ocorreu um erro ao iniciar a troca de membros.', components: [] });
    }
}

/**
 * Manipula a seleção de um usuário em um dos menus de troca.
 */
async function handleGuildPanelSwapMember_Select(interaction, guildIdSafe, client, globalConfig) {
    try {
        const [customIdPrefix, menuType, ...rest] = interaction.customId.split('_'); // e.g., swap_select_main_...
        const selectedUserId = interaction.values[0];

        // Atualiza o ID do botão de confirmação para incluir os selecionados
        const confirmButton = interaction.message.components[2].components[0];
        let [confirmPrefix, confirmAction, confirmGuildId, mainUserId, subUserId] = confirmButton.customId.split('_');
        
        if (menuType === 'main') {
            mainUserId = selectedUserId;
        } else {
            subUserId = selectedUserId;
        }

        const newConfirmButton = ButtonBuilder.from(confirmButton)
            .setCustomId(`swap_confirm_${guildIdSafe}_${mainUserId}_${subUserId}`)
            .setDisabled(mainUserId === 'none' || subUserId === 'none');

        const newRow3 = new ActionRowBuilder().addComponents(newConfirmButton);

        // Apenas atualiza a mensagem com o botão novo
        await interaction.update({
            components: [interaction.message.components[0], interaction.message.components[1], newRow3]
        });

    } catch (error) {
        console.error('Erro em handleGuildPanelSwapMember_Select:', error);
    }
}

/**
 * Executa a troca de membros após a confirmação.
 */
async function handleGuildPanelSwapMember_Confirm(interaction, guildIdSafe, mainUserId, subUserId, client, globalConfig) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, false, true);
        if (!guild) return;

        const mainMemberIndex = guild.mainRoster.findIndex(p => p.id === mainUserId);
        const subMemberIndex = guild.subRoster.findIndex(p => p.id === subUserId);

        if (mainMemberIndex === -1 || subMemberIndex === -1) {
            return interaction.editReply({ content: '❌ Um ou ambos os membros selecionados não foram encontrados nos rosters corretos. A troca foi cancelada.', components: [] });
        }

        const mainMember = guild.mainRoster[mainMemberIndex];
        const subMember = guild.subRoster[subMemberIndex];

        // Troca
        guild.mainRoster[mainMemberIndex] = subMember;
        guild.subRoster[subMemberIndex] = mainMember;

        guild.updatedAt = new Date().toISOString();
        guild.updatedBy = interaction.user.id;
        await saveGuildData(guild);
        client.emit('updateLeaderboard');

        const logMessage = `Membros trocados na guilda **${guild.name}**.`;
        const logFields = [
            { name: 'Guilda', value: guild.name, inline: true },
            { name: 'Saiu do Principal', value: `<@${mainMember.id}>`, inline: true },
            { name: 'Entrou no Principal', value: `<@${subMember.id}>`, inline: true },
        ];
        await sendLogMessage(client, globalConfig, interaction, 'Troca de Membros', logMessage, logFields);

        await interaction.editReply({
            content: `✅ Troca realizada com sucesso!\n<@${mainMember.id}> foi para o Roster Reserva.\n<@${subMember.id}> foi para o Roster Principal.`,
            components: []
        });

    } catch (error) {
        console.error('Erro em handleGuildPanelSwapMember_Confirm:', error);
        await interaction.editReply({ content: '❌ Ocorreu um erro ao confirmar a troca de membros.', components: [] });
    }
}


module.exports = {
    handleGuildPanelSwapMember_Initial,
    handleGuildPanelSwapMember_Select,
    handleGuildPanelSwapMember_Confirm
};
