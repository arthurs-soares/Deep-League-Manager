# 🤖 Deep League Manager - Guia da Comunidade

## 🎯 O que é o Deep League Manager?

O **Deep League Manager** é um bot Discord completo para gerenciamento de guildas, times e sistema competitivo com ELO ranqueado. Desenvolvido especificamente para comunidades de jogos que precisam de organização profissional e sistema de ranking justo.

## ⚡ Principais Funcionalidades

### 🏰 **Sistema de Guildas**
- **Registro e gerenciamento** de guildas com líderes e vice-líderes
- **Painel interativo** para gerenciar membros e configurações
- **Sistema de roster** com slots principais e substitutos
- **Perfis personalizados** com logo, banner e descrições

### 👥 **Sistema de Times**
- **Criação de times independentes** para competições específicas
- **Gerenciamento de roster** flexível
- **Liderança dedicada** por time

### ⚔️ **Sistema de Wars/Gladiadores**
- **Painel de tickets** para puxar wars automaticamente
- **Threads organizadas** para cada confronto
- **Sistema de aceitação** e controle de rounds
- **Logs automáticos** de todas as atividades

### 🏆 **Sistema ELO Ranqueado** *(NOVO!)*
- **6 Ranks competitivos**: D, C, B, A, A+, Grandmaster
- **Cálculo automático** baseado em resultados de partidas
- **Sistema MVP** com bonificações especiais
- **Multiplicadores dinâmicos** por faixa de ELO
- **Histórico completo** de mudanças e estatísticas

## 🎮 Como Usar - Comandos Principais

### 👤 **Para Jogadores**
```
/perfil [usuário] - Ver perfil completo com ELO e estatísticas
/elo-stats [usuário] - Estatísticas detalhadas de ELO
/ranking-elo [rank] - Ver rankings por categoria
/visualizar [guilda/time] - Ver informações de guildas/times
/ajuda - Central de ajuda com todos os comandos
```

### 👑 **Para Líderes de Guilda**
```
/guilda-painel - Painel completo para gerenciar sua guilda
/time-painel - Gerenciar times (se aplicável)
```

### ⚖️ **Para Score Operators**
```
/elo-partida finalizar - Processar resultado de partida ranqueada
/elo-gerenciar - Gerenciamento manual de ELO (adicionar/remover/resetar)
/setscore - Atualizar placar de guildas/times
```

### 🛠️ **Para Moderadores**
```
/registrar - Registrar nova guilda
/registrar-time - Registrar novo time
/setup-war-ticket - Configurar painel de wars
/definir-canal - Configurar canais do sistema
```

## 🏆 Sistema de Ranks ELO

| Rank | ELO | Emoji | Descrição |
|------|-----|-------|-----------|
| **Rank D** | 0-299 | <:rankD:1390356125232267294> | Iniciante |
| **Rank C** | 300-699 | <:rankC:1390356122485129308> | Bronze |
| **Rank B** | 700-999 | <:RankB:1390356119628677303> | Prata |
| **Rank A** | 1000-1499 | <:RankA:1390356113446142085> | Ouro |
| **Rank A+** | 1500-1999 | <:RankAplus:1390356116071911485> | Platina |
| **Grandmaster** | 2000+ | <:RankG:1390356129330102375> | Elite |

### 📊 **Como Funciona a Pontuação**

#### 🏆 **GANHOS DE ELO (Vitórias)**

**Vitórias Normais (2-1):**
- **MVP:** +25 a +35 ELO
- **Outros Jogadores:** +15 a +20 ELO

**Vitórias Flawless (2-0):**
- **MVP:** +35 a +50 ELO 🔥
- **Outros Jogadores:** +20 a +30 ELO

#### 📉 **PERDAS DE ELO (Derrotas)**

**Derrotas Normais (1-2):**
- **MVP:** -5 a -10 ELO (proteção especial)
- **Outros Jogadores:** -10 a -20 ELO

**Derrotas Flawless (0-2):**
- **MVP:** -10 a -15 ELO
- **Outros Jogadores:** -15 a -25 ELO

#### ⚖️ **Sistema de Multiplicadores Dinâmicos**

O sistema ajusta automaticamente os ganhos/perdas baseado no seu ELO atual:

**🔸 ELO Baixo (0-699 pontos):**
- **Ganhos:** +20% de ELO extra
- **Perdas:** -20% de ELO perdido
- *Ajuda jogadores iniciantes a subir mais rápido*

