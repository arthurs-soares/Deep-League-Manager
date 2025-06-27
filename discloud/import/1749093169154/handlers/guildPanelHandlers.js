// handlers/guildPanelHandlers.js
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { getDb } = require('../utils/database'); // Importa a função que fornece a instância do DB

// --- Mapeamento de Nomes de Cores para Hexadecimal ---
const COLOR_MAP = {
    'default': '#000000',
    'blue': '#3498DB',
    'green': '#2ECC71',
    'grey': '#95A5A6',
    'gray': '#95A5A6',
    'red': '#E74C3C',
    'dark_red': '#992D22',
    'dark_blue': '#206694',
    'dark_green': '#1ABC9C',
    'purple': '#9B59B6',
    'yellow': '#FEE75C',
    'gold': '#F1C40F',
    'orange': '#E67E22',
    'fuchsia': '#EB459E',
    'dark_purple': '#71368A',
    'navy': '#34495E',
    'dark_navy': '#2C3E50',
    'luminous_vivid_pink': '#FF007F',
    'dark_gold': '#C27C0E',
    'dark_orange': '#A84300',
    'dark_vivid_cyan': '#009778',
    'light_grey': '#BCC0C0',
    'light_gray': '#BCC0C0',
    'dark_theme': '#2C2F33',
    'blurple': '#5865F2',
    'not_quite_black': '#23272A',
    'white': '#FFFFFF',
    'black': '#000000',
};

// --- FUNÇÕES DE ACESSO AO BANCO DE DADOS (Base) ---

function getDatabaseInstance() {
    try {
        const db = getDb();
        console.log(`[DB Debug] getDatabaseInstance: DB instance obtained successfully.`); // ATIVADO
        return db;
    } catch (e) {
        console.error("❌ ERRO: getDb() falhou em getDatabaseInstance:", e.message);
        throw new Error("Conexão com o banco de dados não disponível.");
    }
}

async function loadGuildByName(guildName) {
    const db = getDatabaseInstance();
    try {
        const guild = await db.collection('guilds').findOne({ name: guildName });
        console.log(`[DB Debug] loadGuildByName('${guildName}'):`, guild ? 'Encontrada' : 'Não encontrada'); // ATIVADO
        return guild;
    } catch (error) {
        console.error(`❌ Erro ao carregar guilda "${guildName}" por nome no DB:`, error);
        throw error;
    }
}

async function loadAllGuilds() {
    const db = getDatabaseInstance();
    try {
        const guilds = await db.collection('guilds').find({}).toArray();
        console.log(`[DB Debug] loadAllGuilds: ${guilds.length} guildas carregadas.`); // ATIVADO
        return guilds;
    } catch (error) {
        console.error("❌ Erro ao carregar todas as guildas do DB:", error);
        throw error;
    }
}

async function saveGuildData(guildData) {
    const db = getDatabaseInstance();
    try {
        const result = await db.collection('guilds').updateOne(
            { name: guildData.name },
            { $set: guildData },
            { upsert: true }
        );
        console.log(`[DB Debug] saveGuildData('${guildData.name}'):`, result); // ATIVADO
        if (result.upsertedCount > 0) {
            console.log(`✅ Guilda "${guildData.name}" inserida com sucesso no DB.`);
        } else if (result.modifiedCount > 0) {
            console.log(`✅ Guilda "${guildData.name}" atualizada com sucesso no DB.`);
        } else {
            console.log(`ℹ️ Guilda "${guildData.name}" não alterada (já estava atualizada ou sem modificações).`);
        }
        return guildData;
    } catch (error) {
        console.error("❌ Erro ao salvar dados da guilda no DB:", error);
        throw error;
    }
}

async function deleteGuildByName(guildName) {
    const db = getDatabaseInstance();
    try {
        const result = await db.collection('guilds').deleteOne({ name: guildName });
        console.log(`[DB Debug] deleteGuildByName('${guildName}'):`, result); // ATIVADO
        if (result.deletedCount > 0) {
            console.log(`✅ Guilda "${guildName}" deletada com sucesso do DB.`);
            return true;
        } else {
            console.log(`ℹ️ Guilda "${guildName}" não encontrada para deleção no DB.`);
            return false;
        }
    } catch (error) {
        console.error(`❌ Erro ao deletar guilda "${guildName}" por nome no DB:`, error);
        throw error;
    }
}

