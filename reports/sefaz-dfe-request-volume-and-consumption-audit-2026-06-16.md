# Auditoria DF-e / SEFAZ - volume de chamadas e consumo indevido

Data: 2026-06-16

## Resumo executivo

O fluxo DF-e estava funcional, mas permitia nova consulta logo apos retorno sem documentos e a resposta `cStat 656` ainda podia gravar NSU retornado pela SEFAZ. Isso aumentava o risco de consumo indevido quando o usuario repetia a consulta, usava duas abas ou acionava "Consulta Completa".

Foram implementados controles para:

- identificar cada sincronizacao com `syncRunId`;
- diferenciar logs de SEFAZ, banco e Storage;
- parar imediatamente em `137`, `108`, `109` e `656`;
- aplicar cooldown local;
- impedir sincronizacao concorrente por CNPJ + ambiente;
- nao avancar NSU em `656`;
- nao reduzir `maxNSU` valido para zero;
- nao reenviar XML integro ja existente ao Storage;
- bloquear botoes no frontend durante sincronizacao/cooldown.

Nenhuma consulta real a SEFAZ foi executada durante a auditoria.

## Mapa de chamadas

| Origem | Evento que inicia | Endpoint | Destino | Max execucoes | Chama SEFAZ | Chama Supabase | Retry | Condicao de parada | Risco |
|---|---|---|---|---:|---|---|---|---|---|
| `src/pages/accounting/gov/Sefaz.tsx` | Clique em Consulta Resumo | `/api/dfe/sync` | Proxy Vercel | 1 | Indireto | Nao direto nessa chamada | Nao | Backend retorna | Baixo apos correcao |
| `src/pages/accounting/gov/Sefaz.tsx` | Clique em Sincronizar documentos pendentes | `/api/dfe/sync` | Proxy Vercel | 8 solicitados | Indireto | Nao direto nessa chamada | Nao | `137`, `656`, sem docs, `ultNSU=maxNSU`, erro ou max cycles | Medio controlado pelo backend |
| `src/services/sefazDocumentService.ts` | Funcao `consultDfeFromSefaz` | `/api/dfe/sync` | Vercel | 1 HTTP | Nao direto | Nao | Nao | Resposta HTTP | Baixo |
| `api/dfe/sync.ts` | POST recebido | `/api/dfe/sync` backend | Railway/.NET | 1 HTTP | Nao direto | Nao | Nao | Resposta do backend | Baixo |
| `api/dfe/[...path].ts` | GET/POST generico DF-e | `/api/dfe/*` backend | Railway/.NET | 1 HTTP | Nao direto | Nao | Nao | Resposta do backend | Baixo |
| `backend/nfe-api/Program.cs` | POST `/api/dfe/sync` | `SefazDfeDistributionService.SyncAsync` | Servico interno | 1 chamada ao servico | Indireto | Indireto | Nao | Resultado do servico | Baixo |
| `SefazDfeDistributionService.SyncAsync` | Loop `distNSU` | `NFeDistribuicaoDFe` | SEFAZ Ambiente Nacional | 1 a 8 | Sim | Sim, para estado/docs/logs | Nao | Politica DF-e | Ponto principal corrigido |
| `SefazSoapClientService.DistributeDfeAsync` | Cada ciclo do backend | SOAP SEFAZ | SEFAZ | 1 por ciclo | Sim | Nao | Nao | HTTP/cStat | Baixo, sem retry automatico |
| `SupabaseDfeRepository` | Estado, documentos, logs | REST/Storage Supabase | Supabase | Variavel por documento | Nao | Sim | Nao | Persistencia concluida | Baixo |
| `QueryNsuAsync` | Consulta pontual manual | `consNSU` | SEFAZ | 1 | Sim | Sim | Nao | Resposta ou cooldown local 1 min | Controlado |
| `QueryAccessKeyAsync` | Consulta pontual por chave | `consChNFe` | SEFAZ | 1 | Sim | Sim | Nao | Resposta ou cooldown local 1 min | Controlado |

## Respostas objetivas

