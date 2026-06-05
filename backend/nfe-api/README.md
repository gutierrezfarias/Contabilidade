# CONT HUB NF-e API

Backend fiscal .NET 8 para NF-e modelo 55.

## Railway atual

A API ja esta publicada no Railway no servico `Contabilidade`:

```text
https://contabilidade-production.up.railway.app
```

Health check:

```text
https://contabilidade-production.up.railway.app/health
```

Retorno esperado:

```json
{"ok":true,"service":"CONT HUB NF-e API"}
```

Configuracao atual confirmada:

- Root Directory: `/backend/nfe-api`
- Dockerfile: `backend/nfe-api/Dockerfile`
- Runtime: Docker com .NET 8
- Ambiente: Production
- Frontend: Vercel

## Variaveis no Railway

Obrigatorias:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ASPNETCORE_ENVIRONMENT`

Opcionais:

- `Nfe__SefazTimeoutSeconds`, padrao `60`
- `Nfe__SchemasPath`, padrao `Schemas/NFe/v4.00`

Nao existe validacao de `SEFAZ_BACKEND_TOKEN` neste backend neste momento. Por isso, nao configure nem dependa dessa variavel ate que o codigo implemente essa protecao.

## URL do backend no frontend

A URL correta da API fiscal para o frontend e:

```text
https://contabilidade-production.up.railway.app
```

Se o frontend chamar a API diretamente pelo Vite, use variavel exposta ao navegador, por exemplo:

```text
VITE_SEFAZ_BACKEND_URL=https://contabilidade-production.up.railway.app
```

Se houver proxy/serverless na Vercel, a variavel pode ficar no ambiente do proxy como:

```text
SEFAZ_BACKEND_URL=https://contabilidade-production.up.railway.app
```

## Fluxo de certificado usado

O backend reutiliza o fluxo existente do sistema:

- tabela `public.digital_certificates`
- relacionamento por `organization_id`, `client_id` e `id`
- arquivo A1 em `certificate_file_data`
- nome/tamanho em `certificate_file_name` e `certificate_file_size`
- senha em `certificate_password`
- ambiente em `environment`
- UF em `state_uf`
- servicos habilitados em `public.certificate_services`

Nao ha segunda tabela de certificado, bucket novo ou endpoint paralelo de upload neste backend.

## Banco de dados

Migration fiscal incremental existente:

```text
supabase/migrations/20260604_nfe_emission_backend.sql
```

Antes de rodar, confira no Supabase se ela ja foi aplicada. Ela e incremental e adiciona campos em `clients`, `digital_certificates`, `nfe_documents` e `nfe_sefaz_logs`.

## Schemas XSD

Coloque os schemas oficiais NF-e 4.00 em:

```text
backend/nfe-api/Schemas/NFe/v4.00
```

Nao crie XSD manualmente. Copie os arquivos do pacote oficial da NF-e.

## Endpoints principais

- `GET /health`
- `GET /api/sefaz/status?organizationId=...&clientId=...&certificateId=...&uf=PB&ambiente=homologacao`
- `POST /api/nfe/emitir`
- `POST /api/nfe/gerar-xml`
- `POST /api/nfe/assinar-xml`
- `POST /api/nfe/consultar-retorno`
- `POST /api/nfe/consultar-chave`
- `POST /api/nfe/cancelar`
- `POST /api/nfe/inutilizar`

Todos os endpoints fiscais que acessam dados do escritorio esperam:

```text
Authorization: Bearer <JWT do Supabase>
```

## Rodar localmente

```powershell
cd "C:\Users\gutie\OneDrive\1-Documentos\CONT HUB\sistema-web-pessoal\backend\nfe-api"
$env:SUPABASE_URL="https://SEU-PROJETO.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="SUA_SERVICE_ROLE_KEY"
$env:ASPNETCORE_ENVIRONMENT="Development"
dotnet run
```

## Observacao fiscal

O backend nao deve simular autorizacao real quando estiver em modo real. Se faltar certificado, senha, XSD, cadastro fiscal ou retorno valido da SEFAZ, a operacao deve falhar de forma controlada e registrar log tecnico sem expor XML, certificado ou senha.
