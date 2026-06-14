# Auditoria e implementacao - SEFAZ DF-e / NFeDistribuicaoDFe

Data: 2026-06-13  
Projeto: CONT HUB  
Escopo: modulo SEFAZ / DF-e / NF-e  
Restricoes cumpridas: sem commit, sem push, sem deploy, sem uso de SERPRO/API paga, sem IA, sem apagar dados existentes.

## 1. Resumo executivo

O prompt ainda nao estava completamente executado. Havia uma implementacao parcial no frontend e em funcoes Vercel antigas para consulta DF-e, mas nao existia o fluxo completo no backend .NET com tabelas dedicadas, estado de NSU, armazenamento privado do XML, logs estruturados, endpoints `/api/dfe/*` e testes do processador DF-e.

Foi implementada a base real para consulta oficial via `NFeDistribuicaoDFe`, usando certificado A1 ja cadastrado no fluxo atual. A implementacao esta pronta para ser aplicada no Supabase e publicada junto ao backend .NET. Nenhuma chamada real a SEFAZ foi executada durante esta auditoria.

## 2. O que ja existia

- Tela SEFAZ no frontend com selecao de empresa, certificado, abas de notas e botoes de acao.
- Servico frontend `sefazDocumentService.ts`.
- Funcoes antigas em `api/sefaz/consultar-dfe.ts`, `api/sefaz/consultar-chave.ts` e `api/sefaz/manifestar.ts`.
- Backend .NET com infraestrutura fiscal existente: certificados, assinatura XML, cliente SOAP e repositorio Supabase NF-e.
- Tabela anterior `nfe_documents` e migracao `20260603_sefaz_dfe_center.sql`, ainda insuficientes para o fluxo DF-e completo por NSU.

## 3. O que estava parcial

- A consulta DF-e existia de forma limitada em funcoes Vercel, nao no backend fiscal principal.
- Nao havia controle completo de `ultNSU`, `maxNSU`, lock de sincronizacao e historico de tentativas.
- Nao havia tabela propria para documentos DF-e recebidos, eventos, logs de sincronizacao e logs de acesso a XML.
- Nao havia bucket privado dedicado para XML distribuido pela SEFAZ.
- Nao havia endpoints .NET para sync, consulta por NSU, consulta por chave, download XML e manifestacao.
- Nao havia teste automatizado para montagem e leitura dos XMLs do DF-e.

## 4. O que foi implementado

- Migracao SQL incremental para DF-e:
  - `nfe_dfe_sync_states`
  - `nfe_dfe_documents`
  - `nfe_dfe_events`
  - `nfe_dfe_sync_logs`
  - `nfe_dfe_access_logs`
  - bucket privado `nfe-dfe-xml`
  - RLS por organizacao e cliente.
- Backend .NET:
  - montagem de `distDFeInt` para `distNSU`, `consNSU` e `consChNFe`;
  - envio SOAP para `NFeDistribuicaoDFe`;
  - leitura de `docZip` com Base64 + GZip;
  - parsing de `resNFe`, `procNFe` e `procEventoNFe`;
  - persistencia de documentos, eventos, XML privado e logs;
  - controle incremental de NSU com lock e backoff;
  - manifestacao manual com confirmacao do usuario.
- Frontend:
  - leitura das novas tabelas `nfe_dfe_*`;
  - consulta autenticada via backend;
  - download de XML privado por endpoint autenticado;
  - proxy Vercel para `/api/dfe/*`.
- Testes:
  - testes unitarios do processador XML DF-e.

## 5. Servico oficial utilizado

Servico: `NFeDistribuicaoDFe`  
Operacao: `nfeDistDFeInteresse`  
Namespace: `http://www.portalfiscal.inf.br/nfe`  
Versao: `1.01` para distribuicao DF-e.

Endpoints configurados no backend:

- Homologacao: `https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx`
- Producao: `https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx`

Referencias oficiais:

- Portal NF-e / Web Services: `https://www.nfe.fazenda.gov.br/portal/webServices.aspx?tipoConteudo=OUC%2FYVNWZfo%3D`
- Portal NF-e / Schemas: `https://www.nfe.fazenda.gov.br/portal/listaSubMenu.aspx?Id=04BIflQt1aY%3D`

## 6. Fluxo do certificado

