# Validacao pos-deploy - Jornada Fiscal e Importacao NCM

Data da validacao: 2026-06-24  
Projeto: CONT HUB  
Commit esperado: `9a8be73 - Implementa jornada fiscal e importacao NCM XLSX`  
Resultado final: **APROVADO COM RESSALVAS**

## 1. Resumo executivo

A implementacao local esta consistente com o commit esperado, compila, passa lint e a suite .NET completa. A Vercel esta servindo o frontend em producao e o Railway responde ao health check.

As ressalvas sao:

1. A validacao ao vivo do Supabase nao foi comprovada nesta sessao porque nao havia MCP/conexao SQL read-only disponivel.
2. Os testes funcionais autenticados de NCM, produto, perfil fiscal, timeline e simulador nao foram executados em producao porque exigem sessao de usuario e poderiam alterar dados reais.
3. O log do deploy Vercel mostra erros TypeScript em `api/google-business.ts`, apesar do deploy finalizar como `Ready`.
4. O endpoint direto do Railway `POST /api/reference-data/ncm/import-file` sem login retornou `415` por ausencia de multipart antes de evidenciar `401`. Pelo proxy da Vercel, a rota sem login retornou `401`.

## 2. Git e arquivos

| Item | Resultado |
|---|---|
| Branch atual | `main` |
| Commit atual | `9a8be735072792b7ce5931973710c63369af798a` |
| Mensagem do commit | `Implementa jornada fiscal e importacao NCM XLSX` |
| Status local | Limpo, sem arquivos nao versionados inesperados |
| Endpoint NCM importacao | Presente em `backend/nfe-api/Program.cs` e `api/reference-data/ncm/[action].ts` |
| Parser XLSX | Presente em `backend/nfe-api/Services/NcmXlsxParser.cs` |
| Timeline fiscal | Presente em `src/components/fiscal/FiscalReadinessTimeline.tsx` |
| Proxy multipart | Presente em `api/_utils/nfeBackendProxy.ts` com preservacao do `boundary` |

## 3. Supabase

Status: **nao comprovado ao vivo nesta sessao**.

Evidencia estatica da migration `supabase/migrations/20260623_fiscal_readiness_ncm_enrichment.sql`:

- Adiciona `normalized_code`, `description_search`, metadados de fonte e importacao em `ncm_catalog`.
- Cria indice unico `ncm_catalog_normalized_code_uidx`.
- Cria indices de busca `ncm_catalog_description_search_idx` e `ncm_catalog_active_normalized_idx`.
- Cria trigger `normalize_ncm_catalog_fields_trigger`.
- Cria tabela `fiscal_field_sources`.
- Habilita RLS em `fiscal_field_sources`.
- Usa `public.is_platform_admin()` e `public.is_org_member(organization_id)` nas politicas.
- Insere/atualiza NCM de controle `0102.39.11` com descricao `Prenhes ou com cria ao pe`.
- Concede `select` em `ncm_catalog` e `ncm_sync_jobs` para `authenticated`.

Ressalva de permissao:

- A migration concede `select, insert, update` em `fiscal_field_sources` para `authenticated`. Ha RLS, mas vale revisar se escrita direta por frontend deve permanecer ou se deve ser restrita ao backend/service role.

## 4. Railway

| Checagem | Resultado |
|---|---|
| Health | `GET https://contabilidade-production.up.railway.app/health` retornou `{"ok":true,"service":"CONT HUB NF-e API"}` |
| NCM search sem login | `401` |
| NCM sync-status sem login | `401` |
| NCM sync sem login | `401` |
| NCM import-file sem login | `415` direto no Railway |

Diagnostico do `415` direto no Railway:

- A rota existe.
- O comportamento provavelmente vem da validacao de `multipart/form-data` antes de expor a resposta de autenticacao.
- Pelo proxy da Vercel, a mesma rota sem login retornou `401`, o que protege o fluxo publico.
- Recomendacao: ajustar o endpoint direto para sempre validar autenticacao antes de validar payload/content-type, inclusive sem multipart.

## 5. Vercel e proxy

| Checagem | Resultado |
|---|---|
| Frontend publicado | `GET https://cont-hub.vercel.app` retornou `HTTP 200` |
| Deploy atual | `Ready` |
| Alias | `https://cont-hub.vercel.app` |
| Criado em | Tue Jun 23 2026 21:14:35 GMT-0300 |
| NCM search sem login via Vercel | `401` |
| NCM import-file sem login via Vercel | `401` |
| Proxy multipart | Codigo preserva `content-type` original e corpo bruto |
| Upload convertido em JSON | Nao no fluxo `import-file` |

