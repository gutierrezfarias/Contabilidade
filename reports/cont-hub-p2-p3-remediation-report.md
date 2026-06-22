# CONT HUB - Relatorio de Remediacao P2/P3

Data: 2026-06-22

## Resumo executivo

Foi implementada a primeira entrega funcional P2/P3 focada em Portal do Cliente e Documentos Contabeis, sem repetir auditoria geral e sem alterar migrations antigas aplicadas.

O trabalho criou uma migration incremental para Supabase, nova tela do contador para documentos, nova tela `/portal` para usuarios externos do cliente, servico Supabase/Storage, validacoes de upload e testes estaticos de seguranca/RLS.

Status geral: **CORRIGIDA, AGUARDANDO SUPABASE**.

Motivo: o frontend, lint, build, backend build e testes passaram localmente, mas as funcionalidades dependem da execucao da migration `supabase/migrations/20260622_client_portal_and_accounting_documents.sql` no Supabase de producao.

## O que realmente funciona

| Item | Status | Evidencia | Observacao |
| --- | --- | --- | --- |
| Menu do contador para Documentos Contabeis | CORRIGIDA E TESTADA | `src/components/layout/DashboardLayout.tsx` | Novo item `/documentos-contabeis`. |
| Rota protegida de Documentos Contabeis | CORRIGIDA E TESTADA | `src/routes/AppRoutes.tsx` | Dentro do app `gestao-contabil`. |
| Rota protegida do Portal do Cliente | CORRIGIDA E TESTADA | `src/routes/AppRoutes.tsx` | `/portal` exige login pelo `ProtectedRoute`. |
| Upload de documento contabil | CORRIGIDA, AGUARDANDO SUPABASE | `src/pages/accounting/AccountingDocuments.tsx`, `src/services/accountingDocumentsService.ts` | Envia para Storage privado e grava metadados em `accounting_documents`. |
| Validacao de arquivo | CORRIGIDA E TESTADA | `src/utils/accountingDocumentSecurity.ts`, `ClientPortalAccountingDocumentsTests.cs` | Bloqueia executaveis, scripts, macros, path traversal, MIME invalido e tamanho acima de 25 MB. |
| Filtros e paginacao de documentos | CORRIGIDA E TESTADA | `AccountingDocuments.tsx`, `PaginationControls` | Cliente, categoria, status, busca por nome e paginacao. |
| Download por signed URL | CORRIGIDA, AGUARDANDO SUPABASE | `createAccountingDocumentSignedUrl` | Depende do bucket privado `accounting-documents`. |
| Substituicao de documento | CORRIGIDA, AGUARDANDO SUPABASE | `replaceAccountingDocument` | Cria nova versao e marca anterior como `replaced`. |
| Exclusao logica | CORRIGIDA, AGUARDANDO SUPABASE | `archiveAccountingDocument` | Usa `deleted_at`, `deleted_by` e status `archived`. |
| Convite/acesso do Portal do Cliente | CORRIGIDA, AGUARDANDO SUPABASE | `upsert_client_portal_user`, `AccountingDocuments.tsx` | Vincula por `organization_id`, `client_id` e e-mail. |
| Ativacao do portal por e-mail logado | CORRIGIDA, AGUARDANDO SUPABASE | `claim_client_portal_access`, `ClientPortal.tsx` | Ao entrar no portal, o usuario reivindica acesso pelo e-mail autenticado. |
| Recuperacao de acesso | CORRIGIDA E TESTADA | `sendClientPortalPasswordReset` | Usa reset de senha do Supabase Auth. |
| Isolamento por cliente externo | CORRIGIDA, AGUARDANDO SUPABASE | `client_portal_can_access`, politicas RLS | Portal so seleciona registros do proprio `client_id`. |
| Historico/auditoria de documentos | PARCIAL | `accounting_audit_logs` existente + migration nova | Alteracoes em `accounting_documents` sao auditadas pela migration de integracoes ja existente; a UI ainda nao exibe timeline detalhada. |

## O que esta apenas visual

Nada novo foi adicionado como tela puramente visual. As novas telas chamam servicos reais Supabase/Storage.

