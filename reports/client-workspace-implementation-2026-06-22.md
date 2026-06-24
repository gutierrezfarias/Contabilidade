# Area Individual do Cliente - Implementacao

Data: 2026-06-22

## Resumo executivo

Foi criada a area individual do cliente em `/gestao-clientes/:clientId`, dentro do mesmo bloco protegido do Sistema Gestao Contabil. A tela preserva `?organization=...`, carrega o cliente pela URL e usa apenas dados reais das fontes existentes no frontend/Supabase/API atual.

Nao foram criadas migrations, nao houve commit, push, deploy, alteracao de credenciais, variaveis de ambiente ou mudanca interna nas paginas GOV.

## Rota criada

- `/gestao-clientes/:clientId`

Protecao herdada:

- `ProtectedRoute`
- `PaidAppRoute applicationId="gestao-contabil"`
- `AccountingClientAreaRoute`
- RLS e isolamento por `organization_id` continuam dependentes das queries existentes.

## Fluxo implementado

- Na lista de clientes, o nome do cliente agora e clicavel.
- A lista ganhou a acao `Abrir`.
- A nova rota suporta atualizacao direta do navegador porque o cliente e resolvido por `clientId` da URL.
- O botao `Voltar a lista` preserva os parametros da URL.
- O botao `Editar cadastro` volta para `Gestao de Clientes` usando `?editClient=<id>` e abre o formulario existente.

## Abas implementadas

- Dashboard
- Cadastro
- Fiscal
- Obrigacoes e Impostos
- Financeiro
- Documentos
- Certificados
- Integracoes
- Historico

As abas usam `?tab=...` na URL, sao botoes acessiveis e possuem rolagem horizontal em telas pequenas.

## Fontes de dados usadas

| Area | Fonte real | Observacao |
|---|---|---|
| Cliente | `listAccountingClients` / tabela `clients` | Filtra pelo `clientId` aberto e `organization_id` resolvido. |
| Pagamentos | `listClientPayments` / tabela `client_payments` | Carrega o periodo atual e filtra pelo cliente. |
| Documentos do cadastro | `listClientDocuments` / tabela `client_documents` | Mostra documentos vinculados ao cadastro/importacao por documento. |
| Documentos contabeis | `listAccountingDocuments` / tabela `accounting_documents` | Usa pagina 1 e total real da query. |
| Certificados | `listCertificates` / tabela `digital_certificates` | Mostra metadados, status, arquivo e senha apenas como “cadastrada”. |
| Servicos do certificado | `listCertificateServices` / tabela `certificate_services` | Conta servicos habilitados por certificado. |
| Fiscal | `getFiscalCompanyProfile`, `listFiscalProducts`, `listFiscalRules` | Mostra perfil, produtos e regras existentes. |
| Obrigacoes | `listObligations` / `accounting_obligations` | Mostra total, registros recentes e contagens por status quando a fonte responde. |
| Impostos | `listTaxes` / `accounting_tax_records` | Mostra total, registros recentes e contagens por status quando a fonte responde. |
| Integracoes | `listAccountingIntegrations`, `listIntegrationClients` | Mostra integracoes e vinculo do cliente quando API responde. |

## Cards implementados

| Card | Fonte |
|---|---|
| Situacao cadastral | `clients.active` |
| Regime tributario | `clients.tax_regime` |
| Mensalidade contabil | `clients.is_monthly`, `clients.monthly_fee` |
| Pagamentos no periodo | `client_payments` do mes/ano atual |
| Certificado digital | `digital_certificates.status` |
| Validade certificado | `digital_certificates.valid_until` |
| Obrigacoes pendentes | `accounting_obligations` por status |
| Obrigacoes vencidas | `accounting_obligations` por status |
| Impostos pendentes | `accounting_tax_records` por status |
| Impostos vencidos | `accounting_tax_records` por status |
| Documentos contabeis | `accounting_documents` total real |
| Documentos pendentes | `accounting_documents.approval_status = pending` |
| Perfil fiscal | `fiscal_company_profiles.approval_status` |

Quando a fonte falha, a tela mostra `Nao consultado` ou alerta informando a fonte com erro. Ela nao transforma erro em zero.

## Cards omitidos por falta de fonte consolidada

- Nome fantasia: o tipo `AccountingClient` atual nao possui campo especifico.
- Ultima sincronizacao SEFAZ por cliente: nao ha fonte unica consolidada nesta tela.
- Ultima sincronizacao e-CAC por cliente: nao ha fonte unica consolidada nesta tela.
- Historico/auditoria consolidada: ainda nao existe fonte unica por cliente no frontend atual.
- Status detalhado de todos os provedores externos: exibido apenas quando as APIs de integracao atuais respondem.

## Funcionalidades existentes reutilizadas

- Formulario atual de cadastro/edicao de clientes.
- Validacoes, mascaras, ViaCEP e upload de logo do cadastro atual.
- Fluxo atual de documentos do cliente.
- Fluxo atual de certificados PFX/P12, senha, status e servicos.
- Fluxo atual de pagamentos.
- Modulos Fiscal, Obrigacoes/Impostos e Integracoes por links preservando `organization` e `clientId`.

## Paginas GOV preservadas

Nao foram alteradas internamente:

- SEFAZ
- e-CAC
- Receita Federal
- APIs, logs, certificados, senha, PFX/P12 e contratos de backend

A area individual apenas cria atalhos seguros para as rotas existentes.

## Arquivos alterados/criados

- `src/pages/accounting/ClientWorkspace.tsx`
- `src/routes/AppRoutes.tsx`
- `src/pages/accounting/ClientManagement.tsx`

Ja existiam alteracoes anteriores desta fase em:

- `src/components/layout/DashboardLayout.tsx`
- `reports/cont-hub-ui-remodel-audit-and-implementation-2026-06-22.md`
- `reports/cont-hub-ui-remodel-manual-test-checklist-2026-06-22.md`

## Validacoes executadas

| Comando | Resultado |
|---|---|
| `npm.cmd run lint` | Passou |
| `npm.cmd run build` | Passou, com aviso conhecido de chunk grande do Vite |
| `dotnet build backend\nfe-api\ContHub.NfeApi.csproj -c Release --no-restore` | Passou |
| `dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore` | Passou: 136 testes |

## Regressao

- A rota `/gestao-clientes` continua existindo.
- Cadastro, importacao por documento, CSV, documentos e certificados continuam no fluxo atual.
- O formulario nao foi duplicado dentro da nova tela.
- O menu lateral continua reconhecendo `/gestao-clientes/:clientId` como grupo Clientes.
- Nenhuma migration foi criada ou executada.
- Nenhum backend foi alterado.

## Riscos e limites conhecidos

- A aba Cadastro e somente leitura; a edicao volta ao formulario atual para evitar duplicidade de logica.
- Financeiro mostra o periodo atual carregado. Periodos historicos continuam na tela financeira existente.
- Documentos mostra uma pagina resumida; gestao completa continua no modulo de documentos.
- Historico usa registros reais disponiveis, mas ainda nao ha auditoria consolidada por cliente.
- Links para Fiscal/Obrigacoes/Integracoes carregam `clientId` na query; o filtro efetivo depende do suporte de cada pagina existente.

## Proxima fase recomendada

1. Extrair o formulario de cliente para componente reutilizavel, se quiser edicao inline dentro da area individual.
2. Padronizar `clientId` como filtro aceito nas telas Fiscal, Obrigacoes, Integracoes, SEFAZ e e-CAC.
3. Criar fonte consolidada de auditoria por cliente.
4. Adicionar testes frontend quando houver infraestrutura de teste para React.
