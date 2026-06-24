# Correção NCM - Unsupported Content Type

## Diagnóstico

O erro `{"detail":"Unsupported content type"}` estava relacionado ao fluxo de NCM. A ação envolvida é o botão **Atualizar NCM** na aba **Fiscal > Tabela NCM**.

- Frontend: `POST /api/reference-data/ncm/sync`
- Proxy Vercel: `api/reference-data/ncm/[action].ts`
- Backend .NET: `POST /api/reference-data/ncm/sync`
- Serviço: `NcmCatalogService.SyncAsync`
- Fonte externa: `https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json`

O backend assumia que a fonte externa sempre retornaria JSON válido com itens NCM. Quando a resposta vinha em formato inesperado, inclusive JSON com `detail`, a mensagem podia chegar ao fluxo sem diagnóstico seguro. Além disso, não existia fluxo de contingência para importar manualmente a planilha XLSX `Tabela_NCM_Vigente_20260622.xlsx`, e o proxy NCM sempre forçava `application/json`, o que quebraria qualquer upload multipart.

## Correção

Foram separados os fluxos:

- **Atualizar NCM**: sincronização automática pela fonte externa.
- **Importar XLSX**: contingência manual por `multipart/form-data`.
- **Buscar NCM**: consulta somente registros já armazenados.

O backend agora:

- valida `application/json`, XLSX, `application/octet-stream` e HTML inesperado;
- rejeita erro de fonte externa com código seguro;
- aceita upload XLSX em `POST /api/reference-data/ncm/import-file`;
- valida extensão, MIME, assinatura real ZIP/XLSX, tamanho e arquivo vazio;
- parseia XLSX sem dependência nova, preservando `0102.39.11` como `01023911`;
- grava no mesmo catálogo NCM via `SupabaseFiscalRepository`.

O proxy Vercel agora:

- preserva corpo bruto multipart;
- preserva `Content-Type` com `boundary`;
- não chama `request.json()` para upload;
- mantém JSON nos fluxos de busca/sync.

O frontend agora:

- mantém `Atualizar NCM` sem arquivo;
- adiciona `Importar XLSX`;
- usa `FormData` sem definir manualmente `Content-Type`;
- exibe erro claro quando o arquivo/fonte não é suportado.

## Validação

- `npm.cmd run lint`: passou.
- `npm.cmd run build`: passou.
- `dotnet build backend\nfe-api\ContHub.NfeApi.csproj --no-restore`: passou.
- `dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore --filter FiscalReadinessNcmEnrichmentTests`: 11 testes passaram.
- `dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore`: 147 testes passaram.

## Observações

A migration `supabase/migrations/20260623_fiscal_readiness_ncm_enrichment.sql` ainda precisa ser aplicada no Supabase antes de usar as novas colunas de NCM/proveniência em produção.

Não foi feito commit, push ou deploy.