async function findGuildByLeader(userId) {
    const db = getDatabaseInstance();
    try {
        const guild = await db.collection('guilds').findOne({
            $or: [
                { 'leader.id': userId },
                { 'coLeader.id': userId }
            ]
        });
        console.log(`[DB Debug] findGuildByLeader('${userId}'):`, guild ? 'Encontrada' : 'Não encontrada'); // ATIVADO
        return guild;
    } catch (error) {
        console.error(`❌ Erro ao encontrar guilda para o líder/co-líder ${userId} no DB:`, error);
        throw error;
    }
}

// --- FUNÇÕES DE CONFIGURAÇÃO (para salvar e carregar configurações globais do bot) ---

async function loadConfig() {
    const db = getDatabaseInstance();
    try {
        const config = await db.collection('bot_configs').findOne({ _id: "global_config" });
        console.log(`[DB Debug] loadConfig: Config carregada:`, config ? 'Encontrada' : 'Não encontrada'); // ATIVADO
        return config || {}; // Retorna um objeto vazio se não encontrar config
    } catch (error) {
        console.error("❌ Erro ao carregar a configuração do bot do DB:", error);
        throw error;
    }
}

async function saveConfig(configData) {
    const db = getDatabaseInstance();
    try {
        const result = await db.collection('bot_configs').updateOne(
            { _id: "global_config" }, // Filtra pelo ID fixo
            { $set: configData },
            { upsert: true } // Cria se não existir
        );
        console.log(`[DB Debug] saveConfig: Config salva/atualizada:`, result); // ATIVADO
        console.log("✅ Configuração do bot salva/atualizada no DB.");
        return result;
    } catch (error) {
        console.error("❌ Erro ao salvar a configuração do bot no DB:", error);
        throw error;
    }
}


// --- FUNÇÃO UTILITÁRIA PARA VALIDAÇÃO DE GUILDA E PERMISSÕES (PARA HANDLERS DE UI) ---

async function getAndValidateGuild(guildIdSafe, interaction, requireLeader = false, allowCoLeader = true) {
    const guildName = guildIdSafe.replace(/-/g, ' ');
    const guild = await loadGuildByName(guildName); // Já usa log interno

    if (!guild) {
        await interaction.reply({ content: '❌ Guilda não encontrada.', ephemeral: true });
        return null;
    }

    const isLeader = guild.leader?.id === interaction.user.id;
    const isCoLeader = guild.coLeader?.id === interaction.user.id;

    if (requireLeader && !isLeader) {
        await interaction.reply({ content: '❌ Apenas o líder principal pode realizar esta ação.', ephemeral: true });
        return null;
    }
    if (!requireLeader && !isLeader && (!allowCoLeader || !isCoLeader)) {
        await interaction.reply({ content: '❌ Você não tem permissão para realizar esta ação na guilda.', ephemeral: true });
        return null;
    }

    return guild;
}


// --- HANDLERS DO PAINEL (Lógica de Interação de UI) ---

async function handleGuildPanelEdit(interaction, guildIdSafe) {
    const guild = await getAndValidateGuild(guildIdSafe, interaction, false, true); 
    if (!guild) return; 

    const modal = new ModalBuilder()
        .setCustomId(`modal_guildpanel_edit_${guildIdSafe}`)
        .setTitle(`Editar Perfil - ${guild.name}`);

    const descriptionInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel("Descrição da Guilda")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Descreva sua guilda (máx. 500 caracteres)")
        .setRequired(false)
        .setMaxLength(500)
        .setValue(guild.description || '');

    const logoInput = new TextInputBuilder()
        .setCustomId('logo_url')
        .setLabel("URL da Imagem do Logo (Opcional)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: https://exemplo.com/logo.png")
        .setRequired(false)
        .setValue(guild.logo || '');
    
    const linkInput = new TextInputBuilder()
        .setCustomId('link_url')
        .setLabel("URL de Link da Guilda (Opcional)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Link do Discord/Site/etc.")
        .setRequired(false)
        .setValue(guild.link || '');

    const colorInput = new TextInputBuilder()
        .setCustomId('new_color')
        .setLabel("Cor do Painel (Hex ou Nome)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: #FF0000, blue, green, random")
        .setRequired(false)
        .setValue(guild.color || '#3498DB');

    modal.addComponents(
        new ActionRowBuilder().addComponents(descriptionInput),
        new ActionRowBuilder().addComponents(logoInput),
        new ActionRowBuilder().addComponents(linkInput),
        new ActionRowBuilder().addComponents(colorInput)
    );

    await interaction.showModal(modal);
}

