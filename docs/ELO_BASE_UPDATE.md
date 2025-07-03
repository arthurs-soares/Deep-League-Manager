# 🔄 Atualização do ELO Base - Deep League Manager

Este documento explica como atualizar o ELO base de todos os usuários no sistema Deep League Manager.

## 📋 Visão Geral

O sistema de ELO do Deep League Manager foi configurado para usar um valor base de **700 pontos** para todos os jogadores. Esta atualização garante que:

1. O valor de ELO inicial seja consistente em todo o sistema
2. Todos os jogadores comecem no mesmo nível (Rank B)
3. A progressão seja justa e equilibrada para todos

## 🛠️ Métodos de Atualização

Existem duas maneiras de atualizar o ELO base de todos os usuários:

### 1️⃣ Usando o Comando Discord

O método mais simples é usar o comando Discord `/elo-atualizar-base`:

```
/elo-atualizar-base
```

**Requisitos:**
- Apenas administradores ou moderadores podem executar este comando
- O bot precisa estar online e funcionando corretamente
- O comando mostra o progresso em tempo real e um resumo ao final

### 2️⃣ Executando o Script Manualmente

Para administradores com acesso ao servidor, é possível executar o script diretamente:

```bash
# Navegue até a pasta do projeto
cd caminho/para/Deep-League-Manager

# Execute o script
node scripts/update-all-elo.js
```

**Requisitos:**
- Acesso ao servidor onde o bot está hospedado
- Node.js instalado
- Variáveis de ambiente configuradas (.env com DATABASE_URI e DB_NAME)

## 📊 O Que a Atualização Faz

Quando executada, a atualização:

1. Conecta ao banco de dados MongoDB
2. Busca todos os perfis de usuários
3. Para cada usuário:
   - Se o ELO atual já for 1000, pula o usuário
   - Se o ELO atual for diferente de 1000, atualiza para 1000
   - Registra a mudança no histórico de ELO do usuário
   - Atualiza o ELO de pico se necessário
4. Exibe um resumo com o número de perfis atualizados

## ⚠️ Considerações Importantes

- A atualização **não afeta** o histórico de partidas anteriores
- Todos os jogadores terão seu ELO atual definido como 700, independentemente do valor anterior
- Esta operação não pode ser desfeita automaticamente
- Recomenda-se fazer um backup do banco de dados antes de executar a atualização

## 🔍 Verificação

Após a atualização, você pode verificar se foi bem-sucedida:

1. Use o comando `/perfil` para verificar o ELO de alguns usuários aleatórios
2. Use o comando `/ranking-elo` para ver se o ranking foi atualizado
3. Verifique o histórico de ELO dos usuários para confirmar que a entrada de reset foi adicionada

## 📅 Recomendações

Recomenda-se realizar esta atualização:

- Durante períodos de baixo tráfego no servidor
- Após comunicar os usuários sobre a mudança
- No início de uma nova temporada ou após grandes mudanças no sistema

---

**Desenvolvido por:** Equipe Deep League Manager  
**Data:** 01/07/2025  
**Versão:** 1.0