1. O frontend seleciona cliente e certificado ativo ja cadastrado.
2. O backend busca empresa/cliente no Supabase.
3. O backend busca o certificado ativo no cadastro existente.
4. O backend valida PFX/P12 e senha usando o fluxo atual.
5. O certificado e a senha nao sao enviados ao navegador.
6. O certificado e a senha nao sao gravados em logs.
7. A chamada SOAP para a SEFAZ usa o certificado no backend.

## 7. Fluxo NSU

1. A tela chama `/api/dfe/sync`.
2. O backend verifica o estado em `nfe_dfe_sync_states`.
3. Se nao existir estado, cria com `ult_nsu = 0`.
4. O backend adquire lock curto para evitar duas sincronizacoes simultaneas.
5. Monta `distDFeInt` com `distNSU`.
6. Envia para SEFAZ.
7. Lendo retorno:
   - `ultNSU`;
   - `maxNSU`;
   - `cStat`;
   - `xMotivo`;
   - documentos compactados em `docZip`.
8. Descompacta, interpreta e salva XML/documentos/eventos.
9. Atualiza `ult_nsu` somente depois de persistir o retorno.
10. Grava log tecnico sem XML, certificado ou senha.

## 8. Estrutura das tabelas

Arquivo SQL: `supabase/migrations/20260613_sefaz_dfe_distribution.sql`

Tabelas criadas:

- `public.nfe_dfe_sync_states`: estado incremental por `organization_id`, `client_id`, `certificate_id` e ambiente.
- `public.nfe_dfe_documents`: documentos DF-e recebidos, chaves, emitente/destinatario, resumo, status e caminho privado do XML.
- `public.nfe_dfe_events`: eventos vinculados a documento/chave, incluindo manifestacao.
- `public.nfe_dfe_sync_logs`: logs de consulta a SEFAZ com `cStat`, `xMotivo`, endpoint, UF, ambiente e tempos.
- `public.nfe_dfe_access_logs`: historico de acesso/download a XML privado.

Bucket criado:

- `nfe-dfe-xml`, privado, para XML distribuido pela SEFAZ.

## 9. Endpoints

Backend .NET:

- `POST /api/dfe/sync`
- `GET /api/dfe/sync/status`
- `GET /api/dfe/documents`
- `GET /api/dfe/documents/{id}`
- `GET /api/dfe/documents/{id}/xml`
- `GET /api/dfe/documents/{id}/events`
- `POST /api/dfe/query/nsu`
- `POST /api/dfe/query/access-key`
- `POST /api/dfe/documents/{id}/manifest`

Proxy Vercel:

- `api/dfe/[...path].ts`
- `api/sefaz/consultar-dfe.ts`
- `api/sefaz/consultar-chave.ts`
- `api/sefaz/manifestar.ts`

## 10. Telas

Tela alterada:

- `src/pages/accounting/gov/Sefaz.tsx`

Servico frontend alterado:

- `src/services/sefazDocumentService.ts`

A tela continua usando o layout atual, mas a origem dos dados passa a ser a estrutura `nfe_dfe_*`.

## 11. Regras de armazenamento

- XML retornado pela SEFAZ e salvo em Supabase Storage privado.
- Banco salva metadados, status, resumo, hash e caminho do XML.
- O download passa por endpoint autenticado.
- O XML nao e salvo em localStorage/sessionStorage.
- XML, certificado e senha nao sao gravados em logs.

## 12. Manifestacao

Manifestacao implementada como acao manual, nao automatica.

Eventos suportados:

- `210200` - Confirmacao da Operacao.
- `210210` - Ciencia da Operacao.
- `210220` - Desconhecimento da Operacao.
- `210240` - Operacao nao Realizada.

Regras:

- Exige confirmacao explicita do usuario.
- `210240` exige justificativa.
- Aceita retorno `135`, `136` e `573` como situacoes tratadas.
- Salva evento e log, sem expor XML sensivel.

## 13. Seguranca

Implementado:

- Endpoints exigem `Authorization Bearer`.
- Backend usa service role somente no servidor.
- RLS nas tabelas por `organization_id` via `is_org_member`.
- Admin por `is_platform_admin`.
- Bucket privado para XML.
- Logs sem XML, certificado ou senha.
- Validacao de acesso antes de listar documento/XML/eventos.

Pendente:

- Criptografia adicional do XML no storage, se exigido por politica interna.
- Cofre externo para certificado/senha, caso o sistema saia do MVP.
- Auditoria de acesso mais detalhada por IP/origem.