**🥈 ELO Médio (700-1499 pontos):**
- **Ganhos/Perdas:** Valores normais
- *Faixa equilibrada padrão*

**💎 ELO Alto (1500+ pontos):**
- **Ganhos:** -20% de ELO ganho
- **Perdas:** +20% de ELO perdido
- *Mantém a competitividade no topo*

#### 🛡️ **Proteções do Sistema**

- **ELO Mínimo:** 0 (nunca fica negativo)
- **ELO Máximo:** 3000 pontos
- **Proteção MVP:** MVPs sempre perdem menos ELO em derrotas
- **Sem Cooldown:** Pode jogar múltiplas partidas seguidas
- **Histórico Completo:** Todas as mudanças são registradas

### 💡 **Exemplos Práticos**

#### **Exemplo 1: Jogador Iniciante (400 ELO - Rank C)**
- **Vitória 2-1 como MVP:** +30 ELO + 20% bônus = +36 ELO → 436 ELO
- **Derrota 1-2 normal:** -8 ELO - 20% proteção = -6 ELO → 394 ELO

#### **Exemplo 2: Jogador Médio (1200 ELO - Rank A)**
- **Vitória 2-0 como MVP:** +42 ELO (sem modificador) → 1242 ELO
- **Derrota 0-2 normal:** -12 ELO (sem modificador) → 1188 ELO

#### **Exemplo 3: Jogador Elite (1800 ELO - Rank A+)**
- **Vitória 2-1 como MVP:** +30 ELO - 20% = +24 ELO → 1824 ELO
- **Derrota 1-2 normal:** -8 ELO + 20% = -10 ELO → 1790 ELO

### 📈 **Sistema de Promoção/Rebaixamento**

#### **🔼 Promoções (Subir de Rank)**
- **Automático:** Ao atingir o ELO mínimo do próximo rank
- **Exemplo:** 700 ELO = Automático para Rank B (Prata)
- **Notificação:** Sistema avisa quando você sobe de rank
- **Peak ELO:** Registra seu maior ELO já alcançado

#### **🔽 Rebaixamentos (Descer de Rank)**
- **Automático:** Ao cair abaixo do ELO mínimo do rank atual
- **Exemplo:** 699 ELO = Volta para Rank C (Bronze)
- **Proteção:** Sistema tenta evitar quedas bruscas com multiplicadores

### 🎯 **Dicas Importantes**

- **Seja MVP:** Sempre ganhe mais e perca menos ELO
- **Vitórias Flawless:** Dão muito mais ELO que vitórias normais
- **Progressão Natural:** Sistema favorece jogadores em crescimento
- **Competitividade:** Quanto maior o ELO, mais difícil subir
- **Transparência:** Use `/elo-stats` para ver seu histórico completo
- **Peak ELO:** Seu recorde pessoal fica salvo para sempre

## 🔧 Configuração Inicial

### **Para Administradores:**
1. Configure os canais necessários com `/definir-canal`
2. Configure o fórum de rosters com `/definir-forum-rosters`
3. Configure o painel de wars com `/setup-war-ticket`
4. Defina moderadores e score operators no `config.json`

### **Para Moderadores:**
1. Registre guildas com `/registrar`
2. Registre times com `/registrar-time`
3. Configure permissões adequadas

## 🎯 Benefícios para a Comunidade

### ✅ **Organização Profissional**
- Sistema completo de gerenciamento
- Logs automáticos de todas as atividades
- Interface intuitiva e fácil de usar

### ✅ **Competitividade Justa**
- Sistema ELO balanceado e testado
- Proteções contra abuso
- Histórico transparente de mudanças

### ✅ **Engajamento da Comunidade**
- Rankings públicos atualizados
- Sistema de progressão motivador
- Reconhecimento de MVPs e conquistas

### ✅ **Facilidade de Uso**
- Comandos intuitivos com autocomplete
- Painéis interativos com botões
- Sistema de ajuda integrado

## 🚀 Status Atual

✅ **Sistema 100% Funcional**  
✅ **Todos os comandos deployados**  
✅ **Banco de dados configurado**  
✅ **Sistema ELO testado e validado**  
✅ **Pronto para uso em produção**

## 📞 Suporte

- Use `/ajuda` para ver todos os comandos disponíveis
- Moderadores podem ajudar com configurações
- Sistema de logs automático para troubleshooting

---

**🎮 Desenvolvido para elevar sua comunidade ao próximo nível!**

*Versão 1.0 - Sistema Completo | Desenvolvido por Kilo Code*
