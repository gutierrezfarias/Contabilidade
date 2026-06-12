# Auditoria tecnica - Modulo Fiscal

Data: 2026-06-11

Escopo auditado: modulo `/fiscal`, CRUD fiscal, regras fiscais, simulador, endpoint `/api/nfe/tax-preview`, migracao Supabase e integracao com backend .NET.

## 1. Resumo executivo

O modulo Fiscal foi implementado parcialmente. Existe uma base real com frontend, migracao SQL, tabelas planejadas, RLS, repositorios Supabase, endpoint proxy na Vercel e endpoint .NET `/api/nfe/tax-preview`.

O que esta mais maduro:
- CRUD visual e persistencia em Supabase para perfil fiscal, produtos fiscais e regras fiscais.
- Backend .NET compila e possui motor deterministico de regras fiscais.
- Endpoint `/api/nfe/tax-preview` existe e chama o motor de regras.
- Tabela NCM tem estrutura e um servico para sincronizar fonte publica do Siscomex.
- Build frontend e backend passaram.
- Testes .NET existentes passaram.

O que ainda nao esta pronto para uso fiscal seguro:
- Nao ha comprovacao de que as tabelas ja existem no Supabase remoto; ha apenas migracao local.
- O lint do frontend falha no modulo fiscal.
- Importacao/exportacao fiscal por Excel/CSV ainda nao foi implementada na tela/servico.
- Auditoria fiscal existe como tabela, mas nao ha escrita automatica nas alteracoes.
- Conflitos de regra sao detectados apenas no retorno do preview, sem persistencia/gestao completa.
- O fluxo real de emissao NF-e ainda nao foi comprovado como bloqueado quando perfil/produto/regra fiscal esta incompleto.
- O motor aplica regras cadastradas; ele nao substitui revisao fiscal/contabil nem garante conformidade tributaria por si so.

## 2. Validacoes executadas

| Comando/verificacao | Resultado |
|---|---|
| `npm.cmd run build` | Passou. Vite gerou build; alerta de chunk grande. |
| `npm.cmd run lint` | Falhou. 6 erros e 3 warnings em `FiscalModule.tsx`, `FiscalProductsPanel.tsx`, `FiscalRulesPanel.tsx`, `FiscalSimulatorPanel.tsx`. |
| `npm.cmd run test` | Falhou porque nao existe script `test` no `package.json`. |
| `dotnet build backend\nfe-api\ContHub.NfeApi.csproj --no-restore` | Passou, 0 erros, 0 warnings. |
| `dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore` | Passou: 44 testes aprovados. |
| Verificacao das migrations | Existe `supabase/migrations/20260610_fiscal_module_foundation.sql`. |
| Verificacao RLS | A migracao habilita RLS e cria policies para as tabelas fiscais. Nao foi validado contra o Supabase remoto. |
| Busca por mocks/TODOs/dados fixos | Foram encontrados textos de erro/fluxos preparados e ausencia de implementacao de importacao fiscal completa. |
| Teste somente leitura dos endpoints | Nao executado contra ambiente real porque exige backend publicado, `Authorization Bearer` e variaveis reais. Foi feita verificacao estatica das rotas. |

## 3. Matriz de requisitos

