# CONT HUB - Testes manuais do Portal do Cliente

Data: 2026-06-22

## Pre-requisito

1. Rodar no Supabase:
   `supabase/migrations/20260622_client_portal_access_management.sql`
2. Fazer novo deploy do frontend.
3. Confirmar que o usuario contador esta logado e pertence a organizacao correta.

## Cenario 1 - Criar acesso

1. Acesse `Documentos Contabeis`.
2. Escolha um cliente.
3. Informe nome, e-mail e permissao.
4. Clique em `Liberar acesso`.

Resultado esperado:
- Mensagem de sucesso.
- Acesso aparece em `Acessos cadastrados`.
- Se o e-mail ja existir no Supabase Auth, status mostra `Ativo`.
- Se nao existir, status mostra `Sem usuario Auth vinculado`.

## Cenario 2 - Editar acesso

1. Clique em `Editar`.
2. Altere nome, cliente ou permissao.
3. Observe que o e-mail esta bloqueado.
4. Clique em `Salvar acesso`.

Resultado esperado:
- Mensagem de sucesso.
- Dados atualizados.
- Registro de auditoria criado.

## Cenario 3 - Desativar e reativar

1. Clique em `Desativar`.
2. Informe um motivo opcional.
3. Confirme.
4. Depois clique em `Reativar`.

Resultado esperado:
- Desativado bloqueia acesso ao portal.
- Reativado volta para `Ativo` se houver Auth vinculado ou `Sem usuario Auth vinculado` se ainda nao houver.

## Cenario 4 - Remover vinculo

1. Clique em `Remover vinculo`.
2. Confirme.

Resultado esperado:
- O vinculo fica como removido logicamente.
- Usuario Auth nao e apagado.
- Botoes de acao ficam bloqueados.

## Cenario 5 - Redefinir senha

1. Em acesso com Auth vinculado, clique em `Enviar redefinicao`.
2. Abra o e-mail recebido.
3. Acesse o link.
4. Cadastre nova senha.

Resultado esperado:
- A tela `/redefinir-senha` valida a sessao.
- Senha e atualizada.
- Usuario volta para `/login`.

## Cenario 6 - Redefinir sem Auth vinculado

1. Use um acesso com status `Sem usuario Auth vinculado`.
2. Observe o botao de redefinicao.

Resultado esperado:
- Botao fica desabilitado.
- Nenhum e-mail falso e enviado.

## Cenario 7 - Isolamento multiempresa

1. Com dois escritorios/organizacoes, crie acessos em clientes diferentes.
2. Tente listar/editar acesso de outra organizacao.

Resultado esperado:
- RPC bloqueia por `accounting_can_access_org`.
- Portal do cliente visualiza apenas dados de `organization_id` e `client_id` vinculados.
