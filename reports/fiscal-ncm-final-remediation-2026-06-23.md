# Remediação final - Jornada Fiscal e NCM

Data: 2026-06-23  
Projeto: CONT HUB  
Escopo: correção das ressalvas da validação pós-deploy do módulo fiscal/NCM.  
Base inicial observada: `main...origin/main`, último commit `9a8be73 Implementa jornada fiscal e importacao NCM XLSX`.

## Resumo executivo

Status local: **aprovado com ressalva operacional**.

As duas falhas técnicas principais foram remediadas localmente:

- O endpoint direto do Railway `POST /api/reference-data/ncm/import-file` agora bloqueia requisições sem `Authorization` antes de expor validações de `Content-Type` ou parser de multipart.
- Os erros de TypeScript em `api/google-business.ts` foram corrigidos com tipos explícitos do Supabase e conversão segura para JSON, sem `any`, `@ts-ignore` ou `@ts-nocheck`.

A ressalva restante é operacional: a validação ao vivo no Supabase não foi executada nesta sessão. Foi criado um SQL diagnóstico somente leitura para rodar no SQL Editor.

## Arquivos alterados

- `api/google-business.ts`
- `backend/nfe-api/Program.cs`
- `backend/nfe-api/Services/SupabaseNfeRepository.cs`
- `backend/nfe-api/Services/ForbiddenAccessException.cs`
- `backend/nfe-api.tests/FiscalReadinessNcmEnrichmentTests.cs`
- `supabase/diagnostics/20260623_fiscal_readiness_ncm_enrichment_diagnostic.sql`
- `reports/fiscal-ncm-final-remediation-2026-06-23.md`

Observação: `reports/fiscal-ncm-post-deploy-validation-2026-06-23.md` já estava não rastreado antes desta remediação.

## Correção 1 - Railway retornando 415 sem autenticação

### Problema

Foi identificado que o endpoint direto:

```http
POST /api/reference-data/ncm/import-file
```

poderia retornar `415 Unsupported Media Type` para requisições sem autenticação, revelando detalhe de parser/content-type antes de validar acesso.

### Causa provável

O endpoint possuía metadado:

```csharp
.Accepts<IFormFile>("multipart/form-data")
```

Esse metadado podia antecipar a validação de mídia antes da lógica interna do handler.

### Correção aplicada

Em `backend/nfe-api/Program.cs`:

- Adicionado middleware específico antes do endpoint para negar requisições sem header `Authorization`.
- Removido o `.Accepts<IFormFile>("multipart/form-data")` do endpoint.
- Mantida a validação manual de multipart depois da autenticação.
- Adicionado controle de admin para sincronização/importação global do catálogo NCM.

Fluxo atual esperado:

1. Sem `Authorization`: `401 Unauthorized`.
2. Com usuário autenticado sem role admin: `403 Forbidden`.
3. Com admin e sem multipart: `415 Unsupported Media Type`.
4. Com admin e arquivo inválido: erros específicos de validação.
5. Com admin e XLSX válido: importação segue para `NcmCatalogService`.

## Correção 2 - Controle administrativo para NCM

Criado `backend/nfe-api/Services/ForbiddenAccessException.cs`.

Adicionado em `backend/nfe-api/Services/SupabaseNfeRepository.cs`:

- `EnsurePlatformAdminAsync`
- Consulta a `public.user_roles`
- Exige `role = admin`

Endpoints protegidos:

- `POST /api/reference-data/ncm/sync`
- `POST /api/reference-data/ncm/import-file`

## Correção 3 - TypeScript em `api/google-business.ts`

### Problema

Os logs da Vercel apontavam erros de tipagem no endpoint `api/google-business.ts`, principalmente por inferência fraca do Supabase client e payloads JSON incompatíveis.

### Correção aplicada

Foram adicionados:

- Tipos explícitos para tabelas usadas pelo endpoint.
- `GoogleBusinessDatabase`.
- `GoogleSupabaseClient`.
- `JsonValue` e `JsonObject`.
- Conversores seguros para payloads JSON.
- Remoção de dependência de `ReturnType<typeof createClient>`.

Não foram usados:

- `any`
- `@ts-ignore`
- `@ts-nocheck`

Resultado: `vercel.cmd build` passou sem erros TypeScript.

## Diagnóstico Supabase

Criado arquivo somente leitura:

```text
supabase/diagnostics/20260623_fiscal_readiness_ncm_enrichment_diagnostic.sql
```

Esse script verifica:

- Tabelas, funções, triggers e índices esperados.
- Colunas críticas do catálogo NCM e estruturas fiscais.
- Status de RLS.
- Políticas RLS.
- Grants para `anon`, `authenticated`, `service_role` e `postgres`.
- Contagem e qualidade dos dados em `ncm_catalog`.
- Presença do NCM `0102.39.11`.
- Duplicidades por `normalized_code`.
- Registros inválidos ou sem descrição.

Importante: o script é diagnóstico e não altera dados.

## Testes adicionados

Arquivo:

```text
backend/nfe-api.tests/FiscalReadinessNcmEnrichmentTests.cs
```

Novos testes:

- Garante que `import-file` nega requisição sem autenticação antes de validar multipart.
- Garante que `sync` e `import-file` exigem admin antes de gravar catálogo global.
- Garante que `api/google-business.ts` usa tipos explícitos do Supabase e não usa supressões de TypeScript.

Total final dos testes .NET:

```text
Aprovado: 150, Falha: 0, Ignorado: 0
```

## Validações executadas

### Frontend lint

```powershell
npm.cmd run lint
```

Resultado: **aprovado**.

### Frontend build

```powershell
npm.cmd run build
```

Resultado: **aprovado**.

Observação: Vite ainda alerta sobre chunk acima de 500 kB. É aviso de otimização, não falha.

### Backend build

```powershell
dotnet build backend\nfe-api\ContHub.NfeApi.csproj --no-restore
```

Resultado: **aprovado**, 0 warnings, 0 errors.

### Backend tests

```powershell
dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore
```

Resultado: **aprovado**, 150 testes.

### Vercel local build

```powershell
vercel.cmd build
```

Resultado: **aprovado**.

Observações:

- Sem erros de TypeScript em `api/google-business.ts`.
- Houve avisos `EBADENGINE` porque o Node local é `v23.6.1` e algumas dependências pedem `^20.19.0 || ^22.13.0 || >=24`.
- Houve aviso de chunk grande do Vite.
- O build local não fez deploy.

## Riscos restantes

### Supabase

Não houve validação ao vivo do Supabase nesta sessão. Para fechar a ressalva, rode o diagnóstico:

```text
supabase/diagnostics/20260623_fiscal_readiness_ncm_enrichment_diagnostic.sql
```

### Produção

Nenhum deploy foi executado. As correções estão locais.

### Node local

O Node `v23.6.1` gera avisos de engine. Recomenda-se usar Node LTS compatível, como `22.x`, para reduzir ruído no build.

## Conclusão

A remediação final foi concluída localmente. O endpoint NCM ficou mais seguro, o erro TypeScript do Google Business foi corrigido, os testes foram ampliados e todos os builds locais solicitados passaram.

Próxima etapa recomendada:

1. Rodar o diagnóstico SQL no Supabase.
2. Conferir se o diagnóstico não aponta ausência de objetos/RLS/grants.
3. Fazer deploy após essa conferência.