| Requisito | Status | Arquivo ou evidencia | Risco | Proxima acao |
|---|---|---|---|---|
| 1. Tabelas necessarias no Supabase | Nao comprovado | Migracao local cria tabelas em `supabase/migrations/20260610_fiscal_module_foundation.sql:32-372` | Alto: app pode falhar se a migration nao foi aplicada no Supabase remoto | Confirmar no Supabase remoto ou rodar consulta de existencia das tabelas |
| 2. Migracoes SQL criadas | Concluido | `supabase/migrations/20260610_fiscal_module_foundation.sql` | Baixo | Manter controle de versao das migrations aplicadas |
| 3. Politicas RLS | Parcial | RLS e policies em `20260610_fiscal_module_foundation.sql:461-612` | Medio: nao foi testado no banco remoto com usuarios reais | Criar testes manuais/automatizados por usuario e organizacao |
| 4. Isolamento por `organization_id` e `client_id` | Parcial | Frontend filtra por `organization_id` e `client_id` em `src/services/fiscalRepository.ts:193-330`; backend usa `EnsureOrganizationAccessAsync` | Alto: updates/deletes por id dependem de RLS; nao foi testado vazamento multiempresa | Testar acesso cruzado com dois contadores reais |
| 5. Frontend salva dados reais ou estado local/mock | Parcial | CRUD usa Supabase em `src/services/fiscalRepository.ts`; simulador chama backend em `src/services/fiscalBackendService.ts:72` | Medio: algumas areas fiscais ainda sao apenas preparatorias | Finalizar feedback, validacoes e cobrir com testes |
| 6. Endpoint `/api/nfe/tax-preview` existe no backend .NET | Concluido | `backend/nfe-api/Program.cs:373` e proxy `api/nfe/[action].ts` | Baixo | Testar em ambiente publicado com token real |
| 7. Endpoint calcula imposto real ou simulado | Parcial | `backend/nfe-api/Services/FiscalRuleEngineService.cs` calcula com regras cadastradas | Alto: calcula por regra configurada, nao por legislacao oficial completa | Definir escopo fiscal e validar regras com contador |
| 8. Motor de selecao de regras fiscais | Parcial | `FiscalRuleEngineService.cs:82-244` | Alto: `product_id/group_id` aumentam especificidade, mas nao ha correspondencia efetiva com item/produto no matcher | Ajustar modelo do item para carregar produto/grupo e revisar matcher |
| 9. Conflitos entre regras detectados | Parcial | Conflito por mesma prioridade em `FiscalRuleEngineService.cs:112-120` | Medio: nao grava em `fiscal_rule_conflicts` e nao detecta todos os tipos de conflito | Implementar detector persistente e tela de resolucao |
| 10. Emissao bloqueada se perfil/produto incompleto | Parcial | Preview bloqueia sem perfil aprovado/regra; nao ha prova de bloqueio no `/api/nfe/emitir` | Alto: emissao pode seguir sem fiscal preview obrigatorio | Integrar tax-preview como gate antes de gerar/autorizar NF-e |
| 11. Aprovacao do contador | Parcial | Campos `approval_status`; backend exige perfil `Aprovado` e regras `Aprovada` | Medio: nao ha workflow formal de aprovacao, assinatura, historico ou responsavel | Criar fluxo de aprovacao com auditoria |
| 12. Alteracoes fiscais geram auditoria | Nao iniciado | Tabela `fiscal_audit_logs` existe, mas nao foram encontradas escritas automaticas | Alto: sem trilha para mudancas fiscais | Criar triggers ou escrita obrigatoria em repository/backend |
| 13. Sincronizacao NCM oficial | Parcial | `NcmCatalogService.cs` baixa de `portalunico.siscomex.gov.br` e grava `ncm_catalog` | Medio: nao ha agendamento, validacao de fonte/assinatura ou teste live nesta auditoria | Criar job controlado e validacao de versao |
| 14. Importacao/exportacao Excel e CSV | Nao iniciado | Migracao tem tabelas de importacao, mas nao ha tela fiscal ou parser fiscal | Alto: requisito funcional ausente | Implementar importador/exportador fiscal |
| 15. Modelos de planilhas para download | Nao iniciado | Nenhum componente fiscal de modelo encontrado | Medio | Criar templates CSV/XLSX por entidade fiscal |
| 16. Previa da importacao | Nao iniciado | Sem tela/servico fiscal de preview | Alto | Criar fluxo validar sem salvar |
| 17. Validacao linha por linha | Nao iniciado | Apenas tabelas `fiscal_import_job_rows`; sem validador fiscal | Alto | Implementar validador por linha e resumo de erros |
| 18. Mapeamento de colunas de outros sistemas | Parcial | Tabela `fiscal_import_mapping_templates` existe | Medio | Criar CRUD de templates e mapeador |
| 19. Historico das importacoes | Parcial | Tabelas `fiscal_import_jobs` e `fiscal_import_job_rows` existem | Medio | Conectar frontend/backend e gravar execucoes |
| 20. Bloqueio de formulas, macros e CSV Injection | Nao iniciado | Nenhuma regra encontrada para `HYPERLINK`, formulas, DDE ou macros no fluxo fiscal | Alto: risco de seguranca em export/import | Sanitizar entradas/exportacoes e rejeitar formulas perigosas |
| 21. Dependencias e licencas | Parcial | `package.json`, `package-lock.json`, `.csproj` | Medio: node-forge tem licenca dupla `(BSD-3-Clause OR GPL-2.0)`; precisa escolha/registro | Registrar licencas e revisar compliance |
| 22. Testes unitarios e integracao | Parcial | 44 testes .NET passam; frontend nao tem script de teste | Medio | Adicionar testes frontend e testes de integracao fiscal |
| 23. Interferencia no fluxo existente de NF-e | Nao comprovado | Build passa; alteracoes em `Sefaz.tsx`, `NfeEmissionForm.tsx`, backend e proxies | Alto: sem teste E2E, nao ha garantia de nao regressao | Criar testes E2E para consulta, preview, geracao e emissao |

