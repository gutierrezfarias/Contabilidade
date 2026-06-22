# CONT HUB - Relatorio de Redefinicao de Senha do Portal

Data: 2026-06-22

## Implementacao

O envio de redefinicao de senha do Portal do Cliente usa:

- `supabase.auth.resetPasswordForEmail(email, { redirectTo })`;
- `redirectTo = https://seu-dominio/redefinir-senha`;
- auditoria via RPC `record_client_portal_password_reset_request`.

## Protecoes aplicadas

- O envio so ocorre quando o registro possui `user_id` do Supabase Auth.
- Acessos `disabled` ou `removed` nao recebem redefinicao.
- A tela `/redefinir-senha` verifica sessao valida antes de permitir trocar senha.
- Erros reais do Supabase nao sao mascarados como sucesso.
- Limite/rate limit recebe mensagem amigavel.

## O que nao foi feito de proposito

Nao foi implementada troca de e-mail do usuario Auth pelo frontend.

Motivo: isso exige um backend administrativo com service role, validacao de organizacao, auditoria e possivelmente confirmacao de e-mail. Fazer no frontend seria inseguro.

## Fluxo esperado

1. Contador abre `Documentos Contabeis`.
2. Seleciona o cliente.
3. Em `Acessos cadastrados`, clica em `Enviar redefinicao`.
4. Supabase envia o e-mail.
5. Cliente abre link e cai em `/redefinir-senha`.
6. Pagina valida a sessao de recovery.
7. Cliente salva nova senha.
8. Sistema redireciona para `/login`.

## Falhas esperadas

- Sem `user_id` Auth: `Este acesso ainda nao possui usuario Auth vinculado...`
- Acesso desativado/removido: envio bloqueado.
- Link expirado: tela informa link invalido ou expirado.
- Rate limit: tela informa para aguardar alguns minutos.
