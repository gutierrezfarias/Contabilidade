# CONT HUB - External Validation Plan

Data: 2026-06-21

## Objetivo

Validar o que nao pode ser comprovado localmente: Supabase real, SEFAZ real, Railway/Vercel, Serpro/Receita, Google, Telegram/Meta e pagamentos.

## Supabase

1. Executar `supabase/migrations/20260621_dfe_logical_identity_indexes.sql`.
2. Se a migration parar por duplicidade DF-e, nao apagar dados. Rodar diagnostico de duplicidade e reconciliar manualmente.
3. Executar `supabase/diagnostics/20260621_cont_hub_schema_security_diagnostic.sql`.
4. Executar `supabase/tests/20260621_cont_hub_security_isolation_checks.sql`.
5. Confirmar:
   - `anon` sem acesso a tabelas fiscais/sensiveis.
   - `authenticated` sem escrita indevida em locks/transacoes Serpro.
   - RLS habilitado nas tabelas multiempresa.
   - Index DF-e `organization_id + client_id + access_key` existe sem `schema_name`.

## Vercel

1. Confirmar variaveis:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SEFAZ_BACKEND_URL`
2. Nao usar `SEFAZ_BACKEND_URL` placeholder.
3. Testar proxy:
   - `POST /api/nfe/emitir`
   - `POST /api/nfe/gerar-xml`
   - `POST /api/nfe/assinar-xml`
   - `POST /api/nfe/consultar-chave`
   - `POST /api/nfe/cancelar`

## Railway/backend .NET

1. Confirmar variaveis:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - CORS com `https://cont-hub.vercel.app`
2. Confirmar XSDs em `backend/nfe-api/Schemas/NFe/v4.00`.
3. Testar:
   - `GET /health`
   - `GET /api/sefaz/status`
   - `POST /api/dfe/sync`
   - `POST /api/nfe/tax-preview`

## SEFAZ homologacao

1. Usar empresa real credenciada para homologacao.
2. Certificado A1 valido e senha correta.
3. Ambiente do certificado = homologacao.
4. Testar DF-e sem repetir chamadas excessivas.
5. Testar NF-e modelo 55 apenas em homologacao.
6. Conferir logs:
   - sem XML completo em log;
   - sem PFX;
   - sem senha;
   - com `cStat`, `xMotivo`, UF, ambiente e chave quando existir.

## Receita/Serpro/e-CAC

1. Confirmar contrato/credenciais oficiais.
2. Validar que frontend nao recebe consumer secret salvo.
3. Testar modo manual com arquivos sem macros/formulas.

## Omnichannel

1. Telegram: bot token e webhook por escritorio.
2. WhatsApp/Instagram/Facebook: validar app Meta, webhooks, permississoes e tokens.
3. Confirmar isolamento por escritorio.

## Go/No-Go

Go somente se:

- Supabase diagnostics/checks passam.
- Backend Railway responde.
- Proxy Vercel chama backend.
- Homologacao SEFAZ passa com certificado controlado.
- Logs nao vazam segredo.

No-Go se:

- Houver grant indevido para `anon`.
- Houver escrita direta indevida para `authenticated` em tabelas sensiveis.
- Houver duplicidade DF-e nao reconciliada.
- Certificado/senha/token aparecer em log ou payload de frontend fora do fluxo atual.