## 4. O que realmente funciona

- A rota `/fiscal` existe em `src/routes/AppRoutes.tsx:91`.
- O menu aponta para `/fiscal` em `src/components/layout/DashboardLayout.tsx:72`.
- Perfil fiscal, produtos fiscais e regras fiscais possuem servico Supabase em `src/services/fiscalRepository.ts`.
- O simulador fiscal chama `/api/nfe/tax-preview` por `src/services/fiscalBackendService.ts:72`.
- O proxy Vercel aceita `tax-preview` em `api/nfe/[action].ts`.
- O backend .NET tem endpoint `POST /api/nfe/tax-preview` em `backend/nfe-api/Program.cs:373`.
- O backend autentica por Bearer e valida acesso de organizacao antes do preview fiscal.
- O backend aplica regras aprovadas e retorna erros quando nao ha perfil aprovado ou regra aplicavel.
- Backend .NET compila e os testes existentes passam.

## 5. O que esta apenas visual ou preparatorio

- Importacao fiscal universal: ha tabelas, mas nao ha fluxo visual completo.
- Historico de importacao fiscal: tabelas existem, mas sem uso comprovado.
- Auditoria fiscal: tabela existe, mas sem eventos gravados automaticamente.
- Aprovacao do contador: existe campo/status, mas nao workflow formal.
- Sincronizacao NCM: servico existe, mas sem job agendado/teste live nesta auditoria.
- Bloqueio fiscal na emissao real: o preview existe, mas nao foi comprovado como etapa obrigatoria antes de autorizar NF-e.

## 6. O que esta incompleto

- Resolver lint do frontend fiscal.
- Garantir que `product_id` e `group_id` participem de fato da selecao de regra.
- Gravar conflitos em `fiscal_rule_conflicts`.
- Gravar auditoria em `fiscal_audit_logs`.
- Criar importacao/exportacao fiscal com preview, validacao linha a linha e historico.
- Bloquear formulas, macros e CSV Injection.
- Criar testes frontend e testes E2E de fluxo NF-e + fiscal.
- Confirmar migrations aplicadas no Supabase remoto.

## 7. O que nao foi implementado

- Importacao Excel/XLSX fiscal.
- Exportacao Excel/XLSX fiscal.
- Modelos de planilha fiscal para download.
- Mapeador visual de colunas por sistema externo.
- Previa de importacao fiscal antes de salvar.
- Historico operacional de importacoes exibido no frontend.
- Sanitizacao contra CSV Injection/macros.
- Testes de isolamento multiempresa com usuarios reais.
- Motor fiscal completo de legislacao brasileira. O atual e um motor de regras configuraveis.

## 8. Riscos fiscais

- O calculo tributario depende 100% das regras cadastradas; regra errada gera NF-e errada.
- Nao ha validacao fiscal ampla de CST/CSOSN/CFOP/NCM por UF/regime.
- Nao ha garantia de que emissao real chama obrigatoriamente o preview fiscal.
- Falta workflow de aprovacao com responsavel e historico.
- Falta historico/auditoria de mudancas de regra.

