# Dashboard Operacional - Remodelagem 2026-06-24

## Resumo executivo

O Dashboard Geral foi remodelado para funcionar como central diaria de trabalho do contador. A tela antiga usava `getAccountingPeriod`, exibia quatro indicadores genericos e misturava o bloco "Clientes Recentes" com pagamentos. A nova versao consulta fontes reais do Supabase por `organization_id`, preserva o parametro `organization` nos links, cancela requisicoes antigas via `AbortController` e separa metricas de periodo de alertas de situacao atual.

Nao foi criada migration porque as tabelas necessarias ja existem no projeto. Foi criado um diagnostico SQL somente leitura para validar RLS, grants, indices e consistencia das fontes usadas.

## Diagnostico do Dashboard anterior

- A pagina `src/pages/dashboard/Dashboard.tsx` concentrava logica, layout e carregamento em um unico arquivo.
- Os cards eram genericos: total de clientes, receita total, clientes em dia e inadimplentes.
- O bloco "Clientes Recentes" renderizava pagamentos recentes e usava texto vazio incorreto.
- A consulta de obrigacoes usava a tabela antiga `fiscal_obligations`, enquanto o sistema atual possui `accounting_obligations` e `accounting_tax_records`.
- O filtro de periodo nao era persistido na URL.
- Nao havia central de atencao, saude de clientes, saude de integracoes, carga de equipe ou atividade recente.

## Arquitetura escolhida

- `src/services/dashboardService.ts` concentra a coleta e a composicao do resumo operacional.
- `src/utils/dashboardSeverity.ts` centraliza regras de data, vencimento, status e severidade.
- `src/types/dashboard.ts` define contratos explicitos para metricas, alertas, saude, financeiro e atividades.
- `src/components/dashboard/*` separa a UI em componentes pequenos.
- A pagina `src/pages/dashboard/Dashboard.tsx` apenas controla URL, carregamento, cancelamento e composicao.

## Fontes de dados reais usadas

- `clients`
- `client_payments`
- `accounting_obligations`
- `accounting_tax_records`
- `accounting_documents`
- `digital_certificates`
- `accounting_integrations`
- `accounting_sync_runs`
- `accounting_import_batches`
- `accounting_audit_logs`
- `fiscal_audit_logs`
- `nfe_dfe_sync_states`
- `employees`

As consultas sao limitadas, filtradas por `organization_id` e dependem das politicas RLS existentes.

## Componentes implementados

- `DashboardHeader`
- `DashboardKpiCard`
- `DashboardAttentionCenter`
- `DashboardObligationsProgress`
- `DashboardClientHealthPanel`
- `DashboardIntegrationHealthPanel`
- `DashboardFinancialSummary`
- `DashboardTeamWorkload`
- `DashboardRecentActivity`
- `DashboardEmptyState`
- `DashboardSkeleton`
- `DashboardErrorState`

## Metricas implementadas

- Clientes ativos.
- Vencem hoje.
- Em atraso.
- Aguardando cliente.
- Situacao critica.
- Obrigacoes do mes.
- Proximos vencimentos.
- Saude de clientes.
- Saude das integracoes.
- Financeiro do escritorio.
- Carga da equipe quando houver responsavel atribuido.
- Atividades recentes.

## Regras de severidade

As regras ficam em `src/utils/dashboardSeverity.ts`.

- `critical`: vencido nao concluido, certificado vencido ou em ate 7 dias, integracao com erro.
- `warning`: vencimento proximo, documento pendente, certificado em ate 30 dias.
- `success`: concluido, pago, cancelado, isento ou saudavel.
- `info`: dado operacional sem risco imediato.

## Migrations e diagnosticos

- Migration criada: nenhuma.
- Diagnostico criado: `supabase/diagnostics/20260624_accounting_operational_dashboard_diagnostic.sql`.

## Permissoes

O frontend nao usa service role. Todas as consultas dependem de sessao autenticada, `organization_id` e RLS existente. A visualizacao assistida com `organization` foi preservada na tela.

Limitacao encontrada: nao existe, no frontend atual, um modelo granular comprovado para ocultar financeiro por funcionario. O bloco financeiro usa apenas dados RLS-scoped da organizacao. Para ocultacao por cargo, sera preciso uma regra/tabela de permissao financeira especifica.

## Testes e validacoes executadas

- `npm.cmd run lint`: aprovado.
- `npm.cmd run build`: aprovado.
- `dotnet build backend\nfe-api\ContHub.NfeApi.csproj --no-restore`: aprovado.
- `dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore`: primeira tentativa bloqueada por processo `.NET Host`; segunda tentativa aprovada com 161 testes.

Nao existe script de testes frontend no `package.json`; por isso a validacao automatizada do frontend ficou em lint e build TypeScript/Vite.

## Limitacoes e pendencias reais

- Pesquisa global completa ficou limitada a clientes por razao social, nome fantasia vazio e CNPJ. Documentos, notas, protocolos e tarefas exigem motor de busca especifico ou RPC dedicada.
- Permissao financeira granular ainda precisa de modelo de permissao.
- Alguns links usam filtros via query string, mas as telas de destino precisam continuar evoluindo para consumir todos os filtros contextuais.
- O painel de equipe aparece somente quando ha funcionarios e obrigacoes atribuidas.
- O Dashboard segue mostrando alerta de fonte indisponivel se alguma tabela/migration ainda nao estiver aplicada no Supabase.

## Arquivos criados

- `src/types/dashboard.ts`
- `src/utils/dashboardSeverity.ts`
- `src/services/dashboardService.ts`
- `src/components/dashboard/DashboardAttentionCenter.tsx`
- `src/components/dashboard/DashboardClientHealth.tsx`
- `src/components/dashboard/DashboardEmptyState.tsx`
- `src/components/dashboard/DashboardErrorState.tsx`
- `src/components/dashboard/DashboardFinancialSummary.tsx`
- `src/components/dashboard/DashboardHeader.tsx`
- `src/components/dashboard/DashboardIntegrationHealth.tsx`
- `src/components/dashboard/DashboardKpiCard.tsx`
- `src/components/dashboard/DashboardObligationsProgress.tsx`
- `src/components/dashboard/DashboardRecentActivity.tsx`
- `src/components/dashboard/DashboardSkeleton.tsx`
- `src/components/dashboard/DashboardTeamWorkload.tsx`
- `supabase/diagnostics/20260624_accounting_operational_dashboard_diagnostic.sql`
- `reports/dashboard-operational-remodel-2026-06-24.md`
- `reports/dashboard-operational-manual-test-checklist-2026-06-24.md`

## Arquivos alterados

- `src/pages/dashboard/Dashboard.tsx`

## Checklist manual

O checklist manual completo esta em `reports/dashboard-operational-manual-test-checklist-2026-06-24.md`.
