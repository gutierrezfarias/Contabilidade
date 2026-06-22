# CONT HUB - Gerenciamento de Acessos do Portal do Cliente

Data: 2026-06-22

## Resumo executivo

Foi implementada a gestao operacional de acessos do Portal do Cliente na tela `Documentos Contabeis`, com edicao de vinculo, permissao, desativacao, reativacao, remocao logica e envio real de redefinicao de senha pelo Supabase Auth.

O fluxo evita escrever diretamente nas tabelas sensiveis pelo frontend: as alteracoes passam por RPCs `SECURITY DEFINER`, verificam acesso da organizacao e registram auditoria em `client_portal_access_logs`.

## Arquivos principais

- `supabase/migrations/20260622_client_portal_access_management.sql`
- `src/pages/accounting/AccountingDocuments.tsx`
- `src/services/accountingDocumentsService.ts`
- `src/types/accountingDocuments.ts`
- `src/pages/auth/ResetPassword.tsx`
- `backend/nfe-api.tests/ClientPortalAccessManagementTests.cs`

## O que foi concluido

- CRUD operacional do vinculo de acesso do portal:
  - editar nome, cliente vinculado e permissao;
  - desativar acesso;
  - reativar acesso;
  - remover vinculo logicamente;
  - preservar usuario Supabase Auth.
- Permissoes do portal ampliadas:
  - `viewer`;
  - `collaborator`;
  - `manager`;
  - `owner`.
- Auditoria para acoes administrativas:
  - `portal_access_updated`;
  - `portal_access_disabled`;
  - `portal_access_reactivated`;
  - `portal_access_removed`;
  - `portal_password_reset_requested`.
- Redefinicao de senha:
  - usa `resetPasswordForEmail`;
  - usa redirect `/redefinir-senha`;
  - exige que o acesso tenha `user_id` Auth vinculado;
  - bloqueia acesso desativado/removido;
  - trata erro real do Supabase;
  - registra auditoria apos envio.
- Pagina `/redefinir-senha`:
  - valida sessao de recovery;
  - bloqueia link invalido ou expirado;
  - redireciona para `/login` apos sucesso.

## Decisoes de seguranca

- Troca de e-mail foi bloqueada no frontend.
- Motivo: alterar e-mail de usuario Auth exige backend administrativo seguro. Fazer isso no navegador exporia fluxo privilegiado ou abriria risco de IDOR.
- Remocao e sempre logica: `status = 'removed'`, `deleted_at`, `removed_at`, `removed_by`.
- Nenhuma rotina apaga usuario em `auth.users`.

## SQL a executar

Execute no Supabase:

`supabase/migrations/20260622_client_portal_access_management.sql`

Essa migration e incremental, idempotente e nao destrutiva.

## Validacao executada

- `npm.cmd run lint`: passou.
- `npm.cmd run build`: passou, com aviso de chunk grande do Vite.
- `dotnet build backend\nfe-api\ContHub.NfeApi.csproj -c Release --no-restore`: passou.
- `dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore`: passou, 136 testes.

## Pendencias conscientes

- Troca de e-mail de acesso: pendente de endpoint administrativo seguro.
- Confirmacao real de e-mail e SMTP dependem da configuracao do Supabase Auth do projeto.
- Validacao RLS real depende da migration ser aplicada no Supabase de producao.
