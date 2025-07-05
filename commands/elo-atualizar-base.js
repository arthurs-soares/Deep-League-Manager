// commands/elo-atualizar-base.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getDatabaseInstance } = require('../utils/database');
const { ELO_CONFIG, ELO_CHANGE_REASONS } = require('../utils/eloConstants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('elo-atualizar-base')
        .setDescription('Atualiza o ELO base de todos os usuários (apenas administradores)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, client, globalConfig) {
        // Verificar permissões
        const member = interaction.guild.members.cache.get(interaction.user.id);
        const isModerator = member.permissions.has('Administrator') ||
                           (globalConfig.moderatorRoles || []).some(roleId => member.roles.cache.has(roleId));
        
        if (!isModerator) {
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Sem Permissão')
                    .setDescription('Apenas moderadores ou administradores podem executar este comando.')
                    .setTimestamp()],
                ephemeral: true
            });
        }

        // Resposta inicial
        await interaction.deferReply();

        try {
            const db = getDatabaseInstance();
            
            // Buscar todos os perfis de usuários
            const userProfiles = await db.collection('user_profiles').find({}).toArray();
            
            const totalProfiles = userProfiles.length;
            let updatedCount = 0;
            let skippedCount = 0;
            
            // Atualizar cada perfil
            const progressEmbed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('🔄 Atualizando ELO Base')
                .setDescription(`Iniciando atualização de ${totalProfiles} perfis...`)
                .setTimestamp();
            
            await interaction.editReply({ embeds: [progressEmbed] });
            
            // Processar em lotes para não sobrecarregar
            const batchSize = 20;
            const batches = Math.ceil(totalProfiles / batchSize);
            
            for (let i = 0; i < batches; i++) {
                const start = i * batchSize;
                const end = Math.min(start + batchSize, totalProfiles);
                const batch = userProfiles.slice(start, end);
                
                for (const profile of batch) {
                    const userId = profile._id;
                    
                    // Verificar se o perfil tem dados de ELO
                    if (!profile.eloData) {
                        profile.eloData = {
                            currentElo: ELO_CONFIG.STARTING_ELO,
                            peakElo: ELO_CONFIG.STARTING_ELO,
                            eloHistory: [],
                            mvpCount: 0,
                            flawlessWins: 0,
                            flawlessLosses: 0,
                            lastEloUpdate: new Date().toISOString()
                        };
                        updatedCount++;
                    } else {
                        // Se o ELO atual já é igual ao valor desejado, pular
                        if (profile.eloData.currentElo === ELO_CONFIG.STARTING_ELO) {
                            skippedCount++;
                            continue;
                        }
                        
                        // Registrar o ELO antigo para o histórico
                        const oldElo = profile.eloData.currentElo;
                        
                        // Atualizar ELO atual
                        profile.eloData.currentElo = ELO_CONFIG.STARTING_ELO;
                        
                        // Atualizar ELO de pico se necessário
                        if (ELO_CONFIG.STARTING_ELO > profile.eloData.peakElo) {
                            profile.eloData.peakElo = ELO_CONFIG.STARTING_ELO;
                        }
                        
                        // Adicionar entrada ao histórico
                        const historyEntry = {
                            matchId: `reset_${Date.now()}`,
                            date: new Date().toISOString(),
                            eloChange: ELO_CONFIG.STARTING_ELO - oldElo,
                            newElo: ELO_CONFIG.STARTING_ELO,
                            reason: ELO_CHANGE_REASONS.RESET,
                            matchResult: null,
                            guildName: null,
                            operatorId: interaction.user.id
                        };
                        
                        // Adicionar ao início do histórico
                        if (!profile.eloData.eloHistory) {
                            profile.eloData.eloHistory = [];
                        }
                        
                        profile.eloData.eloHistory.unshift(historyEntry);
                        
                        // Limitar o tamanho do histórico
                        if (profile.eloData.eloHistory.length > ELO_CONFIG.MAX_HISTORY_ENTRIES) {
                            profile.eloData.eloHistory = profile.eloData.eloHistory.slice(0, ELO_CONFIG.MAX_HISTORY_ENTRIES);
                        }
                        
                        // Atualizar timestamp da última atualização
                        profile.eloData.lastEloUpdate = new Date().toISOString();
                        
                        updatedCount++;
                    }
                    
                    // Salvar as alterações no banco de dados
                    await db.collection('user_profiles').updateOne(
                        { _id: userId },
                        { $set: { eloData: profile.eloData } }
                    );
                }
                
                // Atualizar o embed de progresso a cada lote
                const progress = Math.round(((i + 1) * batchSize / totalProfiles) * 100);
                progressEmbed.setDescription(`Progresso: ${Math.min((i + 1) * batchSize, totalProfiles)}/${totalProfiles} perfis (${progress}%)`);
                await interaction.editReply({ embeds: [progressEmbed] });
            }
            
            // Embed final com o resumo
            const successEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Atualização Concluída')
                .setDescription(`O ELO base de todos os usuários foi atualizado para ${ELO_CONFIG.STARTING_ELO}.`)
                .addFields(
                    { name: 'Total de Perfis', value: `${totalProfiles}`, inline: true },
                    { name: 'Perfis Atualizados', value: `${updatedCount}`, inline: true },
                    { name: 'Perfis Pulados', value: `${skippedCount}`, inline: true }
                )
                .setFooter({ text: `Solicitado por ${interaction.user.tag}` })
                .setTimestamp();
            
            await interaction.editReply({ embeds: [successEmbed] });
            
        } catch (error) {
            console.error('Erro durante a atualização de ELO:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro na Atualização')
                .setDescription(`Ocorreu um erro durante a atualização do ELO base: ${error.message}`)
                .setTimestamp();
            
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },
};