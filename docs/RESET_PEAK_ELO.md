# Resetar Peak ELO

Este documento explica como resetar o ELO de pico (peak ELO) de todos os usuários no sistema.

## O que é o Peak ELO?

O Peak ELO é o valor mais alto de ELO que um usuário já alcançou. Este valor é armazenado no perfil do usuário e é usado para fins de histórico e estatísticas.

## Métodos para Resetar o Peak ELO

Existem duas maneiras de resetar o Peak ELO de todos os usuários:

### 1. Usando o Comando Discord

O comando `/elo-resetar-peak` está disponível para administradores e moderadores do servidor. Este comando reseta o Peak ELO de todos os usuários para o valor atual do ELO deles (ou para o ELO inicial, o que for maior).

**Como usar:**
1. Digite `/elo-resetar-peak` em qualquer canal onde o bot tenha permissão
2. O bot processará todos os perfis em lotes e mostrará o progresso
3. Ao finalizar, será exibido um resumo com o número de perfis atualizados

**Permissões necessárias:**
- Administrador do servidor ou
- Cargo de moderador configurado no bot

### 2. Usando o Script Direto

O script `reset-all-peak-elo.js` pode ser executado diretamente no servidor onde o bot está hospedado. Este método é útil para resetar o Peak ELO antes de lançar o bot ou quando o Discord não estiver disponível.

**Como usar:**
1. Acesse o servidor onde o bot está hospedado
2. Navegue até a pasta raiz do bot
3. Execute o comando:
   ```
   node scripts/reset-all-peak-elo.js
   ```
4. O script processará todos os perfis e mostrará o progresso no console
5. Ao finalizar, será exibido um resumo com o número de perfis atualizados

**Requisitos:**
- Acesso ao servidor onde o bot está hospedado
- Node.js instalado
- Variáveis de ambiente configuradas (arquivo `.env` com as credenciais do banco de dados)

## Comportamento do Reset

Quando o Peak ELO é resetado:

1. O valor de Peak ELO é definido como o maior valor entre:
   - O ELO atual do usuário
   - O ELO inicial (definido em `ELO_CONFIG.STARTING_ELO`)

2. Uma entrada é adicionada ao histórico de ELO do usuário, registrando a mudança
   - A entrada inclui a data, o valor antigo e o novo valor do Peak ELO
   - O campo `reason` é definido como `RESET`

3. O timestamp de última atualização do ELO é atualizado

## Quando Usar

Recomenda-se resetar o Peak ELO:

- No início de uma nova temporada
- Após grandes mudanças no sistema de ELO
- Antes de lançar o bot em um novo servidor
- Quando quiser começar um novo período de estatísticas

## Observações

- O reset de Peak ELO não afeta o ELO atual dos usuários
- Usuários que já têm o Peak ELO igual ao ELO atual (ou ao ELO inicial) não serão afetados
- O histórico de ELO mantém um registro da operação de reset