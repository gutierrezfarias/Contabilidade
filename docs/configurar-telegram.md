# CONT HUB - Configurar Telegram

Este guia deve ser repetido para cada contador que quiser usar Telegram, porque cada escritorio precisa ter o proprio bot e o proprio token.

## O que cada contador precisa criar

- Um bot no Telegram pelo BotFather.
- Um token exclusivo desse bot.
- Um secret de webhook exclusivo no CONT HUB.
- O canal Telegram salvo como Ativo na tela Apps de Chats.

## Passo a passo

1. Abra o Telegram.
2. Pesquise por `@BotFather`.
3. Envie `/newbot`.
4. Informe o nome do bot. Exemplo: `CONT HUB Suporte`.
5. Informe o usuario do bot. Ele precisa terminar com `bot`. Exemplo: `MeuEscritorioSuporteBot`.
6. Copie o token gerado pelo BotFather.
7. No CONT HUB, acesse `Apps de Chats > Configuracoes API`.
8. Preencha:
   - Canal: `Telegram`
   - Status: `Ativo`
   - Nome da integracao: nome livre, exemplo `Telegram suporte`
   - URL do webhook: `https://cont-hub.vercel.app/api/webhooks/telegram`
   - Referencia do segredo: `vault://cont-hub/telegram-token`
   - Usuario do bot: `@MeuEscritorioSuporteBot`
   - Token do bot: token copiado do BotFather
   - Secret do webhook: um texto exclusivo, exemplo `telegram-meu-escritorio-123`
9. Clique em salvar/atualizar canal.
10. Clique em `Ativar webhook` para o sistema conectar o bot automaticamente.

## Comando PowerShell manual

Use apenas se o botao `Ativar webhook` falhar. Troque `TOKEN_DO_BOT` e `SECRET_DO_WEBHOOK` pelos valores reais:

```powershell
$TOKEN="TOKEN_DO_BOT"
$WEBHOOK="https://cont-hub.vercel.app/api/webhooks/telegram"
$SECRET="SECRET_DO_WEBHOOK"

Invoke-RestMethod -Method Post `
  -Uri "https://api.telegram.org/bot$TOKEN/setWebhook" `
  -Body @{
    url=$WEBHOOK
    secret_token=$SECRET
    allowed_updates='["message","callback_query"]'
    drop_pending_updates=$true
  }
```

## Teste

1. Abra o bot no Telegram.
2. Envie `/start`.
3. Entre no CONT HUB em `Apps de Chats > Atendimento`.
4. Clique em `Atualizar`.
5. A conversa deve aparecer na caixa de entrada.

## Forma mais facil no futuro

O sistema ja tem o botao `Ativar webhook`. Com isso, o contador precisa apenas criar o bot no BotFather, colar o token no CONT HUB e clicar no botao.

Mesmo assim, cada contador ainda precisa ter o proprio bot/token para manter isolamento e escala entre escritorios.
