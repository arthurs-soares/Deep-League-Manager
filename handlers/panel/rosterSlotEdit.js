// handlers/panel/rosterSlotEdit.js
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { loadGuildByName, saveGuildData, isUserInAnyGuild } = require('../db/guildDb'); 
const { saveConfig } = require('../db/configDb');
const { sendLogMessage } = require('../utils/logManager');
const { getAndValidateGuild } = require('../utils/validation');
const { manageGuildForumPost } = require('../../utils/guildForumPostManager');
// Funções e constantes do nosso rosterUtils.js
const { validateMemberEligibility, applyLeaveCooldown, analyzeRosterChangesForSlotEdit, COOLDOWN_DAYS: SLOT_EDIT_COOLDOWN_DAYS } = require('./rosterUtils');

const MAX_ROSTER_SIZE = 5; // Usado para o loop dos slots

async function handleGuildPanelTrocarJogador_Initial(interaction, guildIdSafe, globalConfig, client) {
    console.log(`[DIAGNÓSTICO SLOT] handleGuildPanelTrocarJogador_Initial INICIADO para guilda: ${guildIdSafe}`);
    try {
        const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, false, true);
        if (!guild) {
            return { error: true, content: `❌ Guilda "${guildIdSafe}" não encontrada ou você não tem permissão para editá-la.`, flags: MessageFlags.Ephemeral };
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`roster_select_type_${guildIdSafe}`)
            .setPlaceholder('Escolha qual roster deseja editar...');

        selectMenu.addOptions([
                { label: 'Roster Principal', description: 'Edite os jogadores do Roster Principal (slots 1-5).', value: 'main', emoji: '🛡️' },
                { label: 'Roster Reserva', description: 'Edite os jogadores do Roster Reserva (slots 1-5).', value: 'sub', emoji: '⚔️' },
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        console.log(`[DIAGNÓSTICO SLOT] handleGuildPanelTrocarJogador_Initial: Retornando menu de seleção de roster.`);
        return { type: 'content', content: `Qual roster de **${guild.name}** você gostaria de editar por slot?`, components: [row], flags: MessageFlags.Ephemeral };
    } catch (error) {
        console.error(`❌ [DIAGNÓSTICO SLOT] ERRO FATAL em handleGuildPanelTrocarJogador_Initial:`, error);
        return { error: true, content: `❌ Ocorreu um erro ao iniciar a edição por slot. Detalhes: ${error.message}`, flags: MessageFlags.Ephemeral };
    }
}

async function handleGuildPanelTrocarJogador_RosterSelect(interaction, guildIdSafe, globalConfig, client) {
    console.log(`[DIAGNÓSTICO SLOT] handleGuildPanelTrocarJogador_RosterSelect INICIADO para guilda: ${guildIdSafe}, rosterType: ${interaction.values[0]}`);
    try {
        const rosterType = interaction.values[0];
        const guild = await loadGuildByName(guildIdSafe.replace(/-/g, ' '));
        if (!guild) {
            return interaction.reply({ content: '❌ Guilda não encontrada. A operação foi cancelada.', ephemeral: true });
        }

        const modal = new ModalBuilder()
            .setCustomId(`roster_edit_modal_${rosterType}_${guildIdSafe}`)
            .setTitle(`Editar Roster ${rosterType === 'main' ? 'Principal' : 'Reserva'} - ${guild.name}`);

        const currentRoster = rosterType === 'main' ? guild.mainRoster : guild.subRoster;

        for (let i = 0; i < MAX_ROSTER_SIZE; i++) {
            const playerInfo = currentRoster[i] || { id: '', username: '' };
            
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId(`${rosterType}_slot_${i + 1}`)
                        .setLabel(`Slot ${i + 1} (ID ou @Menção)`)
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder("Deixe vazio para remover.")
                        .setRequired(false)
                        .setValue(playerInfo.id ? `<@${playerInfo.id}>` : '') // Sempre usa menção ou vazio
                )
            );
        }
        
        console.log(`[DIAGNÓSTICO SLOT] handleGuildPanelTrocarJogador_RosterSelect: Mostrando modal para edição de slots.`);
        await interaction.showModal(modal);

    } catch (error) {
        console.error(`❌ [DIAGNÓSTICO SLOT] ERRO FATAL em handleGuildPanelTrocarJogador_RosterSelect:`, error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: `❌ Ocorreu um erro ao preparar o formulário de edição por slot.`, ephemeral: true });
        }
    }
}

