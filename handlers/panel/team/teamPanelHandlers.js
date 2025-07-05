// handlers/panel/teamPanelHandlers.js
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const { loadTeamByName, saveTeamData, isUserInAnyTeam } = require('../../db/teamDb');
const { getAndValidateGuild } = require('../../utils/validation'); // Reutilizaremos para permissões de moderador
const { sendLogMessage } = require('../../utils/logManager');
const { resolveDisplayColor, COLOR_MAP } = require('../../utils/constants');
const { processRosterInput } = require('../roster/rosterUtils'); // Reutilizar o processRosterInput
const { isUserInAnyGuild } = require('../../db/guildDb'); // Para verificar se membro já está em guilda

const TEAM_MAX_ROSTER_SIZE = 5; // Exemplo, defina conforme sua necessidade

// --- Editar Perfil do Time (Nome, Logo, Cor) ---
async function handleTeamPanelEditProfile(interaction, teamIdSafe, globalConfig, client) {
    const teamName = teamIdSafe.replace(/-/g, ' ');
    const team = await loadTeamByName(teamName);

    if (!team) return interaction.reply({ content: '❌ Time não encontrado.', ephemeral: true });

    // Validação de permissão (Líder do time ou Moderador)
    const isModerator = interaction.member.permissions.has('Administrator') ||
                        (globalConfig.moderatorRoles && globalConfig.moderatorRoles.some(roleId => interaction.member.roles.cache.has(roleId)));
    if (team.leader.id !== interaction.user.id && !isModerator) {
        return interaction.reply({ content: '❌ Você não tem permissão para editar este time.', ephemeral: true });
    }

    const modal = new ModalBuilder()
        .setCustomId(`modal_teampanel_editprofile_${teamIdSafe}`)
        .setTitle(`Editar Perfil - ${team.name}`);

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('team_new_name').setLabel("Novo Nome do Time (Opcional)")
                .setStyle(TextInputStyle.Short).setValue(team.name).setRequired(false).setMaxLength(50)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('team_logo_url').setLabel("Nova URL do Logo (Opcional)")
                .setStyle(TextInputStyle.Short).setValue(team.logo || '').setPlaceholder("https://exemplo.com/logo.png").setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('team_color').setLabel("Nova Cor (Hex, Nome ou 'random')")
                .setStyle(TextInputStyle.Short).setValue(team.color || '').setPlaceholder("#FF0000, red, random").setRequired(false)
        )
    );
    await interaction.showModal(modal);
}

