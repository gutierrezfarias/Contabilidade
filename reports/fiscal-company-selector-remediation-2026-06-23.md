# Remediacao - Seletor de Empresa na Configuracao Fiscal

Data: 2026-06-23

## Resumo executivo

Foi implementado um seletor obrigatorio de empresa emissora na tela de Configuracao Fiscal, com exibicao permanente dos dados da empresa ativa e bloqueio das etapas fiscais sensiveis enquanto nenhuma empresa estiver selecionada.

A tela agora preserva o parametro `organization` da URL, usa `clientId` para identificar a empresa emissora, limpa dados visuais ao trocar de empresa e ignora respostas assincronas atrasadas para evitar mistura de dados entre empresas.

Tambem foi adicionada uma visao fiscal resumida por cliente na Gestao de Clientes, sem misturar dados globais com dados por empresa.

## Origem do problema

A jornada fiscal carregava dados vinculados a empresa, mas a tela nao deixava claro qual empresa estava sendo configurada. Em um escritorio com varios clientes, isso criava risco operacional de salvar perfil, produtos, regras ou simulacoes no contexto errado.

Outro ponto de risco era a troca rapida de empresas: respostas antigas de chamadas assincronas poderiam voltar depois da troca e sobrescrever dados da nova empresa selecionada.

## Solucao implementada

- Adicionado seletor obrigatorio de empresa emissora no topo da Configuracao Fiscal.
- Removida a selecao automatica da primeira empresa da lista.
- Mantido o parametro `organization` existente na URL.
- Adicionado `clientId` na URL para representar a empresa emissora selecionada.
- Bloqueadas as etapas `Perfil fiscal`, `Produtos e servicos`, `Regras fiscais` e `Simulador` sem empresa selecionada.
- Mantida a etapa `Catalogo NCM` como global.
- Dados visuais da empresa anterior sao limpos imediatamente ao trocar de empresa.
- Chamadas assincronas usam controle de requisicao para ignorar respostas atrasadas.
- Acoes fiscais criticas exigem confirmacao com o nome da empresa ativa.
- Produtos, regras, perfil, simulacao e resumo de prontidao usam sempre `organizationId` e `clientId`.
- Gestao de Clientes passou a exibir resumo fiscal por empresa.

## Arquivos alterados

- `src/pages/accounting/FiscalModule.tsx`
- `src/components/fiscal/FiscalProductsPanel.tsx`
- `src/components/fiscal/FiscalRulesPanel.tsx`
- `src/components/fiscal/FiscalSimulatorPanel.tsx`
- `src/pages/accounting/ClientManagement.tsx`
- `backend/nfe-api/Models/FiscalModels.cs`
- `backend/nfe-api/Services/SupabaseFiscalRepository.cs`
- `backend/nfe-api/Services/FiscalRuleEngineService.cs`
- `backend/nfe-api.tests/FiscalReadinessNcmEnrichmentTests.cs`
- `supabase/migrations/20260623_fiscal_audit_completion.sql`
- `supabase/diagnostics/20260623_fiscal_audit_completion_diagnostic.sql`
- `reports/fiscal-company-selector-remediation-2026-06-23.md`

## Evidencias tecnicas

- O seletor principal foi criado em `FiscalModule.tsx` com `id="fiscal-company-selector"`.
- A URL preserva `organization` e atualiza `clientId` ao trocar empresa.
- `FiscalModule.tsx`, `FiscalProductsPanel.tsx`, `FiscalRulesPanel.tsx` e `FiscalSimulatorPanel.tsx` usam refs de requisicao para evitar sobrescrita por respostas atrasadas.
- `FiscalProductsPanel.tsx`, `FiscalRulesPanel.tsx` e `FiscalSimulatorPanel.tsx` validam `organizationId` e `clientId` antes de salvar, excluir, aprovar, rejeitar ou simular.
- `ClientManagement.tsx` calcula resumo fiscal por cliente usando perfil, produtos, regras e certificados daquela empresa.

## Auditoria fiscal concluida

Foi implementada a pendencia de auditoria completa reaproveitando a tabela existente `public.fiscal_audit_logs`, sem criar tabela duplicada.

Migration:

- `supabase/migrations/20260623_fiscal_audit_completion.sql`

Diagnostico somente leitura:

- `supabase/diagnostics/20260623_fiscal_audit_completion_diagnostic.sql`

O que a migration adiciona ou corrige:

- Colunas `changed_fields` e `correlation_id` em `fiscal_audit_logs`.
- Funcao de saneamento `cont_hub_sanitize_fiscal_audit_data`.
- Funcao de diff `cont_hub_jsonb_changed_fields`.
- Trigger de integridade `fiscal_audit_logs_integrity_trigger`.
- Trigger fiscal completo para perfil, produtos, grupos, operacoes, beneficios, CFOPs, regras, versoes, conflitos e simulacoes.
- RPCs de aprovacao/rejeicao ajustadas para usar contexto de auditoria por trigger, evitando duplicidade.
- Revogacao de escrita direta em `fiscal_audit_logs` para `authenticated`.
- Remocao de acesso `anon`.
- `authenticated` fica somente com `SELECT` protegido por RLS.
- `service_role` e `postgres` mantem administracao.

O backend tambem passou a registrar auditoria segura das simulacoes fiscais do endpoint `/api/nfe/tax-preview`, sem gravar XML, certificado, senha, PFX/P12, token ou itens completos.

## Testes criados

Foram adicionados testes estaticos no backend para validar a presenca das protecoes no frontend e no fluxo fiscal:

- Seletor explicito de empresa e preservacao de contexto na URL.
- Troca de empresa limpando dados e ignorando respostas antigas.
- Bloqueio de operacoes sem empresa selecionada.
- Confirmacao de acoes criticas com empresa ativa.
- Catalogo NCM global sem duplicacao por empresa.
- Escopo por `organizationId` e `clientId` no backend de `tax-preview`.
- Resumo fiscal por cliente na Gestao de Clientes.
- Auditoria reaproveitando `fiscal_audit_logs`, sem tabela duplicada.
- Registro de `old_data`, `new_data`, `changed_fields`, `origin` e `correlation_id`.
- Saneamento de segredos, tokens, PFX/P12 e XML.
- Reducao de privilegios da auditoria.
- Cobertura de triggers fiscais e simulacao no backend.

Arquivo:

- `backend/nfe-api.tests/FiscalReadinessNcmEnrichmentTests.cs`

## Resultados de validacao

- `npm.cmd run lint`: aprovado.
- `npm.cmd run build`: aprovado.
- `dotnet build backend\nfe-api\ContHub.NfeApi.csproj --no-restore`: aprovado.
- `dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore`: aprovado.
- Busca por `any`, `@ts-ignore` e `@ts-nocheck` nos arquivos alterados: sem ocorrencias.

Observacao: o build do Vite manteve alerta de chunk grande, mas sem falha de compilacao.

## Checklist manual recomendado

1. Acessar `/fiscal` sem `clientId` e confirmar que as etapas sensiveis ficam bloqueadas.
2. Selecionar uma empresa e confirmar que os dados da empresa aparecem no topo.
3. Trocar de empresa e verificar se perfil, produtos, regras e simulador recarregam.
4. Alterar rapidamente entre duas empresas e confirmar que dados nao se misturam.
5. Verificar se a URL mantem `organization` e muda apenas o `clientId`.
6. Confirmar que o Catalogo NCM continua acessivel como dado global.
7. Abrir Gestao de Clientes e conferir o resumo fiscal de cada cliente.
8. Tentar salvar produto/regra/perfil sem empresa selecionada e confirmar bloqueio.
9. Conferir em mobile se o seletor continua visivel e utilizavel.

## SQL para executar no Supabase

Execute primeiro:

1. `supabase/migrations/20260623_fiscal_audit_completion.sql`

Depois, para validar:

2. `supabase/diagnostics/20260623_fiscal_audit_completion_diagnostic.sql`

## Riscos e pendencias

- `Nome fantasia` aparece como `Nao informado` quando o cadastro do cliente nao possui esse campo estruturado.
- A validacao visual de responsividade foi coberta por estrutura e build, mas ainda precisa ser conferida manualmente em navegador/dispositivo.
- O isolamento definitivo continua dependendo de RLS correta no Supabase e validacao no backend; a tela agora reduz risco operacional, mas nao substitui politicas de banco.
- A migration nao foi executada no Supabase por restricao desta tarefa.

## Proxima fase recomendada

Executar a migration de auditoria no Supabase, rodar o diagnostico e validar manualmente um fluxo completo: criar perfil, alterar produto, aprovar regra, simular impostos e conferir os registros em `fiscal_audit_logs`.