async function handleGuildPanelEditSubmit(interaction, guildIdSafe) {
    await interaction.deferReply({ ephemeral: true });

    const guild = await getAndValidateGuild(guildIdSafe, interaction, false, true); 
    if (!guild) return;

    const newDescription = interaction.fields.getTextInputValue('description');
    const newLogo = interaction.fields.getTextInputValue('logo_url');
    const newLink = interaction.fields.getTextInputValue('link_url');
    let newColor = interaction.fields.getTextInputValue('new_color').trim();

    guild.description = newDescription || null;
    guild.logo = newLogo || null;
    guild.link = newLink || null;

    if (newColor) {
        const isValidHex = /^#([0-9A-F]{3}){1,2}$/i.test(newColor);
        const isValidNamedColor = Object.keys(COLOR_MAP).includes(newColor.toLowerCase());
        
        if (!isValidHex && !isValidNamedColor && newColor.toLowerCase() !== 'random') {
            await interaction.followUp({ content: `⚠️ A cor "${newColor}" é inválida e não foi aplicada. Use um código hexadecimal (ex: \`#FF0000\`), um nome de cor padrão (ex: \`red\`, \`blue\`), ou \`random\`.`, ephemeral: true });
            newColor = guild.color || '#3498DB';
            guild.color = newColor;
        } else {
            if (isValidNamedColor) {
                guild.color = newColor.toLowerCase(); 
            } else if (newColor.toLowerCase() === 'random') {
                guild.color = 'random'; 
            } else { // É um hexadecimal válido
                if (!newColor.startsWith('#')) newColor = `#${newColor}`;
                guild.color = newColor;
            }
        }
    } else {
        guild.color = '#3498DB'; 
    }

    guild.updatedAt = new Date().toISOString();
    guild.updatedBy = interaction.user.id;

    await saveGuildData(guild);

    const embed = new EmbedBuilder()
        .setTitle('✅ Perfil da Guilda Atualizado!')
        .setColor(COLOR_MAP[guild.color?.toLowerCase()] || guild.color || '#3498DB') 
        .setDescription(`As informações de **${guild.name}** foram atualizadas com sucesso!`)
        .addFields(
            { name: 'Descrição', value: newDescription || '*Não definida*', inline: false },
            { name: 'Logo URL', value: newLogo || '*Não definida*', inline: false },
            { name: 'Link URL', value: newLink || '*Não definida*', inline: false },
            { name: 'Cor do Painel', value: `\`${guild.color || '#3498DB'}\``, inline: false } 
        )
        .setFooter({ text: `Atualizado por ${interaction.user.tag}` })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function handleGuildPanelAddmember(interaction, guildIdSafe) {
    const guild = await getAndValidateGuild(guildIdSafe, interaction, false, true); 
    if (!guild) return;

    const modal = new ModalBuilder()
        .setCustomId(`modal_guildpanel_addmember_${guildIdSafe}`)
        .setTitle(`Adicionar Membro - ${guild.name}`);

    const memberIdInput = new TextInputBuilder()
        .setCustomId('member_id')
        .setLabel("ID do Discord do Membro")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("ID do usuário para adicionar")
        .setRequired(true);

    const rosterTypeInput = new TextInputBuilder()
        .setCustomId('roster_type')
        .setLabel("Tipo de Roster (main/sub)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Digite 'main' ou 'sub'")
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(memberIdInput),
        new ActionRowBuilder().addComponents(rosterTypeInput)
    );

    await interaction.showModal(modal);
}