1. Consulta Resumo faz exatamente 1 chamada real a SEFAZ.
2. Sincronizar documentos pendentes pode fazer ate 8 chamadas, mas para antes se vier `137`, `656`, sem documentos ou `ultNSU=maxNSU`.
3. Nao existe tentativa automatica de DF-e sem clique.
4. Nao existe polling, timer ou job automatico para SEFAZ. Existem timers de UI/status local, sem chamada externa a SEFAZ.
5. O proxy Vercel nao possui retry.
6. O `HttpClient` nao possui politica Polly/resilience/retry configurada.
7. O backend nao repete chamada apos erro HTTP da SEFAZ.
8. Apos `137`, o backend para no primeiro ciclo e aplica cooldown de 1 hora.
9. Apos `656`, o backend para, bloqueia por 1 hora e nao altera `lastNSU`.
10. Duplo clique fica bloqueado no frontend e no backend.
11. Duas abas ficam bloqueadas no backend por CNPJ + ambiente.
12. Dois usuarios com o mesmo CNPJ tambem ficam bloqueados por CNPJ + ambiente.
13. Outro sistema externo consultando o mesmo CNPJ pode afetar o controle da SEFAZ e contribuir para `656`.

## Correcoes implementadas

- `DfeSyncPolicy`: centraliza ciclos, cooldown, parada por `cStat`, NSU suspeito e deduplicacao.
- `syncRunId`: gerado no frontend, enviado pelo proxy e registrado no backend/logs.
- Logs estruturados:
  - `DFE_SYNC_START`
  - `DFE_SEFAZ_REQUEST`
  - `DFE_SEFAZ_RESPONSE`
  - `DFE_SYNC_STOP`
- `137`: encerra imediatamente e aplica `next_allowed_sync_at = now + 1 hora`.
- `656`: encerra imediatamente, retorna `DFE_SYNC_COOLDOWN`, aplica status `blocked`, preserva NSU valido anterior.
- `108` e `109`: encerram e entram em cooldown curto, sem retry.
- `maxNSU`: nao e reduzido para zero quando ja existe valor valido.
- `resetNsu`: nao zera estado existente que ja possui NSU valido.
- Lock: bloqueio por CNPJ + ambiente alem do estado do cliente/certificado.
- XML: documento completo com mesmo hash nao sobe novamente ao Storage.
- Consultas pontuais: `consNSU` e `consChNFe` recebem limitador local de 1 minuto por CNPJ/ambiente.
- Frontend: botoes desabilitados durante consulta/cooldown e label alterado para "Sincronizar documentos pendentes".

## Estrategia de lock

O backend valida:

- estado atual `running` ainda dentro do TTL de 10 minutos;
- outro estado `running` com o mesmo `cnpj` e `environment`;
- `next_allowed_sync_at` futuro.

Se houver sincronizacao em andamento: HTTP 409 com `DFE_SYNC_ALREADY_RUNNING`.

Se houver cooldown: HTTP 429 com `DFE_SYNC_COOLDOWN`.

## Estrategia de cooldown

- `137`: 1 hora.
- `656`: 1 hora.
- `108`/`109`: 15 minutos.
- erro tecnico: 15 minutos.
- cooldown e validado antes de chamar SEFAZ.

## Estrategia de NSU

- `lastNSU` so avanca apos persistencia segura.
- Falha de Storage nao avanca alem do ultimo NSU confirmado.
- `656`, `108` e `109` preservam `lastNSU` e `maxNSU` anteriores.
- `maxNSU` valido anterior nao e sobrescrito por zero.
- Foi criado diagnostico somente leitura: `supabase/diagnostics/20260616_dfe_nsu_state_diagnostic.sql`.

## Estrategia de deduplicacao XML

Antes de upload, o backend procura documento por:

1. organizacao + cliente + chave de acesso + schema;
2. organizacao + cliente + certificado + NSU + schema;
3. organizacao + cliente + hash XML.

Se o documento existente tem `has_full_xml = true`, `xml_storage_path` e mesmo hash, o upload e ignorado como `ignored_existing`.

Se existir registro incompleto, ele e completado sem duplicidade.

## Quantidade de chamadas internas ao Supabase

Por sincronizacao, existem chamadas internas esperadas:

- leitura/criacao do estado de sincronizacao;
- verificacao de lock por CNPJ;
- patch de lock `running`;
- para cada documento: consulta de existencia e insert/update quando necessario;
- upload no Storage apenas para XML novo ou incompleto;
- patch final do estado;
- insert de log.

Essas linhas em Railway/Supabase nao representam multiplas chamadas SEFAZ. Chamadas reais a SEFAZ agora aparecem como `DFE_SEFAZ_REQUEST` e `DFE_SEFAZ_RESPONSE`.

## Causa provavel do `656`

O `656` provavelmente veio de repeticao de consultas para o mesmo CNPJ/ambiente em intervalo curto, possivelmente combinada com:

- "Consulta Completa" solicitando ate 8 ciclos;
- nova tentativa logo apos retorno sem documentos;
- uso em abas diferentes;
- outro sistema externo consultando o mesmo CNPJ/certificado.

## Testes criados ou ajustados

- `backend/nfe-api.tests/DfeSyncPolicyTests.cs`
  - limite de ciclos;
  - parada em `137`/`656`;
  - parada em `ultNSU=maxNSU`;
  - cooldown;
  - preservacao de `maxNSU`;
  - diagnostico de NSU suspeito;
  - deduplicacao de XML integro.
- `backend/nfe-api.tests/SupabaseDfeRepositoryLockTests.cs`
  - cooldown bloqueia localmente;
  - lock por CNPJ+ambiente bloqueia concorrencia;
  - lock normal grava `running`.
- `backend/nfe-api.tests/SupabaseDfeRepositoryStorageTests.cs`
  - XML existente e completo nao e enviado novamente ao Storage.

## Resultado dos comandos

- `npm.cmd run lint`: aprovado.
- `npm.cmd run build`: aprovado, com aviso conhecido de chunk Vite maior que 500 kB.
- `dotnet build backend\nfe-api\ContHub.NfeApi.csproj --no-restore`: aprovado.
- `dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore`: aprovado, 61 testes.

## Arquivos alterados

- `api/_utils/nfeBackendProxy.ts`
- `api/dfe/[...path].ts`
- `backend/nfe-api/Models/DfeModels.cs`
- `backend/nfe-api/Program.cs`
- `backend/nfe-api/Services/DfeSyncPolicy.cs`
- `backend/nfe-api/Services/SefazDfeDistributionService.cs`
- `backend/nfe-api/Services/SupabaseDfeRepository.cs`
- `backend/nfe-api.tests/DfeSyncPolicyTests.cs`
- `backend/nfe-api.tests/SupabaseDfeRepositoryLockTests.cs`
- `backend/nfe-api.tests/SupabaseDfeRepositoryStorageTests.cs`
- `src/components/sefaz/NfeDfeSearchPanel.tsx`
- `src/pages/accounting/gov/Sefaz.tsx`
- `src/services/sefazDocumentService.ts`
- `supabase/diagnostics/20260616_dfe_nsu_state_diagnostic.sql`

## Como validar nos logs

Procure no Railway por `syncRunId`.

Para uma sincronizacao, deve aparecer:

```text
DFE_SYNC_START syncRunId=...
DFE_SEFAZ_REQUEST syncRunId=...
DFE_SEFAZ_RESPONSE syncRunId=...
DFE_SYNC_STOP syncRunId=...
```

`DFE_SEFAZ_REQUEST` e a linha que conta chamada real a SEFAZ.

Operacoes de banco/storage aparecem como contadores no resumo:

```text
sefazCalls=1 dbReads=... dbWrites=... storageUploads=...
```

## Pendencias e riscos restantes

- O lock por CNPJ e feito no backend e reduz muito o risco, mas uma garantia 100% atomica em multiplas instancias Railway exigiria RPC/constraint/advisory lock no Postgres.
- Os contadores detalhados sao retornados pela API e registrados no log; persistir campos separados em `nfe_dfe_sync_logs` exigiria migration futura.
- O limitador de consultas pontuais usa memoria da instancia; em multiplas instancias, o ideal e persistir limite no banco.
- Nao foi feita consulta real a SEFAZ nos testes automatizados, por seguranca.
- Outro sistema externo usando o mesmo CNPJ/certificado ainda pode causar bloqueio na SEFAZ.
