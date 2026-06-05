# CONT HUB NF-e API

Backend fiscal real para NF-e modelo 55.

## Rodar localmente

```powershell
cd "C:\Users\gutie\OneDrive\1-Documentos\CONT HUB\sistema-web-pessoal\backend\nfe-api"
$env:SUPABASE_URL="https://SEU-PROJETO.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="SUA_SERVICE_ROLE_KEY"
dotnet run
```

API local:

`http://localhost:5099`

## Variaveis obrigatorias

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Banco de dados

Rode antes no SQL Editor do Supabase:

```text
supabase/migrations/20260604_nfe_emission_backend.sql
```

Esse script adiciona campos incrementais em `clients`, `digital_certificates`, `nfe_documents` e cria `nfe_sefaz_logs`.

## Schemas XSD

Coloque os schemas oficiais NF-e 4.00 em:

`backend/nfe-api/Schemas/NFe/v4.00`

Arquivos minimos esperados para o fluxo criado:

- `enviNFe_v4.00.xsd`
- `consReciNFe_v4.00.xsd`
- `consSitNFe_v4.00.xsd`
- `envEventoCancNFe_v1.00.xsd`
- `inutNFe_v4.00.xsd`

Sem XSD, o backend nao transmite NF-e real.

## Endpoints

- `POST /api/nfe/emitir`
- `POST /api/nfe/gerar-xml`
- `POST /api/nfe/assinar-xml`
- `POST /api/nfe/consultar-retorno`
- `POST /api/nfe/consultar-chave`
- `POST /api/nfe/cancelar`
- `POST /api/nfe/inutilizar`
- `GET /api/sefaz/status`

## Observacao fiscal

Este backend nao simula autorizacao real. Quando falta dado fiscal, schema XSD, certificado ou retorno SEFAZ valido, a operacao retorna erro e registra log tecnico sem expor certificado, senha ou XML em logs.

O DANFE gerado aqui e um PDF auxiliar basico. Para producao, evolua para layout DANFE completo conforme o Manual de Orientacao do Contribuinte antes de entregar ao cliente final.
