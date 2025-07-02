// commands/elo-resetar-peak.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getDatabaseInstance } = require('../utils/database');
const { ELO_CONFIG, ELO_CHANGE_REASONS } = require('../utils/eloConstants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('elo-resetar-peak')
        .setDescription('Reseta o ELO de pico de todos os usuários para o valor atual (apenas administradores)')
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
                .setTitle('🔄 Resetando ELO de Pico')
                .setDescription(`Iniciando reset de ${totalProfiles} perfis...`)
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
                        // Registrar o ELO de pico antigo
                        const oldPeakElo = profile.eloData.peakElo;
                        
                        // Resetar o ELO de pico para o valor atual
                        // Usamos o maior valor entre o ELO atual e o ELO inicial
                        profile.eloData.peakElo = Math.max(profile.eloData.currentElo, ELO_CONFIG.STARTING_ELO);
                        
                        // Se não houve mudança, pular
                        if (profile.eloData.peakElo === oldPeakElo) {
                            skippedCount++;
                            continue;
                        }
                        
                        // Adicionar entrada ao histórico
                        const historyEntry = {
                            matchId: `peak_reset_${Date.now()}`,
                            date: new Date().toISOString(),
                            eloChange: 0, // Não altera o ELO atual, apenas o peak
                            newElo: profile.eloData.currentElo,
                            reason: ELO_CHANGE_REASONS.RESET,
                            matchResult: null,
                            guildName: null,
                            operatorId: interaction.user.id,
                            notes: `Peak ELO resetado de ${oldPeakElo} para ${profile.eloData.peakElo}`
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
                .setTitle('✅ Reset de Peak ELO Concluído')
                .setDescription(`O ELO de pico de todos os usuários foi resetado para o valor atual.`)
                .addFields(
                    { name: 'Total de Perfis', value: `${totalProfiles}`, inline: true },
                    { name: 'Perfis Atualizados', value: `${updatedCount}`, inline: true },
                    { name: 'Perfis Pulados', value: `${skippedCount}`, inline: true }
                )
                .setFooter({ text: `Solicitado por ${interaction.user.tag}` })
                .setTimestamp();
            
            await interaction.editReply({ embeds: [successEmbed] });
            
        } catch (error) {
            console.error('Erro durante o reset de Peak ELO:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro no Reset')
                .setDescription(`Ocorreu um erro durante o reset do ELO de pico: ${error.message}`)
                .setTimestamp();
            
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },
};