## 9. Riscos de seguranca

- Importacao fiscal ainda nao bloqueia formulas maliciosas, macros ou CSV Injection.
- Dependencia `node-forge` possui licenca dupla `(BSD-3-Clause OR GPL-2.0)`; precisa registrar escolha/compliance.
- Endpoints fiscais dependem de `SEFAZ_BACKEND_URL` e `Authorization Bearer`; teste live nao foi executado nesta auditoria.
- Uso de service role no backend exige host seguro, logs sem segredo e controle de acesso.

## 10. Riscos multiempresa

- Existe filtro por `organization_id/client_id`, mas ainda falta teste real com duas organizacoes.
- Alguns updates/deletes no frontend usam apenas `id`; a protecao depende de RLS no Supabase remoto.
- Backend valida acesso por organizacao, mas a prova completa exige teste com tokens de usuarios diferentes.

## 11. Dependencias e licencas principais

Frontend direto (`package-lock.json`):
- MIT: React, React DOM, React Router DOM, Vite, Tailwind, Supabase JS, ESLint, xml-crypto, xmldom.
- Apache-2.0: TypeScript, pdf-parse, pdfjs-dist, tesseract.js.
- `(BSD-3-Clause OR GPL-2.0)`: node-forge.

Backend .NET:
- `System.Security.Cryptography.Xml` 10.0.8.
- Testes: `xunit`, `xunit.runner.visualstudio`, `Microsoft.NET.Test.Sdk`, `Microsoft.Extensions.Configuration`.

## 12. Arquivos criados ou modificados relacionados

Arquivos fiscais/relevantes observados no `git status`:
- `supabase/migrations/20260610_fiscal_module_foundation.sql`
- `src/pages/accounting/FiscalModule.tsx`
- `src/components/fiscal/FiscalProductsPanel.tsx`
- `src/components/fiscal/FiscalRulesPanel.tsx`
- `src/components/fiscal/FiscalSimulatorPanel.tsx`
- `src/services/fiscalRepository.ts`
- `src/services/fiscalBackendService.ts`
- `src/types/fiscal.ts`
- `api/_utils/nfeBackendProxy.ts`
- `api/nfe/[action].ts`
- `api/reference-data/ncm/[action].ts`
- `backend/nfe-api/Models/FiscalModels.cs`
- `backend/nfe-api/Services/FiscalRuleEngineService.cs`
- `backend/nfe-api/Services/NcmCatalogService.cs`
- `backend/nfe-api/Services/SupabaseFiscalRepository.cs`
- `backend/nfe-api/Program.cs`
- `backend/nfe-api.tests/NfeXmlBuilderServiceTests.cs`

Observacao: o worktree ja possui varias alteracoes nao commitadas alem do modulo fiscal.

## 13. Proxima fase recomendada

### Fase 1 - Fechar fundacao e confiabilidade
- Confirmar aplicacao da migration no Supabase remoto.
- Testar RLS com dois usuarios/organizacoes.
- Corrigir lint do modulo fiscal.
- Criar checklist de dados obrigatorios por perfil/produto/regra.

### Fase 2 - Tornar o motor fiscal bloqueante
- Integrar `/api/nfe/tax-preview` ao fluxo de emissao.
- Bloquear emissao sem perfil aprovado, produto fiscal completo e regra aplicavel.
- Corrigir matching por produto/grupo.
- Persistir conflitos e auditoria.

### Fase 3 - Importacao/exportacao fiscal
- Criar modelos CSV/XLSX.
- Criar importador com preview.
- Validar linha por linha.
- Criar mapeamento de colunas por origem.
- Bloquear formulas/macros/CSV Injection.
- Gravar historico de importacao.

### Fase 4 - Governanca fiscal
- Workflow de aprovacao pelo contador.
- Auditoria com antes/depois.
- Relatorio de regras ativas por cliente.
- Alertas para NCM/regra vencida.

### Fase 5 - Testes e liberacao
- Testes unitarios frontend.
- Testes de integracao backend + Supabase.
- Testes E2E do fluxo NF-e.
- Teste live somente leitura dos endpoints com backend publicado.