## 14. RLS

Criado no SQL:

- `alter table ... enable row level security`
- policies de `select`, `insert` e `update` para membros da organizacao ou admin.
- logs de acesso e sincronizacao tambem isolados por organizacao.

O isolamento depende das funcoes ja existentes:

- `public.is_org_member(uuid)`
- `public.is_platform_admin()`

## 15. Testes

Criado:

- `backend/nfe-api.tests/DfeXmlProcessorServiceTests.cs`

Cobertura:

- montagem XML `distNSU`;
- montagem XML `consNSU`;
- montagem XML `consChNFe`;
- leitura de resposta com `docZip`;
- extracao de dados basicos de `resNFe`.

Nao executado:

- chamada real a SEFAZ;
- manifestacao real;
- teste E2E com certificado real.

## 16. Comandos executados

Frontend:

```powershell
npm.cmd run lint
npm.cmd run build
```

Backend:

```powershell
dotnet build backend\nfe-api\ContHub.NfeApi.csproj --no-restore
dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore
```

Resultados:

- `npm.cmd run lint`: passou.
- `npm.cmd run build`: passou, com aviso de chunks grandes do Vite.
- `dotnet build`: passou, 0 erros.
- `dotnet test`: passou, 47 testes.

## 17. Arquivos alterados

Alterados:

- `api/sefaz/consultar-chave.ts`
- `api/sefaz/consultar-dfe.ts`
- `api/sefaz/manifestar.ts`
- `backend/nfe-api/Program.cs`
- `backend/nfe-api/Services/SefazSoapClientService.cs`
- `src/pages/accounting/gov/Sefaz.tsx`
- `src/services/sefazDocumentService.ts`

Criados:

- `api/dfe/[...path].ts`
- `backend/nfe-api/Models/DfeModels.cs`
- `backend/nfe-api/Services/DfeXmlProcessorService.cs`
- `backend/nfe-api/Services/SefazDfeDistributionService.cs`
- `backend/nfe-api/Services/SupabaseDfeRepository.cs`
- `backend/nfe-api.tests/DfeXmlProcessorServiceTests.cs`
- `supabase/migrations/20260613_sefaz_dfe_distribution.sql`
- `reports/sefaz-dfe-distribution-audit-and-implementation-2026-06-12.md`

## 18. SQL criado

SQL incremental:

```text
supabase/migrations/20260613_sefaz_dfe_distribution.sql
```

Esse SQL precisa ser rodado no Supabase antes de usar o fluxo novo.

## 19. Dependencias adicionadas

Nao foram adicionadas novas dependencias npm ou NuGet.

A implementacao usa recursos ja existentes no projeto e APIs padrao do .NET para XML, GZip, Hash e HTTP.

## 20. Riscos restantes

- A consulta real depende de certificado valido, senha correta, CNPJ compatizado e ambiente correto.
- A SEFAZ pode retornar rejeicoes por consumo indevido, intervalo curto, NSU fora de ordem ou falta de documentos.
- Distribuicao DF-e nao e historico completo de notas emitidas pela propria empresa. Para notas emitidas, o sistema deve importar XML emitido, emitir pelo proprio sistema ou consultar por chave quando cabivel.
- Manifestacao real altera situacao fiscal do documento; por isso ficou manual e exige confirmacao.
- DANFE completo a partir de XML autorizado ainda depende do fluxo de NF-e emitida/importada.
- Validacao XSD do XML retornado pela distribuicao ainda nao foi adicionada.
- Job automatico/agendado de sincronizacao ainda nao foi implementado; o sync atual e manual pela tela/endpoint.

## 21. Passos para aplicar SQL

1. Abrir Supabase.
2. Ir em SQL Editor.
3. Criar uma nova query.
4. Copiar o conteudo de:

```text
supabase/migrations/20260613_sefaz_dfe_distribution.sql
```

5. Executar.
6. Confirmar se as tabelas aparecem em `public`.
7. Confirmar se o bucket `nfe-dfe-xml` existe e esta privado.

## 22. Passos para testar sem manifestacao real

1. Rodar o SQL no Supabase.
2. Publicar o backend .NET em Railway/host proprio.
3. Configurar variaveis do backend:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

4. Configurar no Vercel:

