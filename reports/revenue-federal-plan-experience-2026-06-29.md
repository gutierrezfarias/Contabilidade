# Remodelagem Receita Federal / SERPRO

Data: 2026-06-29

## Resumo

A tela Receita Federal foi reorganizada em uma jornada guiada por plano. Os fluxos existentes de contrato CONT HUB, credencial direta SERPRO, carteira, servicos, autorizacoes, consumo e importacao manual foram preservados e separados em seis abas.

Nenhuma API externa nova foi inventada. Servicos sem provider real continuam identificados como indisponiveis ou em preparacao.

## Abas implementadas

1. Plano e contrato
2. Credenciais e acesso
3. Servicos
4. Importacao manual
5. Autorizacoes e procuracoes
6. Consumo e auditoria

## Decisoes de arquitetura

- Reutilizadas as tabelas `serpro_organization_settings`, `serpro_service_catalog`, `serpro_organization_services`, `serpro_client_authorizations`, `serpro_wallets`, `serpro_wallet_transactions`, `serpro_requests`, `serpro_usage_records`, `serpro_audit_logs` e as tabelas de importacao manual.
- Criada apenas a camada comercial de planos e o estado do agente local.
- `manual_free` foi preservado como origem de importacao, mas deixou de ser tratado como plano principal.
- O plano selecionado controla `access_mode`, `billing_mode`, ambientes, fallback e compatibilidade dos servicos no backend.
- Chave de pareamento do agente local: o valor completo volta uma unica vez; o banco recebe apenas hash, prefixo e validade.
- Consumer Secret continua protegido pelo fluxo existente e nao aparece em listagens ou auditoria.
- A tela de autorizacoes usa os dados atuais. Nao foi criado CRUD ficticio nem automacao externa para procuracoes.

## Banco e seguranca

Migration:

`supabase/migrations/20260629_revenue_federal_plan_experience.sql`

Diagnostico somente leitura:

`supabase/diagnostics/20260629_revenue_federal_plan_experience_diagnostic.sql`

A migration:

- cria `serpro_contract_plans`;
- cria `serpro_local_agents`;
- adiciona `plan_code` por organizacao;
- adiciona compatibilidade local/manual e consumo de credito ao catalogo;
- complementa autorizacoes com certificado, ultima validacao e pendencia;
- adiciona `local_agent` aos modos permitidos;
- aplica RLS por organizacao;
- remove acesso de `anon`;
- deixa `authenticated` somente com leitura das novas tabelas;
- preserva escrita administrativa/backend para `service_role` e `postgres`;
- cria os tres planos iniciais com valores editaveis no Admin.

## Backend e endpoints

Adicionados:

- `GET /api/admin/serpro/plans`
- `PUT /api/admin/serpro/plans/{planCode}`
- `POST /api/serpro/local-agent/pairing-key`

O retorno de `GET /api/serpro/settings` agora inclui planos, agente local, transacoes, consumo, requisicoes, auditoria e historico de importacoes.

O backend valida plano ativo, ambiente permitido e compatibilidade de servico antes de salvar.

## Frontend

Principais arquivos:

- `src/pages/accounting/settings/RevenueFederalSettings.tsx`
- `src/pages/admin/AdminSerpro.tsx`
- `src/components/admin/AdminSerproPlansPanel.tsx`
- `src/components/revenue-federal/ReceitaFederalTabs.tsx`
- `src/components/revenue-federal/ContractPlanCard.tsx`
- `src/components/revenue-federal/CredentialsPanel.tsx`
- `src/components/revenue-federal/LocalAgentPanel.tsx`
- `src/components/revenue-federal/RevenueServicesPanel.tsx`
- `src/components/revenue-federal/ManualImportPanel.tsx`
- `src/components/revenue-federal/AuthorizationsPanel.tsx`
- `src/components/revenue-federal/ConsumptionAuditPanel.tsx`
- `src/utils/serproRecords.ts`

## Testes

Criado `backend/nfe-api.tests/RevenueFederalPlanExperienceTests.cs` e ampliado `SerproDomainRulesTests.cs`.

Resultados:

- `npm.cmd run lint`: aprovado.
- `npm.cmd run build`: aprovado; permanece aviso de chunk Vite acima de 500 kB.
- `dotnet build backend\nfe-api\ContHub.NfeApi.csproj --no-restore`: aprovado, zero erros.
- `dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore`: aprovado, 167 testes.
- Busca por `any`, `@ts-ignore`, `@ts-nocheck`, mocks e TODOs nos novos arquivos: sem ocorrencias.

## Ordem para ativacao

1. Executar `supabase/migrations/20260629_revenue_federal_plan_experience.sql` no Supabase.
2. Executar o diagnostico somente leitura.
3. Conferir os valores e servicos em Admin > Serpro.
4. Validar um escritorio de cada plano em homologacao.
5. Somente depois realizar deploy.

## Pendencias honestas

- O instalador do agente local ainda nao existe. O Admin pode cadastrar a URL quando o artefato estiver disponivel.
- O heartbeat/sincronizacao do agente local depende da futura aplicacao local; nesta entrega foi implementado cadastro, pareamento seguro e apresentacao de status.
- O provider oficial SERPRO real continua dependendo do contrato, credenciais e implementacao de chamada oficial ja apontada pelo backend existente.
- Edicao completa de procuracoes depende de backend oficial; a aba atual apenas organiza os dados existentes e direciona para clientes/certificados.
- E necessario teste manual responsivo e autenticado depois da migration.

Nenhum commit, push, deploy ou SQL remoto foi executado.
