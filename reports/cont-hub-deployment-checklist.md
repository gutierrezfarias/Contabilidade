# CONT HUB - Deployment Checklist

Data: 2026-06-21

## Antes do deploy frontend Vercel

- Rodar `npm.cmd run lint`.
- Rodar `npm.cmd run build`.
- Confirmar variaveis:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SEFAZ_BACKEND_URL`
  - Google/Telegram/Serpro quando usados.
- Confirmar que `SEFAZ_BACKEND_URL` nao e `example.com` nem placeholder.
- Confirmar que nao ha token real commitado.

## Antes do deploy backend .NET/Railway

- Rodar `dotnet build backend\nfe-api\ContHub.NfeApi.csproj -c Release --no-restore`.
- Rodar `dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore`.
- Confirmar variaveis:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SERPRO_SECRET_PEPPER` se Serpro for usado
  - CORS com `https://cont-hub.vercel.app`
- Confirmar XSDs oficiais em `backend/nfe-api/Schemas/NFe/v4.00`.
- Confirmar logs sem XML, PFX, senha ou service role.

## Supabase

- Rodar migrations pendentes na ordem.
- Rodar `supabase/migrations/20260621_dfe_logical_identity_indexes.sql` antes de validar DF-e em producao.
- Rodar diagnostico de RLS/grants.
- Rodar `supabase/diagnostics/20260621_cont_hub_schema_security_diagnostic.sql`.
- Rodar `supabase/tests/20260621_cont_hub_security_isolation_checks.sql`.
- Confirmar buckets privados se migrar arquivos para Storage.
- Validar `user_roles`, `organization_members`, `organizations`.

## Fiscal

- Usar homologacao primeiro.
- Conferir certificado ativo, senha, UF, ambiente e credenciamento.
- Testar `GET /api/sefaz/status`.
- Testar DF-e com limite/cooldown.
- Testar NF-e com serie/numeracao controlada.

## Pos-deploy

- Testar login cliente.
- Testar login admin.
- Testar CRUD cliente.
- Testar certificado.
- Testar DF-e.
- Testar pagamentos/assinaturas.
- Monitorar Vercel e Railway logs.