Achado em log Vercel:

- O deploy terminou como `Ready`, mas o log contem erros TypeScript em `api/google-business.ts`, por exemplo:
  - `TS18047: 'role' is possibly 'null'`
  - `TS2345: Argument of type ... is not assignable to parameter of type 'never'`

Recomendacao:

- Corrigir tipagem de `api/google-business.ts` antes do proximo deploy, para evitar risco de function inconsistente mesmo com deploy marcado como pronto.

## 6. Testes funcionais

| Area | Status | Observacao |
|---|---|---|
| Importacao XLSX real em producao | Nao executada | Evitado por seguranca, pois poderia alterar catalogo global NCM |
| Busca `0102.39.11` autenticada | Nao executada | Requer sessao autenticada |
| Busca `01023911` autenticada | Nao executada | Requer sessao autenticada |
| Busca `Prenhes` autenticada | Nao executada | Requer sessao autenticada |
| Autocomplete de produto | Parcial | Evidencia estatica e testes; sem teste autenticado no navegador |
| Perfil fiscal | Parcial | Evidencia estatica; sem escrita/leitura autenticada de producao |
| Timeline fiscal | Parcial | Componente presente; sem navegacao autenticada/mobile nesta sessao |
| Regras e simulador | Parcial | Endpoint e testes existem; sem simulacao autenticada ao vivo |

Resultado especifico do NCM `0102.39.11`:

- A migration contem seed idempotente de `0102.39.11`.
- O parser XLSX preserva zero inicial em teste automatizado.
- A busca real autenticada em producao nao foi executada nesta sessao.

## 7. Testes tecnicos executados

| Comando | Resultado |
|---|---|
| `npm.cmd run lint` | Passou |
| `npm.cmd run build` | Passou |
| `dotnet build backend\nfe-api\ContHub.NfeApi.csproj --no-restore` | Passou, 0 avisos, 0 erros |
| `dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore` | Passou, 147 testes, 0 falhas |

Observacao:

- O build local do frontend passou.
- O build Vercel tambem completou, mas registrou erros TypeScript em functions de Google Business.
- O Vite manteve aviso de chunk grande, sem falha de build.

## 8. Compatibilidade de camadas

| Camada | Status |
|---|---|
| Frontend NCM import | Compativel com FormData |
| Vercel proxy NCM import | Compativel com multipart e boundary |
| Backend NCM import | Endpoint presente e parser XLSX presente |
| Backend NCM auto sync | Endpoint presente |
| Backend NCM search | Endpoint presente |
| Supabase schema | Compativel estaticamente pela migration; nao comprovado ao vivo |
| NCM como texto | Migration usa `text` em `normalized_code` e preserva zero inicial |
| Catalogo global NCM | Nao ha `organization_id` no `ncm_catalog`, coerente com catalogo global |

## 9. Erros encontrados

1. Logs do deploy Vercel mostram erros TypeScript em `api/google-business.ts`.
2. Endpoint direto Railway `POST /api/reference-data/ncm/import-file` sem login retornou `415`, nao `401`.
3. Validacao Supabase ao vivo nao foi possivel nesta sessao.
4. Testes funcionais autenticados nao foram executados por seguranca e ausencia de sessao.

## 10. Riscos restantes

| Risco | Severidade | Recomendacao |
|---|---:|---|
| Erros TypeScript em Vercel para Google Business | Media | Corrigir antes do proximo deploy |
| Supabase nao validado ao vivo | Media | Rodar diagnostico SQL read-only ou usar MCP Supabase |
| Escrita direta em `fiscal_field_sources` por `authenticated` | Media | Revisar se deve migrar para backend/service role |
| Importacao XLSX nao testada em producao | Baixa/Media | Testar em ambiente seguro com usuario autenticado |
| Chunk JS grande | Baixa | Planejar code splitting |

## 11. Recomendacao final

**APROVADO COM RESSALVAS.**

Pode seguir para teste manual autenticado controlado, mas antes de considerar 100% validado em producao eu recomendo:

1. Corrigir os erros TypeScript de `api/google-business.ts`.
2. Executar diagnostico SQL read-only no Supabase para confirmar objetos, policies, grants e registro `0102.39.11`.
3. Testar importacao XLSX em ambiente seguro ou com autorizacao explicita.
4. Testar busca NCM, autocomplete, perfil fiscal, timeline e simulador com usuario autenticado.
5. Ajustar resposta direta do Railway em `import-file` para priorizar `401` antes de `415`.
