# Correcao da rota Vercel `/api/dfe/sync` - 2026-06-15

## Resumo

Foi criada uma funcao serverless explicita para `POST /api/dfe/sync`, evitando que a chamada do frontend dependa apenas do catch-all `api/dfe/[...path].ts`.

A nova rota encaminha a requisicao para:

```text
{SEFAZ_BACKEND_URL}/api/dfe/sync
```

Sem hardcode da URL do Railway.

## Arquivos alterados

- `api/dfe/sync.ts`
  - Nova funcao explicita para `/api/dfe/sync`.
  - Aceita somente `POST` via `proxyNfePost`.
  - Repassa body, `Authorization`, `content-type`, status e JSON de retorno.

- `api/_utils/nfeBackendProxy.ts`
  - Ajustada mensagem de ambiente ausente para `SEFAZ_BACKEND_URL nao configurada.`
  - Falta de `SEFAZ_BACKEND_URL` agora retorna HTTP 500.

- `api/dfe/[...path].ts`
  - Mantido o catch-all.
  - Ajustado erro de ambiente ausente para HTTP 500.
  - Corrigido cast do parser de query.
  - Import atualizado para ESM.

- `api/nfe/[action].ts`
- `api/sefaz/consultar-chave.ts`
- `api/sefaz/consultar-dfe.ts`
- `api/sefaz/manifestar.ts`
- `api/reference-data/ncm/[action].ts`
  - Imports ajustados para resolucao ESM usada pelo build serverless da Vercel.

## Evidencia no pacote Vercel

Apos `npx.cmd vercel build --yes`, a funcao foi gerada em:

```text
.vercel/output/functions/api/dfe/sync.func
```

O handler gerado aponta para:

```ts
proxyNfePost(req, res, '/api/dfe/sync')
```

O `vercel.json` mantem `/api/*` fora do rewrite para `index.html`.

## Validacoes executadas

| Comando | Resultado |
|---|---|
| `npm.cmd run lint` | Passou |
| `npm.cmd run build` | Passou |
| `npx.cmd vercel build --yes` | Gerou `.vercel/output` com `api/dfe/sync.func` |
| `dotnet build backend\nfe-api\ContHub.NfeApi.csproj --no-restore` | Passou |
| `dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore` | Passou, 47 testes |

## Observacoes

- O primeiro `dotnet test` falhou por disputa de arquivo porque havia um `dotnet build` rodando em paralelo. Reexecutado sozinho, passou.
- O `npx.cmd vercel build --yes` ainda imprime diagnosticos TypeScript antigos em `api/google-business.ts`. Eles nao sao da rota DF-e e nao foram alterados nesta correcao.
- O build da Vercel retornou `status: ok` e gerou a funcao `api/dfe/sync.func`.

## Proximo passo

Publicar novamente na Vercel para que a funcao explicita entre em producao:

```powershell
vercel.cmd --prod
```