```text
SEFAZ_BACKEND_URL=https://sua-api-fiscal.com
SEFAZ_BACKEND_TOKEN=token-se-usado
```

5. Cadastrar/validar certificado ativo em Homologacao.
6. Acessar SEFAZ na tela do contador.
7. Selecionar empresa e certificado.
8. Clicar em consulta DF-e.
9. Verificar se documentos retornaram em `nfe_dfe_documents`.
10. Testar download de XML somente se houver documento salvo.
11. Nao clicar em manifestar em producao sem revisao do contador.

## 23. Plano de rollback

Sem commit/push/deploy realizado neste processo.

Rollback de codigo:

- Reverter os arquivos alterados/criados desta lista no controle de versao antes de publicar.

Rollback de banco:

- Nao ha operacoes destrutivas no SQL.
- Se for necessario desfazer, pausar o uso das novas telas/endpoints e remover manualmente as tabelas `nfe_dfe_*` e bucket `nfe-dfe-xml` somente depois de exportar os dados.

## 24. Tabela de auditoria

| Requisito | Status | Arquivo ou evidencia | Risco | Proxima acao |
|---|---|---|---|---|
| Usar servico oficial `NFeDistribuicaoDFe` | Concluido | `backend/nfe-api/Services/SefazSoapClientService.cs` | Medio | Testar com certificado real em homologacao |
| Nao usar SERPRO/API paga | Concluido | Implementacao usa endpoint oficial NF-e | Baixo | Manter variaveis sem provedores pagos |
| Nao usar IA | Concluido | Nao ha chamada a modelo externo | Baixo | Nenhuma |
| Nao alterar frontend de certificado | Concluido | `SefazDfeDistributionService.cs` busca certificado existente | Medio | Validar CNPJ do certificado em ambiente real |
| Estado incremental de NSU | Concluido | `nfe_dfe_sync_states` | Medio | Rodar SQL e testar continuidade |
| Tabelas dedicadas DF-e | Concluido | `20260613_sefaz_dfe_distribution.sql` | Medio | Rodar SQL no Supabase |
| RLS por organizacao | Concluido | Policies no SQL | Alto | Confirmar funcoes `is_org_member` e `is_platform_admin` em producao |
| Bucket privado XML | Concluido | `nfe-dfe-xml` no SQL | Medio | Rodar SQL e validar acesso privado |
| Endpoint sync | Concluido | `POST /api/dfe/sync` em `Program.cs` | Medio | Testar com backend publicado |
| Endpoint status | Concluido | `GET /api/dfe/sync/status` | Baixo | Testar com token do usuario |
| Endpoint listar documentos | Concluido | `GET /api/dfe/documents` | Medio | Testar filtro por clientId |
| Endpoint baixar XML | Concluido | `GET /api/dfe/documents/{id}/xml` | Alto | Validar que outro contador nao acessa XML |
| Consulta por NSU especifico | Concluido | `POST /api/dfe/query/nsu` | Medio | Testar sem avancar sync principal |
| Consulta por chave | Concluido | `POST /api/dfe/query/access-key` | Medio | Testar chave valida |
| Manifestacao manual | Concluido | `POST /api/dfe/documents/{id}/manifest` | Alto | Testar primeiro em homologacao |
| Backoff para consumo indevido | Parcial | Tratamento de `108`, `109`, `656` | Medio | Ajustar janelas conforme retorno real |
| XML e senha fora de logs | Concluido | Logs salvam metadados apenas | Alto | Revisar logs do host em producao |
| Frontend lendo dados reais | Concluido | `sefazDocumentService.ts` usa `nfe_dfe_documents` | Medio | Rodar SQL antes de publicar |
| Proxies Vercel para backend | Concluido | `api/dfe/[...path].ts` e `api/sefaz/*` | Medio | Configurar `SEFAZ_BACKEND_URL` |
| Validacao XSD do XML retornado | Nao iniciado | Nao implementado nesta fase | Medio | Adicionar validacao se exigida |
| Job automatico de sincronizacao | Nao iniciado | Sync atual e manual | Medio | Criar agendamento backend depois |
| Testes unitarios DF-e | Concluido | `DfeXmlProcessorServiceTests.cs` | Baixo | Adicionar testes de repositorio com mock HTTP |
| Teste real SEFAZ | Nao comprovado | Nao executado por seguranca | Alto | Executar em homologacao com certificado valido |