async function handleTeamPanelEditProfileSubmit(interaction, teamIdSafe, globalConfig, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const originalTeamName = teamIdSafe.replace(/-/g, ' ');
    const team = await loadTeamByName(originalTeamName);

    if (!team) return interaction.editReply({ content: '❌ Time não encontrado para salvar alterações.' });

    const isModerator = interaction.member.permissions.has('Administrator') ||
                        (globalConfig.moderatorRoles && globalConfig.moderatorRoles.some(roleId => interaction.member.roles.cache.has(roleId)));
    if (team.leader.id !== interaction.user.id && !isModerator) {
        return interaction.editReply({ content: '❌ Você não tem permissão para editar este time.' });
    }

    const newName = interaction.fields.getTextInputValue('team_new_name')?.trim() || team.name;
    const newLogo = interaction.fields.getTextInputValue('team_logo_url')?.trim() || null;
    const newColor = interaction.fields.getTextInputValue('team_color')?.trim() || team.color;

    let changed = false;
    const logFields = [{ name: 'Time Editado', value: originalTeamName, inline: true }];

    if (newName && newName !== team.name) {
        if (newName.length < 3 || newName.length > 50) {
            return interaction.editReply({ content: '❌ O nome do time deve ter entre 3 e 50 caracteres.' });
        }
        const existingTeamWithNewName = await loadTeamByName(newName);
        if (existingTeamWithNewName && existingTeamWithNewName._id.toString() !== team._id.toString()) {
            return interaction.editReply({ content: `❌ Já existe um time chamado "${newName}".` });
        }
        logFields.push({ name: 'Nome Alterado', value: `De: \`${team.name}\`\nPara: \`${newName}\``, inline: false });
        team.name = newName;
        changed = true;
    }

    if (newLogo !== team.logo) {
        if (newLogo && (!newLogo.startsWith('https://') || !/\.(jpeg|jpg|gif|png|webp)$/i.test(newLogo))) {
            return interaction.editReply({ content: '❌ URL do logo inválida. Use https:// e um formato de imagem válido.' });
        }
        logFields.push({ name: 'Logo Alterada', value: newLogo ? `[Nova Logo](${newLogo})` : 'Logo Removida', inline: false });
        team.logo = newLogo;
        changed = true;
    }
    if (newColor.toLowerCase() !== (team.color || '').toLowerCase()) {
         if (newColor && !/^#([0-9A-F]{3}){1,2}$/i.test(newColor) && !Object.keys(COLOR_MAP).includes(newColor.toLowerCase()) && newColor.toLowerCase() !== 'random') {
            return interaction.editReply({ content: '❌ Cor inválida. Use Hex, nome de cor ou "random".' });
        }
        logFields.push({ name: 'Cor Alterada', value: `De: \`${team.color || 'Padrão'}\`\nPara: \`${newColor}\``, inline: false });
        team.color = newColor;
        changed = true;
    }

    if (!changed) {
        return interaction.editReply({ content: 'ℹ️ Nenhuma alteração detectada.' });
    }

    team.updatedAt = new Date().toISOString();
    team.updatedBy = interaction.user.id;
    await saveTeamData(team);

    client.emit('updateTeamLeaderboard'); // Evento para ranking de times

    await sendLogMessage(client, globalConfig, interaction, 'Edição de Perfil de Time', `Perfil do time **${team.name}** (antes: ${originalTeamName}) foi atualizado.`, logFields);
    await interaction.editReply({ content: `✅ Perfil do time **${team.name}** atualizado com sucesso!` });
}


// --- Gerenciar Roster do Time (Adicionar/Remover em Massa) ---
async function handleTeamPanelManageRoster(interaction, teamIdSafe, globalConfig, client) {
    const teamName = teamIdSafe.replace(/-/g, ' ');
    const team = await loadTeamByName(teamName);
    if (!team) return interaction.reply({ content: '❌ Time não encontrado.', ephemeral: true });

    const isModerator = interaction.member.permissions.has('Administrator') ||
                        (globalConfig.moderatorRoles && globalConfig.moderatorRoles.some(roleId => interaction.member.roles.cache.has(roleId)));
    if (team.leader.id !== interaction.user.id && !isModerator) {
        return interaction.reply({ content: '❌ Você não tem permissão para gerenciar o roster deste time.', ephemeral: true });
    }

    const modal = new ModalBuilder()
        .setCustomId(`modal_teampanel_manageroster_${teamIdSafe}`)
        .setTitle(`Gerenciar Roster - ${team.name}`);

    const currentRosterIds = team.roster.map(p => `<@${p.id}>`).join(', ');

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('team_member_ids').setLabel(`Membros (IDs separados por vírgula) Max: ${TEAM_MAX_ROSTER_SIZE}`)
                .setStyle(TextInputStyle.Paragraph).setValue(currentRosterIds).setPlaceholder("ID1, @Jogador2, ID3...").setRequired(false)
        )
    );
    await interaction.showModal(modal);
}

