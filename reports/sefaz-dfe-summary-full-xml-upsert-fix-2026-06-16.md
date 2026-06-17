# Correção DF-e: resNFe + procNFe com mesma chave

Data: 2026-06-16

## Resumo executivo

Foi corrigido o conflito de duplicidade no processamento da Distribuição DF-e quando a SEFAZ retorna `resNFe` e depois `procNFe` para a mesma chave de acesso.

Antes, o backend procurava documento existente por:

- `organization_id`
- `client_id`
- `access_key`
- `schema_name`

Isso permitia tentar inserir dois registros da mesma NF-e quando o primeiro era `resNFe` e o segundo era `procNFe`. Em bancos que ainda possuem o índice antigo `idx_nfe_dfe_documents_company_chave`, essa tentativa gerava erro de duplicate key.

Agora, o backend usa a chave lógica:

- `organization_id`
- `client_id`
- `access_key`

O `schema_name` deixou de participar da identidade lógica da nota.

## O que foi corrigido

| Item | Status | Evidência |
|---|---:|---|
| `resNFe` e `procNFe` da mesma chave deixam de gerar insert duplicado | Concluído | `backend/nfe-api/Services/SupabaseDfeRepository.cs:544` |
| `procNFe` atualiza o registro previamente criado como `resNFe` | Concluído | `backend/nfe-api/Services/SupabaseDfeRepository.cs:151` |
| Registro com XML completo não é rebaixado por resumo posterior | Concluído | `backend/nfe-api/Services/SupabaseDfeRepository.cs:235` |
| `procEventoNFe` não substitui a NF-e principal | Concluído | `backend/nfe-api/Services/SupabaseDfeRepository.cs:175` |
| Eventos seguem para `nfe_dfe_events` | Concluído | `backend/nfe-api/Services/SupabaseDfeRepository.cs:247` |
| Upload duplicado de XML completo é evitado quando hash/path já existem | Concluído | `backend/nfe-api/Services/SupabaseDfeRepository.cs:566` |
| Falha de banco após upload tenta limpar o XML recém-enviado | Concluído | `backend/nfe-api/Services/SupabaseDfeRepository.cs:523` |
| Erro estruturado para conflito de persistência | Concluído | `backend/nfe-api/Models/DfeModels.cs:228` |
| Endpoints DF-e retornam `409 Conflict` estruturado | Concluído | `backend/nfe-api/Program.cs:371`, `:592`, `:659` |
| Índice lógico único por chave de acesso | Concluído | `supabase/migrations/20260617_dfe_summary_full_xml_upsert.sql:47` |
| Diagnóstico SQL de duplicados | Concluído | `supabase/diagnostics/20260617_dfe_duplicate_access_key_diagnostic.sql` |

## Auditoria técnica

### Índices encontrados

- `idx_nfe_dfe_documents_company_chave`: índice antigo em `supabase/sql/required-nfe-schema.sql`.
- `nfe_dfe_documents_unique_access_schema_idx`: índice atual por `organization_id`, `client_id`, `access_key`, `schema_name`.
- `nfe_dfe_documents_unique_nsu_schema_idx`: índice por NSU e schema.
- `nfe_dfe_documents_xml_hash_idx`: índice por hash XML.

### Problema identificado

O índice por `schema_name` permite que a mesma NF-e exista como `resNFe` e `procNFe`. Isso é incorreto para a identidade lógica da nota.

O índice antigo `idx_nfe_dfe_documents_company_chave` estava mais próximo do comportamento correto, por isso ele expôs o erro do backend.

### Decisão aplicada

Não apaguei índice antigo nem dados.

Foi adicionada uma migration nova e idempotente criando:

```sql
nfe_dfe_documents_unique_logical_access_key_idx
```

com unicidade em:

```sql
organization_id, client_id, access_key
```

apenas quando `access_key <> ''`.

Se já existirem duplicados, a migration interrompe com erro controlado para evitar perda de dados.

## Regras novas de persistência

| Entrada SEFAZ | Registro existente | Ação |
|---|---|---|
| `resNFe` | nenhum | cria resumo |
| `procNFe` | `resNFe` da mesma chave | atualiza para XML completo |
| `resNFe` | `procNFe` completo da mesma chave | ignora, sem rebaixar |
| `procNFe` | `procNFe` igual, mesmo hash | ignora, sem novo upload |
| `procEventoNFe` | NF-e principal existe | salva/atualiza em `nfe_dfe_events` |
| `procEventoNFe` | NF-e principal não existe | salva evento sem criar documento principal falso |
| conflito `23505` | qualquer | retorna `DFE_DOCUMENT_PERSISTENCE_CONFLICT` |

## NSU

O avanço de NSU já estava correto no fluxo principal:

- `SefazDfeDistributionService` só atualiza `currentNsu`/`persistedNsu` depois que `SaveProcessedDocumentsAsync` retorna com sucesso.
- Se persistência falhar, o catch usa `persistedNsu`, mantendo o NSU anterior.

Com a correção, duplicados esperados deixam de falhar. Se houver conflito real, o erro é estruturado e o NSU não deve avançar.

## Testes adicionados

Arquivo:

`backend/nfe-api.tests/SupabaseDfeRepositoryStorageTests.cs`

Casos adicionados:

1. `resNFe` é atualizado para `procNFe` pela chave lógica.
2. XML completo não é rebaixado para resumo.
3. `procEventoNFe` é gravado apenas em `nfe_dfe_events`.
4. Duplicate insert gera `DFE_DOCUMENT_PERSISTENCE_CONFLICT` e tenta limpar storage.

## Validação executada

| Comando | Resultado |
|---|---:|
| `npm.cmd run lint` | Passou |
| `npm.cmd run build` | Passou |
| `dotnet build backend\nfe-api\ContHub.NfeApi.csproj --no-restore` | Passou |
| `dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore` | Passou: 118 testes |

Observação: a primeira execução paralela de `dotnet test` falhou porque `dotnet build` estava usando o mesmo DLL no `obj`. Reexecutado isoladamente, passou.

## Arquivo que deve ser executado no Supabase

Execute:

```text
supabase/migrations/20260617_dfe_summary_full_xml_upsert.sql
```

Opcionalmente, antes ou depois, rode o diagnóstico:

```text
supabase/diagnostics/20260617_dfe_duplicate_access_key_diagnostic.sql
```

## Riscos residuais

- Se já houver duplicados reais em produção, a migration vai parar. Nesse caso, é necessário reconciliar manualmente qual registro fica como principal.
- A limpeza de Storage é best-effort; se o Supabase Storage estiver indisponível no momento da falha de banco, pode sobrar XML órfão.
- O índice antigo `idx_nfe_dfe_documents_company_chave` não foi removido. Isso é conservador e evita perda de proteção em bancos legados.

## Próxima ação recomendada

1. Rodar o diagnóstico de duplicados.
2. Rodar a migration `20260617_dfe_summary_full_xml_upsert.sql`.
3. Fazer deploy do backend fiscal.
4. Reexecutar a sincronização DF-e do cliente que retornou `cStat 138`.