async function handleGuildPanelAddmemberSubmit(interaction, guildIdSafe) {
    await interaction.deferReply({ ephemeral: true });

    const guild = await getAndValidateGuild(guildIdSafe, interaction, false, true); 
    if (!guild) return;

    const memberId = interaction.fields.getTextInputValue('member_id');
    let rosterType = interaction.fields.getTextInputValue('roster_type').toLowerCase();

    if (!/^\d+$/.test(memberId)) {
        return interaction.editReply({ content: '❌ O ID do membro fornecido é inválido. Deve ser numérico.' });
    }
    if (rosterType !== 'main' && rosterType !== 'sub') {
        return interaction.editReply({ content: '❌ Tipo de roster inválido. Use "main" ou "sub".' });
    }

    const member = await interaction.guild.members.fetch(memberId).catch(() => null);
    if (!member) {
        return interaction.editReply({ content: `❌ Usuário com ID \`${memberId}\` não encontrado neste servidor.` });
    }

    const memberObj = { id: member.id, username: member.user.username };

    const isAlreadyInMain = guild.mainRoster.some(m => m.id === member.id);
    const isAlreadyInSub = guild.subRoster.some(m => m.id === member.id);

    if (isAlreadyInMain || isAlreadyInSub) {
        return interaction.editReply({ content: `❌ O usuário ${member.toString()} já está em um dos rosters da guilda.` });
    }

    if (rosterType === 'main') {
        guild.mainRoster.push(memberObj);
    } else {
        guild.subRoster.push(memberObj);
    }

    guild.updatedAt = new Date().toISOString();
    guild.updatedBy = interaction.user.id;

    await saveGuildData(guild);

    await interaction.editReply({ content: `✅ Membro **${member.user.tag}** adicionado ao roster **${rosterType}** com sucesso!` });
}

async function handleGuildPanelRemovemember(interaction, guildIdSafe) {
    const guild = await getAndValidateGuild(guildIdSafe, interaction, false, true);
    if (!guild) return;

    const modal = new ModalBuilder()
        .setCustomId(`modal_guildpanel_removemember_${guildIdSafe}`)
        .setTitle(`Remover Membro - ${guild.name}`);

    const memberIdInput = new TextInputBuilder()
        .setCustomId('member_id')
        .setLabel("ID do Discord do Membro")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("ID do usuário para remover")
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(memberIdInput));

    await interaction.showModal(modal);
}

async function handleGuildPanelRemovememberSubmit(interaction, guildIdSafe) {
    await interaction.deferReply({ ephemeral: true });

    const guild = await getAndValidateGuild(guildIdSafe, interaction, false, true);
    if (!guild) return;

    const memberId = interaction.fields.getTextInputValue('member_id');

    if (!/^\d+$/.test(memberId)) {
        return interaction.editReply({ content: '❌ O ID do membro fornecido é inválido. Deve ser numérico.' });
    }

    let memberFound = false;
    guild.mainRoster = guild.mainRoster.filter(m => {
        if (m.id === memberId) {
            memberFound = true;
            return false;
        }
        return true;
    });

    if (!memberFound) {
        guild.subRoster = guild.subRoster.filter(m => {
            if (m.id === memberId) {
                memberFound = true;
                return false;
            }
            return true;
        });
    }

    if (!memberFound) {
        return interaction.editReply({ content: `❌ Usuário com ID \`${memberId}\` não encontrado em nenhum roster desta guilda.` });
    }

    guild.updatedAt = new Date().toISOString();
    guild.updatedBy = interaction.user.id;

    await saveGuildData(guild);

    const memberUser = await interaction.guild.members.fetch(memberId).catch(() => null);
    const memberTag = memberUser ? memberUser.user.tag : `usuário com ID ${memberId}`;

    await interaction.editReply({ content: `✅ Membro **${memberTag}** removido da guilda com sucesso!` });
}

async function handleGuildPanelSetcoleader(interaction, guildIdSafe) {
    const guild = await getAndValidateGuild(guildIdSafe, interaction, true); // Exige líder principal
    if (!guild) return;

    const modal = new ModalBuilder()
        .setCustomId(`modal_guildpanel_setcoleader_${guildIdSafe}`)
        .setTitle(`Trocar Vice-Líder - ${guild.name}`);

    const userIdInput = new TextInputBuilder()
        .setCustomId('coleader_id')
        .setLabel("ID do Discord do Novo Vice-Líder")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Deixe em branco para remover o vice-líder atual")
        .setRequired(false)
        .setValue(guild.coLeader ? guild.coLeader.id : '');

    modal.addComponents(new ActionRowBuilder().addComponents(userIdInput));
    
    await interaction.showModal(modal);
}