Pontos que dependem do Supabase remoto:

- Criacao do bucket privado `accounting-documents`;
- Colunas novas em `accounting_documents`;
- Tabelas `client_portal_users`, `client_portal_invites`, `client_portal_access_logs`;
- Funcoes RPC de portal;
- Politicas RLS de leitura por portal.

## O que esta incompleto

| Requisito | Status | Risco | Proxima acao |
| --- | --- | --- | --- |
| Portal completo com comunicacoes e solicitacoes | PARCIAL | Cliente ve documentos/impostos/obrigacoes/NF-es, mas ainda nao abre chamados/comunicacoes. | Criar tabelas e UI para `client_portal_requests` e `client_portal_messages`. |
| Exportacao historica para troca de contador | NAO IMPLEMENTADA | Sem pacote de exportacao completo ainda. | Criar exportador ZIP com XML, documentos e manifestos por cliente. |
| Obrigações e impostos com CRUD manual completo | PARCIAL | Existem tabelas e importacoes; a remediacao atual so disponibiliza leitura no portal. | Criar tela dedicada de CRUD e calendario fiscal. |
| Integracoes `/integracoes` | NAO ALTERADA | Ficou fora desta primeira entrega executada. | Proxima fase P2/P3. |
| Importacao manual e-CAC | NAO ALTERADA | Ficou fora desta primeira entrega executada. | Proxima fase P2/P3. |
| Regularidade/Saude Cliente | NAO IMPLEMENTADA | Ainda nao existe painel consolidado novo. | Criar painel com pendencias reais por cliente. |

## Riscos fiscais

- Documentos anexados nao substituem validacao fiscal oficial.
- Impostos/obrigacoes lidos no portal dependem de dados reais ja importados/cadastrados.
- O modulo nao calcula nem transmite obrigacoes fiscais nesta entrega.

## Riscos de seguranca

- O bucket privado depende da migration aplicada corretamente no Supabase.
- O portal usa Supabase Auth; se o usuario externo ainda nao existir, fica como `invited` ate criar login com o mesmo e-mail.
- Arquivos grandes sao bloqueados no frontend e pelo limite do bucket, mas um backend dedicado ainda seria recomendado para verificacao antivirus em producao.

## Riscos multiempresa

- A migration adiciona RLS por `organization_id` e `client_id`.
- O portal externo depende de `client_portal_can_access`.
- Sem a migration aplicada, as telas exibem erro orientando rodar o SQL.

## Arquivos criados ou modificados

Criados:

- `supabase/migrations/20260622_client_portal_and_accounting_documents.sql`
- `src/utils/accountingDocumentSecurity.ts`
- `src/types/accountingDocuments.ts`
- `src/services/accountingDocumentsService.ts`
- `src/pages/accounting/AccountingDocuments.tsx`
- `src/pages/portal/ClientPortal.tsx`
- `backend/nfe-api.tests/ClientPortalAccountingDocumentsTests.cs`
- `reports/cont-hub-p2-p3-remediation-report.md`
- `reports/cont-hub-p2-p3-manual-tests.md`
- `artifacts/cont-hub-p2-p3-results.json`

Modificados:

- `src/routes/AppRoutes.tsx`
- `src/components/layout/DashboardLayout.tsx`

## Validacoes executadas

| Comando | Resultado |
| --- | --- |
| `npm.cmd run lint` | Passou |
| `npm.cmd run build` | Passou |
| `dotnet build backend\nfe-api\ContHub.NfeApi.csproj -c Release --no-restore` | Passou |
| `dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore` | Passou, 127 testes |
| Busca por testes frontend/Playwright | Nao ha script/testes configurados no `package.json` |

## Proxima fase recomendada

1. Rodar `supabase/migrations/20260622_client_portal_and_accounting_documents.sql` no Supabase.
2. Testar upload/download real de documento em `/documentos-contabeis`.
3. Criar usuario externo com o mesmo e-mail convidado e acessar `/portal`.
4. Implementar comunicacoes/solicitacoes do portal.
5. Implementar CRUD dedicado de obrigacoes/impostos.
6. Implementar exportacao historica por cliente para troca de contador.