async function handleTeamPanelManageRosterSubmit(interaction, teamIdSafe, globalConfig, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const teamName = teamIdSafe.replace(/-/g, ' ');
    const team = await loadTeamByName(teamName);

    if (!team) return interaction.editReply({ content: '❌ Time não encontrado para salvar alterações.' });

    const isModerator = interaction.member.permissions.has('Administrator') ||
                        (globalConfig.moderatorRoles && globalConfig.moderatorRoles.some(roleId => interaction.member.roles.cache.has(roleId)));
    if (team.leader.id !== interaction.user.id && !isModerator) {
        return interaction.editReply({ content: '❌ Você não tem permissão para gerenciar o roster deste time.' });
    }

    const memberIdsList = interaction.fields.getTextInputValue('team_member_ids');
    const { memberIds: newMemberIds, errors: inputErrors } = await processRosterInput(memberIdsList);

    if (inputErrors.length > 0) {
        return interaction.editReply({ content: `❌ Erros na lista de IDs:\n• ${inputErrors.join('\n• ')}` });
    }
    if (newMemberIds.length > TEAM_MAX_ROSTER_SIZE) {
        return interaction.editReply({ content: `❌ O roster do time não pode exceder ${TEAM_MAX_ROSTER_SIZE} membros.` });
    }

    const validatedRoster = [];
    const playerErrors = [];
    const COOLDOWN_DAYS_TEAM = globalConfig.teamCooldownDays || 3; // Cooldown específico para times ou padrão

    for (const id of newMemberIds) {
        if (id === team.leader.id) { // Líder já é implicitamente parte do time
            if (!validatedRoster.some(p => p.id === id)) { // Adiciona se não estiver já (caso o líder se coloque na lista)
                 const leaderMember = await client.users.fetch(id).catch(() => null);
                 if (leaderMember) validatedRoster.push({ id: leaderMember.id, username: leaderMember.username });
            }
            continue;
        }
        const member = await client.users.fetch(id).catch(() => null);
        if (!member) {
            playerErrors.push(`Usuário com ID \`${id}\` não encontrado.`);
            continue;
        }

        const userInOtherTeam = await isUserInAnyTeam(id);
        if (userInOtherTeam && userInOtherTeam._id.toString() !== team._id.toString()) {
            playerErrors.push(`${member.tag} já está no time "${userInOtherTeam.name}".`);
            continue;
        }
        const userInAnyOtherGuild = await isUserInAnyGuild(id);
         if (userInAnyOtherGuild) {
            playerErrors.push(`${member.tag} já está na guilda "${userInAnyOtherGuild.name}" e não pode estar em um time.`);
            continue;
        }
        validatedRoster.push({ id: member.id, username: member.username });
    }

    if (playerErrors.length > 0) {
        return interaction.editReply({ content: `❌ Erros ao validar membros:\n• ${playerErrors.join('\n• ')}` });
    }
    
    // Garante que o líder esteja no roster se não tiver sido explicitamente adicionado e houver espaço
    if (!validatedRoster.some(p => p.id === team.leader.id) && validatedRoster.length < TEAM_MAX_ROSTER_SIZE) {
        const leaderUser = await client.users.fetch(team.leader.id).catch(() => null);
        if (leaderUser) {
            validatedRoster.unshift({ id: leaderUser.id, username: leaderUser.username }); // Adiciona no início
        }
    }


    team.roster = validatedRoster;
    team.updatedAt = new Date().toISOString();
    team.updatedBy = interaction.user.id;
    await saveTeamData(team);

    client.emit('updateTeamLeaderboard');

    await sendLogMessage(client, globalConfig, interaction, 'Gerenciamento de Roster de Time', `Roster do time **${team.name}** atualizado. ${team.roster.length} membros.`, [
        { name: 'Time', value: team.name, inline: true },
        { name: 'Novo Roster', value: team.roster.map(p => `<@${p.id}>`).join(', ') || '*Vazio*', inline: false },
    ]);
    await interaction.editReply({ content: `✅ Roster do time **${team.name}** atualizado com sucesso!` });
}


module.exports = {
    handleTeamPanelEditProfile,
    handleTeamPanelEditProfileSubmit,
    handleTeamPanelManageRoster,
    handleTeamPanelManageRosterSubmit,
};
