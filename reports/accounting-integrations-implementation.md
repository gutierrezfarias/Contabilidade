# Implementacao - Central de Integracoes Contabeis

Data: 2026-06-16

## O que foi construido

Foi criada a base real da Central de Integracoes Contabeis do CONT HUB, com banco, backend, frontend, importacao manual, providers e documentacao.

## Banco de dados

Migration criada:

`supabase/migrations/20260616_accounting_integrations.sql`

Tabelas criadas:

- `accounting_integrations`
- `accounting_integration_clients`
- `accounting_sync_runs`
- `accounting_sync_errors`
- `accounting_tax_records`
- `accounting_documents`
- `accounting_obligations`
- `accounting_payroll_records`
- `accounting_statements`
- `accounting_import_templates`
- `accounting_import_batches`
- `accounting_import_errors`
- `accounting_audit_logs`

Tambem foram criados:

- RLS por `organization_id`.
- Funcao `accounting_can_access_org`.
- Trigger de `updated_at`.
- Trigger de auditoria.
- Templates padrao de importacao.
- Diagnostico SQL em `supabase/diagnostics/20260616_accounting_integrations_diagnostic.sql`.

## Backend

Arquivos criados:

- `backend/nfe-api/Models/AccountingIntegrationModels.cs`
- `backend/nfe-api/Services/AccountingImportParser.cs`
- `backend/nfe-api/Services/AccountingIntegrationProviders.cs`
- `backend/nfe-api/Services/AccountingIntegrationService.cs`
- `backend/nfe-api/Services/SupabaseAccountingRepository.cs`

Arquivo alterado:

- `backend/nfe-api/Program.cs`

Endpoints adicionados no backend .NET:

- `GET /api/accounting-integrations`
- `POST /api/accounting-integrations`
- `GET /api/accounting-integrations/{id}`
- `PUT /api/accounting-integrations/{id}`
- `DELETE /api/accounting-integrations/{id}`
- `POST /api/accounting-integrations/{id}/test`
- `POST /api/accounting-integrations/{id}/sync`
- `GET /api/accounting-integrations/{id}/sync-runs`
- `GET /api/accounting-integrations/{id}/clients`
- `POST /api/accounting-integrations/{id}/clients/link`
- `DELETE /api/accounting-integrations/{id}/clients/{linkId}`
- `POST /api/accounting-imports/preview`
- `POST /api/accounting-imports/confirm`
- `GET /api/accounting-imports/{batchId}/errors`
- `GET /api/accounting/taxes`
- `GET /api/accounting/obligations`
- `GET /api/accounting/{recordType}`

## Frontend

Arquivos criados:

- `src/types/accountingIntegrations.ts`
- `src/services/accountingIntegrationsService.ts`

Arquivo alterado:

- `src/pages/accounting/Integrations.tsx`

A tela agora possui:

- Visao geral.
- Cadastro de integracoes.
- Vinculo de clientes.
- Importacao manual.
- Dados importados.
- Diagnostico e historico.

## Importacao manual

Suportado:

- CSV.
- JSON.
- Previa antes de salvar.
- Validacao linha por linha.
- Bloqueio de CSV Injection por prefixos `=`, `+`, `-`, `@`.
- Confirmacao antes da persistencia.
- Registro de lote e erros.

Limitacao conhecida:

- XLSX ainda nao e processado sem biblioteca dedicada. O sistema retorna erro claro e orienta exportar CSV/JSON.

## Vercel

Nao foram criadas novas Serverless Functions finais. As chamadas contabeis passam por `/api/dfe/[...path]`, reaproveitando a funcao existente e mantendo o projeto dentro do limite do plano Hobby.

## NetSpeed

`NetSpeedProvider` foi criado, mas em modo seguro. Ele nao chama endpoints inventados. Fica como `not_configured` ou `configured_pending_contract` ate existir documentacao oficial.

## Certificado digital

Nao houve alteracao no fluxo de senha, upload, leitura ou exibicao do certificado digital.