async function handleGuildPanelSetcoleaderSubmit(interaction, guildIdSafe) {
    await interaction.deferReply({ ephemeral: true });
    
    const guild = await getAndValidateGuild(guildIdSafe, interaction, true); 
    if (!guild) return;

    const newCoLeaderId = interaction.fields.getTextInputValue('coleader_id');

    if (!newCoLeaderId || newCoLeaderId.trim() === '') {
        if (!guild.coLeader) {
            return interaction.editReply({ content: '✅ Já não há um vice-líder definido.' });
        }
        guild.coLeader = null;
        await saveGuildData(guild);
        return interaction.editReply({ content: '✅ Vice-líder removido com sucesso!' });
    }
    
    if (!/^\d+$/.test(newCoLeaderId)) return interaction.editReply({ content: '❌ O ID fornecido é inválido. Deve ser numérico.' });
    if (newCoLeaderId === guild.leader.id) return interaction.editReply({ content: '❌ O vice-líder não pode ser o mesmo que o líder.' });
    
    const newCoLeaderMember = await interaction.guild.members.fetch(newCoLeaderId).catch(() => null);
    if (!newCoLeaderMember) return interaction.editReply({ content: `❌ Usuário com ID \`${newCoLeaderId}\` não encontrado neste servidor.` });

    if (guild.coLeader && guild.coLeader.id === newCoLeaderMember.id) {
        return interaction.editReply({ content: `✅ O usuário ${newCoLeaderMember.user.tag} já é o vice-líder.` });
    }

    guild.coLeader = { id: newCoLeaderMember.id, username: newCoLeaderMember.user.username };
    guild.updatedAt = new Date().toISOString();
    guild.updatedBy = interaction.user.id;

    await saveGuildData(guild);
    await interaction.editReply({ content: `✅ Vice-líder atualizado para **${newCoLeaderMember.user.tag}** com sucesso!` });
}

async function handleGuildPanelTransferleader(interaction, guildIdSafe) {
    const guild = await getAndValidateGuild(guildIdSafe, interaction, true); 
    if (!guild) return;

    const modal = new ModalBuilder()
        .setCustomId(`modal_guildpanel_transferleader_${guildIdSafe}`)
        .setTitle(`Transferir Liderança - ${guild.name}`);

    const newLeaderIdInput = new TextInputBuilder()
        .setCustomId('new_leader_id')
        .setLabel("ID do Discord do Novo Líder")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("ID do usuário que será o novo líder")
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(newLeaderIdInput));

    await interaction.showModal(modal);
}

async function handleGuildPanelTransferleaderSubmit(interaction, guildIdSafe) {
    await interaction.deferReply({ ephemeral: true });
    
    const guild = await getAndValidateGuild(guildIdSafe, interaction, true); 
    if (!guild) return;

    const newLeaderId = interaction.fields.getTextInputValue('new_leader_id');

    if (!/^\d+$/.test(newLeaderId)) {
        return interaction.editReply({ content: '❌ O ID fornecido é inválido. Deve ser numérico.' });
    }
    if (newLeaderId === guild.leader.id) {
        return interaction.editReply({ content: '❌ O novo líder não pode ser o mesmo que o atual.' });
    }

    const newLeaderMember = await interaction.guild.members.fetch(newLeaderId).catch(() => null);
    if (!newLeaderMember) {
        return interaction.editReply({ content: `❌ Usuário com ID \`${newLeaderId}\` não encontrado neste servidor.` });
    }

    const oldLeaderId = guild.leader.id;
    const oldLeaderUsername = guild.leader.username;

    guild.leader = { id: newLeaderMember.id, username: newLeaderMember.user.username };
    if (guild.coLeader?.id !== oldLeaderId && newLeaderMember.id !== oldLeaderId) {
         guild.coLeader = { id: oldLeaderId, username: oldLeaderUsername };
    } else if (guild.coLeader?.id === oldLeaderId) {
        guild.coLeader = null; 
    }
   
    guild.updatedAt = new Date().toISOString();
    guild.updatedBy = interaction.user.id;

    await saveGuildData(guild);

    await interaction.editReply({ content: `✅ Liderança da guilda **${guild.name}** transferida para **${newLeaderMember.user.tag}** com sucesso!` });
}


module.exports = {
    // Funções de dados
    loadGuildByName,
    loadAllGuilds,
    saveGuildData,
    deleteGuildByName,
    findGuildByLeader,
    // Handlers do Painel
    handleGuildPanelEdit,
    handleGuildPanelEditSubmit,
    handleGuildPanelAddmember,
    handleGuildPanelAddmemberSubmit,
    handleGuildPanelRemovemember,
    handleGuildPanelRemovememberSubmit,
    handleGuildPanelSetcoleader,
    handleGuildPanelSetcoleaderSubmit,
    handleGuildPanelTransferleader,
    handleGuildPanelTransferleaderSubmit,
    // NOVO: Exporte loadConfig e saveConfig para que outros comandos possam usá-los
    loadConfig,
    saveConfig,
};