# Correção frontend SEFAZ DF-e - acionamento `/api/dfe/sync`

Data: 2026-06-15  
Escopo: frontend da tela SEFAZ do CONT HUB  
Restricoes cumpridas: sem banco, sem migration, sem certificado/senha, sem manifestacao real, sem commit, sem push, sem deploy.

## 1. Causa exata

Os botoes `Consulta Resumo` e `Consulta Completa` passavam pelo handler `refreshDocuments`, mas o servico `consultDfeFromSefaz` ainda chamava a rota legada:

```ts
fetch('/api/sefaz/consultar-dfe', ...)
```

Com isso, a tela nao usava diretamente o novo proxy Vercel `/api/dfe/sync`, e o retorno tambem era interpretado com o formato antigo `documentsImported`. O backend .NET novo retorna campos como `success`, `receivedCount`, `insertedCount`, `updatedCount`, `ignoredCount`, `lastNsu`, `maxNsu`, `statusCode` e `statusMessage`.

## 2. Handler antigo

Arquivo: `src/pages/accounting/gov/Sefaz.tsx`

Fluxo antigo:

1. `NfeDfeSearchPanel` chamava `onConsult('summary')` ou `onConsult('complete')`.
2. A tela executava `refreshDocuments(queryType)`.
3. `refreshDocuments` chamava `consultDfeFromSefaz`.
4. O servico chamava `/api/sefaz/consultar-dfe`.
5. Em erro, a tela recebia mensagem generica.

## 3. Handler corrigido

O handler da tela continua sendo `refreshDocuments`, mas agora:

- bloqueia clique concorrente com `if (isRefreshing) return`;
- envia o ambiente do certificado para o servico;
- mostra `cStat`, `xMotivo`, `ultNSU`, `maxNSU` e quantidades retornadas.

O servico `consultDfeFromSefaz` agora chama diretamente:

```ts
POST /api/dfe/sync
```

## 4. Endpoint chamado

Endpoint frontend/proxy:

```http
POST /api/dfe/sync
```

Esse proxy encaminha para o backend fiscal configurado em:

```text
SEFAZ_BACKEND_URL
```

## 5. Payload

Payload enviado pelo frontend:

```json
{
  "organizationId": "UUID_DA_ORGANIZACAO",
  "clientId": "UUID_DO_CLIENTE",
  "certificateId": "UUID_DO_CERTIFICADO",
  "environment": "homologacao",
  "maxCycles": 1,
  "resetNsu": false
}
```

Para `Consulta Completa`:

```json
{
  "maxCycles": 8,
  "resetNsu": false
}
```

O CNPJ, certificado e senha continuam sendo obtidos/validados no backend. O frontend nao envia senha, PFX/P12 ou XML.

## 6. Tratamento de erro

Antes:

```text
Nao foi possivel consultar NF-e/DF-e na SEFAZ.
```

Agora a mensagem inclui:

- HTTP status;
- codigo fiscal, quando existir;
- mensagem do backend/SEFAZ;
- detalhe seguro;
- acao recomendada.

Exemplo:

```text
HTTP 401. Codigo: Nao informado. Mensagem: Login obrigatorio. Acao recomendada: Entre novamente no sistema e tente outra vez.
```

Tambem foi mantido log seguro no console apenas com:

- endpoint;
- status HTTP;
- cStat/statusCode;
- momento.

Nao registra JWT, senha, PFX, XML ou service role.

## 7. Arquivos alterados

- `src/services/sefazDocumentService.ts`
- `src/pages/accounting/gov/Sefaz.tsx`
- `reports/sefaz-dfe-frontend-sync-fix-2026-06-15.md`

## 8. Testes e validações executados

Comandos executados:

```powershell
npm.cmd run lint
npm.cmd run build
dotnet build backend\nfe-api\ContHub.NfeApi.csproj --no-restore
dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore
```

## 9. Resultado dos comandos

- `npm.cmd run lint`: passou.
- `npm.cmd run build`: passou.
- `dotnet build`: passou, 0 erros.
- `dotnet test`: passou, 47 testes.

Observacao: o build do Vite manteve apenas o aviso de chunk maior que 500 kB, ja existente e sem bloquear a publicacao.

## 10. Como testar no navegador

1. Publicar o frontend.
2. Confirmar que `SEFAZ_BACKEND_URL` esta configurada na Vercel.
3. Acessar a tela SEFAZ.
4. Selecionar cliente e certificado ativo.
5. Abrir DevTools > Network.
6. Clicar em `Consulta Resumo`.
7. Depois clicar em `Consulta Completa`.

## 11. O que deve aparecer no Network

Ao clicar em `Consulta Resumo`:

```http
POST https://cont-hub.vercel.app/api/dfe/sync
```

Headers esperados:

```http
Authorization: Bearer JWT_DO_SUPABASE
Content-Type: application/json
```

Ao clicar em `Consulta Completa`, a mesma rota deve aparecer, com `maxCycles: 8`.

Nao deve aparecer envio de senha, PFX/P12, XML completo ou service role.

## 12. O que deve aparecer no Supabase

Apos uma chamada real com retorno do backend:

- `nfe_dfe_sync_states`: deve receber/atualizar o estado de NSU.
- `nfe_dfe_sync_logs`: deve registrar a tentativa com cStat/xMotivo.
- `nfe_dfe_documents`: deve receber documentos quando a SEFAZ retornar DF-e.

Se a SEFAZ retornar `137`, pode nao haver documentos, mas ainda deve haver estado/log indicando a consulta.

## 13. Pendencias restantes

- Teste real depende do backend Railway publicado e da variavel `SEFAZ_BACKEND_URL`.
- Resultado fiscal depende de certificado valido, senha correta, ambiente correto e disponibilidade da SEFAZ.
- Nao foi feita manifestacao real nesta execucao.
- Nao foi chamada producao em teste automatizado.

