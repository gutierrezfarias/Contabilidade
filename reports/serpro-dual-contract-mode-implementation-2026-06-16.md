# Implementacao Serpro Dual-Mode - 2026-06-16

## O que foi construido

Foi criada a base funcional para operar Receita Federal/Serpro em dois modos:

1. `cont_hub_managed`: contrato Serpro do CONT HUB, com carteira, custo, preco e margem.
2. `direct_serpro`: contrato Serpro informado pelo proprio escritorio, sem debito de carteira por chamada Serpro.

## Banco de dados

Migration criada:

- `supabase/migrations/20260616_serpro_dual_contract_mode.sql`

Diagnostico criado:

- `supabase/diagnostics/20260616_serpro_dual_contract_mode_diagnostic.sql`

Tabelas principais:

- `serpro_platform_contracts`
- `serpro_platform_credentials`
- `serpro_organization_settings`
- `serpro_organization_credentials`
- `serpro_service_catalog`
- `serpro_service_pricing`
- `serpro_organization_services`
- `serpro_client_authorizations`
- `serpro_wallets`
- `serpro_wallet_transactions`
- `serpro_requests`
- `serpro_request_attempts`
- `serpro_usage_records`
- `serpro_documents`
- `serpro_audit_logs`

## RLS e multiempresa

A migration habilita RLS nas tabelas Serpro e cria politicas baseadas em:

- `public.is_platform_admin()` para administradores CONT HUB;
- `organization_members` para acesso do escritorio;
- `organization_id` para isolar dados por contador/escritorio.

## Backend

Arquivos criados:

- `backend/nfe-api/Models/SerproModels.cs`
- `backend/nfe-api/Services/SerproDomainRules.cs`
- `backend/nfe-api/Services/SupabaseSerproRepository.cs`

Arquivo alterado:

- `backend/nfe-api/Program.cs`

Endpoints adicionados:

- `GET /api/admin/serpro/status`
- `GET /api/admin/serpro/contract`
- `PUT /api/admin/serpro/contract`
- `GET /api/admin/serpro/catalog`
- `GET /api/admin/serpro/pricing`
- `GET /api/admin/serpro/organizations`
- `GET /api/serpro/settings`
- `PUT /api/serpro/settings`
- `POST /api/serpro/direct-credentials`
- `PUT /api/serpro/services/{serviceId}`
- `POST /api/serpro/test`
- `GET /api/serpro/wallet`
- `GET /api/serpro/usage`
- `GET /api/revenue/status`
- `GET /api/revenue/catalog`
- `POST /api/revenue/requests`

## Frontend

Arquivos criados:

- `src/types/serpro.ts`
- `src/services/serproService.ts`
- `src/pages/admin/AdminSerpro.tsx`
- `src/pages/accounting/settings/RevenueFederalSettings.tsx`

Arquivos alterados:

- `src/routes/AppRoutes.tsx`
- `src/components/layout/AdminLayout.tsx`
- `src/components/layout/DashboardLayout.tsx`
- `api/dfe/[...path].ts`

Rotas adicionadas:

- `/admin/integracoes/serpro`
- `/gov/receita-federal`

## Seguranca

- Consumer Secret nao e retornado ao frontend.
- O backend grava apenas referencia/status/fingerprint.
- XML, certificado e senha de certificado nao foram adicionados aos logs Serpro.
- O fluxo atual de certificado digital nao foi alterado.

## Testes

Arquivo criado:

- `backend/nfe-api.tests/SerproDomainRulesTests.cs`

Testes cobrem:

- fingerprint nao expor segredo;
- modo direto sem carteira;
- fallback para modo gerenciado;
- bloqueio quando credencial direta falta;
- saldo disponivel considerando saldo reservado.

## Validacao executada

- `npm.cmd run lint`: passou.
- `npm.cmd run build`: passou.
- `dotnet build backend\nfe-api\ContHub.NfeApi.csproj --no-restore`: passou.
- `dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore`: passou, 69 testes.

## Importante

As chamadas reais a produtos Serpro/Receita ainda ficam bloqueadas com mensagem explicita quando o provider oficial nao estiver configurado. Isso evita simulacao falsa de consulta real.