async function handleGuildPanelTrocarJogador_RosterSubmit(interaction, guildIdSafe, globalConfig, client) {
    console.log(`[DIAGNÓSTICO SLOT] handleGuildPanelTrocarJogador_RosterSubmit INICIADO para guilda: ${guildIdSafe}`);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const parts = interaction.customId.split('_');
        const rosterType = parts[3]; 
        const guild = await getAndValidateGuild(guildIdSafe, interaction, globalConfig, client, loadGuildByName, false, true);
        if (!guild) {
            console.log(`[DIAGNÓSTICO SLOT] handleGuildPanelTrocarJogador_RosterSubmit: Guilda inválida ou sem permissão.`);
            return; // Já respondido por getAndValidateGuild
        }

        const oldMainRoster = [...guild.mainRoster];
        const oldSubRoster = [...guild.subRoster];

        const newProposedRoster = []; 
        const errors = [];
        const processedUserIdsInSubmission = new Set(); 

        for (let i = 0; i < MAX_ROSTER_SIZE; i++) {
            const input = interaction.fields.getTextInputValue(`${rosterType}_slot_${i + 1}`);
            if (!input) continue; 

            let cleanedId = input;
            const mentionMatch = input.match(/^<@!?(\d+)>$/);
            if (mentionMatch) {
                cleanedId = mentionMatch[1];
            }

            if (!/^\d+$/.test(cleanedId)) {
                errors.push(`ID inválido no slot ${i + 1}: \`${input}\`. Use ID numérico ou menção.`);
                continue;
            }

            if (processedUserIdsInSubmission.has(cleanedId)) {
                errors.push(`Usuário <@${cleanedId}> (${input}) duplicado no formulário. Por favor, insira cada jogador em um slot único.`);
                continue;
            }

            const member = await interaction.guild.members.fetch(cleanedId).catch(() => null);
            if (!member) {
                errors.push(`Usuário com ID \`${cleanedId}\` (slot ${i + 1}) não encontrado neste servidor.`);
                continue;
            }
            
            newProposedRoster.push({ id: member.id, username: member.user.username });
            processedUserIdsInSubmission.add(cleanedId);
        }

        if (errors.length > 0) {
            console.log(`[DIAGNÓSTICO SLOT] handleGuildPanelTrocarJogador_RosterSubmit: Erros de validação na submissão:`, errors);
            return interaction.editReply({ content: `❌ Erros na submissão:\n• ${errors.join('\n• ')}` });
        }

           const {
        playersAddedToGuild,
        playersTrulyRemovedFromGuild,
        playersMovedWithinGuild
    } = analyzeRosterChangesForSlotEdit(
        oldMainRoster,
        oldSubRoster,
        newProposedRoster,
        rosterType, // rosterType é o tipo sendo editado ('main' ou 'sub')
        guild.leader,
        guild.coLeader
    );

        const now = new Date(); // CORRIGIDO: new Date() para ter toISOString()
        for (const removedPlayerId of playersTrulyRemovedFromGuild) {
                    applyLeaveCooldown(removedPlayerId, globalConfig);
        console.log(`[DIAGNÓSTICO SLOT] Cooldown aplicado para ${removedPlayerId} (removido da guilda).`);
        }

        const newPlayersWithCooldownChecks = [];
        for (const addedPlayerId of playersAddedToGuild) {
            const member = await client.users.fetch(addedPlayerId).catch(() => null);
            if (!member) {
                errors.push(`Usuário com ID \`${addedPlayerId}\` (adicionado) não encontrado neste servidor.`);
                continue;
            }

            const validation = await validateMemberEligibility(addedPlayerId, guild, globalConfig, member); // member aqui é o user object
            if (!validation.elegible) {
                errors.push(validation.error);
                continue;
            }

            globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => u.userId !== addedPlayerId);
            newPlayersWithCooldownChecks.push(addedPlayerId); 
        }

        const threeDaysAgo = new Date(now.getTime() - (COOLDOWN_DAYS * 24 * 60 * 60 * 1000)); 
        globalConfig.recentlyLeftUsers = globalConfig.recentlyLeftUsers.filter(u => new Date(u.leaveTimestamp) > threeDaysAgo);
        
        await saveConfig(globalConfig); 

        if (rosterType === 'main') {
            guild.mainRoster = newProposedRoster;
        } else {
            guild.subRoster = newProposedRoster;
        }

        guild.updatedAt = new Date().toISOString();
        guild.updatedBy = interaction.user.id;

        await saveGuildData(guild);

        await manageGuildForumPost(client, guild, globalConfig, 'update', interaction);

        client.emit('updateLeaderboard');

        let replyMessage = `✅ Rosters da guilda **${guild.name}** atualizados:\n`;

        const currentMainRosterDisplay = guild.mainRoster.length > 0
            ? guild.mainRoster.map((p, idx) => `${idx + 1}. <@${p.id}>`).join('\n')
            : '*Vazio*';
        
        const currentSubRosterDisplay = guild.subRoster.length > 0
            ? guild.subRoster.map((p, idx) => `${idx + 1}. <@${p.id}>`).join('\n')
            : '*Vazio*';

        replyMessage += `\n**🛡️ Roster Principal (${guild.mainRoster.length}/${MAX_ROSTER_SIZE}):**\n${currentMainRosterDisplay}\n`;
        replyMessage += `\n**⚔️ Roster Reserva (${guild.subRoster.length}/${MAX_ROSTER_SIZE}):**\n${currentSubRosterDisplay}\n`;

        if (playersTrulyRemovedFromGuild.length > 0) {
            const removedTags = await Promise.all(playersTrulyRemovedFromGuild.map(async id => {
                const user = await client.users.fetch(id).catch(() => null);
                return user ? user.tag : `ID:${id}`;
            }));
            replyMessage += `\n**Jogadores Removidos (cooldown aplicado):** ${removedTags.join(', ')}\n`;
        }
        if (playersMovedWithinGuild.length > 0) {
            const movedTags = await Promise.all(playersMovedWithinGuild.map(async id => {
                const user = await client.users.fetch(id).catch(() => null);
                return user ? user.tag : `ID:${id}`;
            }));
            replyMessage += `\n**Jogadores Movidos (sem cooldown):** ${movedTags.join(', ')}\n`;
        }
        if (newPlayersWithCooldownChecks.length > 0) {
             const addedTags = await Promise.all(newPlayersWithCooldownChecks.map(async id => {
                const user = await client.users.fetch(id).catch(() => null);
                return user ? user.tag : `ID:${id}`;
            }));
            replyMessage += `\n**Jogadores Adicionados:** ${addedTags.join(', ')}\n`;
        }


        if (errors.length > 0) {
            replyMessage += `\n**⚠️ Erros encontrados durante a atualização:**\n• ${errors.join('\n• ')}\n`;
        }
        
        await sendLogMessage(
            client, globalConfig, interaction, 
            'Edição de Roster por Slot', 
            `Rosters da guilda **${guild.name}** atualizados por slot.`,
            [
                { name: 'Guilda', value: guild.name, inline: true },
                { name: 'Tipo de Roster Editado', value: rosterType === 'main' ? 'Principal' : 'Reserva', inline: true },
                { name: 'Membros no Roster Principal (novo)', value: `${guild.mainRoster.length}`, inline: true },
                { name: 'Membros no Roster Reserva (novo)', value: `${guild.subRoster.length}`, inline: true },
                { name: 'Jogadores Removidos (Cooldown)', value: `${playersTrulyRemovedFromGuild.length}`, inline: true },
                { name: 'Jogadores Movidos', value: `${playersMovedWithinGuild.length}`, inline: true },
                { name: 'Jogadores Adicionados (novos)', value: `${newPlayersWithCooldownChecks.length}`, inline: true },
                { name: 'Detalhes de Erros', value: errors.length > 0 ? errors.join('\n') : '*Nenhum*', inline: false },
            ]
        );

        await interaction.editReply({ content: replyMessage });
    } catch (error) {
        console.error(`❌ [DIAGNÓSTICO SLOT] ERRO FATAL em handleGuildPanelTrocarJogador_RosterSubmit:`, error);
        await interaction.editReply({ content: `❌ Ocorreu um erro ao processar a submissão do formulário. Detalhes: ${error.message}`, flags: MessageFlags.Ephemeral });
    }
}

module.exports = {
    handleGuildPanelTrocarJogador_Initial,
    handleGuildPanelTrocarJogador_RosterSelect,
    handleGuildPanelTrocarJogador_RosterSubmit,
};