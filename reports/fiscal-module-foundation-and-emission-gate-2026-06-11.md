# Fiscal Module - Foundation e Emission Gate

Data: 2026-06-11  
Escopo executado: fases 1 e 2 solicitadas. Não inclui Excel/CSV, IA, SERPRO, API paga ou emissão real em teste.

## 1. Resumo executivo

Foi implementado o bloqueio fiscal obrigatório antes da NF-e real avançar para geração de XML, assinatura ou transmissão.

O frontend continua com preview/simulador, mas o backend deixou de confiar no preview visual: a API recalcula as regras fiscais no momento crítico e bloqueia a emissão se houver perfil, produto, regra, conflito ou vigência pendente.

Também foram criados SQL incremental, diagnóstico de schema, roteiro de teste RLS, auditoria fiscal, conflitos persistidos, aprovação/rejeição formal e exclusão lógica de produtos/regras fiscais.

## 2. O que realmente funciona

| Requisito | Status | Evidência | Risco | Próxima ação |
|---|---:|---|---|---|
| Migration incremental fiscal | Concluído local | `supabase/migrations/20260611_fiscal_gate_audit_conflicts.sql` | Precisa rodar no Supabase | Executar no SQL Editor |
| Diagnóstico das tabelas fiscais | Concluído local | `supabase/diagnostics/20260611_fiscal_schema_diagnostic.sql` | Não valida remoto automaticamente | Rodar diagnóstico no Supabase |
| Roteiro RLS multiempresa | Parcial | `supabase/tests/20260611_fiscal_rls_isolation_tests.sql` | Teste é manual/remoto | Rodar com usuários A/B |
| Gate obrigatório na NF-e | Concluído | `backend/nfe-api/Services/NfeAuthorizationService.cs` | Depende da migration estar aplicada | Rodar migration antes do deploy |
| Motor fiscal com matching ordenado | Concluído | `backend/nfe-api/Services/FiscalRuleEngineService.cs` | Regras reais precisam ser cadastradas | Popular perfil/produtos/regras |
| Bloqueio estruturado | Concluído | `FiscalBlockError` em `backend/nfe-api/Models/FiscalModels.cs` | Front pode melhorar visual desses erros | Exibir campo/ação no formulário |
| Conflitos persistidos | Concluído | `SaveFiscalConflictAsync` | Depende de tabela/colunas novas | Rodar migration |
| Auditoria de bloqueio | Concluído | `SaveBlockAuditAsync` | Auditoria DB depende de trigger/migration | Rodar migration |
| Aprovação formal perfil/regra | Concluído local | RPCs SQL + funções frontend | Depende de migration aplicada | Testar no Supabase |
| Exclusão lógica fiscal | Concluído | `deleteFiscalProduct`/`deleteFiscalRule` agora fazem `active=false` | Nome da função ainda diz delete | Renomear em fase futura |
| Lint frontend | Concluído | `npm.cmd run lint` passou | Nenhum | Manter no deploy |
| Build frontend | Concluído | `npm.cmd run build` passou | Warning de bundle grande | Code splitting futuro |
| Build backend .NET | Concluído | `dotnet build ... --no-restore` passou | Nenhum | Deploy backend |
| Testes backend existentes | Concluído | `dotnet test ... --no-restore` passou 44/44 | Não cobre todos os novos cenários fiscais | Criar suíte dedicada |

## 3. O que está apenas visual

- O simulador fiscal continua sendo tela de apoio, mas agora o backend recalcula no gate real.
- O painel de aprovação/rejeição existe na UI, porém só funcionará após rodar a migration com as RPCs.
- O roteiro RLS foi criado, mas precisa ser executado no Supabase com usuários reais de organizações diferentes.

## 4. O que está incompleto

- Não foi criado teste automatizado específico para todos os cenários fiscais bloqueantes.
- Não foi feita verificação remota do Supabase, porque a execução local não possui conexão SQL direta autenticada para inspecionar o banco de produção.
- A resolução/ignorar conflito existe no schema, mas ainda não recebeu tela administrativa completa.
- O frontend ainda pode melhorar a exibição dos `FiscalBlockError` por campo/produto.

## 5. O que não foi implementado

- Excel/CSV, importação, exportação, prévia de importação e mapeamento de colunas.
- Sincronização completa/automática da tabela NCM oficial além do que já existia.
- Integração paga SERPRO/terceiros.
- Emissão real de NF-e em testes.
- Qualquer simulação de SEFAZ em modo real.

## 6. Riscos fiscais

- O sistema agora bloqueia emissão quando não existe regra aprovada, mas a qualidade fiscal depende do contador configurar CFOP, CST/CSOSN, NCM, CEST e alíquotas corretamente.
- Algumas validações são conservadoras. Pode existir operação legal com alíquota zero que exija ajuste fino por regra.
- O backend não inventa tributação. Se faltar regra, bloqueia.

## 7. Riscos de segurança

- O backend não grava certificado, senha ou XML em auditoria fiscal.
- O gate usa `Authorization Bearer` e valida organização via backend antes de acessar dados.
- A aplicação ainda depende de aplicar corretamente as policies/RLS no Supabase remoto.

## 8. Riscos multiempresa

- O backend valida `organizationId` pelo usuário antes de calcular preview/gate.
- As tabelas fiscais base possuem RLS na migration anterior.
- O teste de isolamento multiempresa foi entregue como SQL manual, mas ainda precisa ser executado em ambiente real.

## 9. Arquivos criados ou modificados nesta fase

Criados:

- `supabase/migrations/20260611_fiscal_gate_audit_conflicts.sql`
- `supabase/diagnostics/20260611_fiscal_schema_diagnostic.sql`
- `supabase/tests/20260611_fiscal_rls_isolation_tests.sql`
- `src/utils/fiscalValidators.ts`
- `reports/fiscal-module-foundation-and-emission-gate-2026-06-11.md`

Modificados:

- `backend/nfe-api/Models/FiscalModels.cs`
- `backend/nfe-api/Models/NfeModels.cs`
- `backend/nfe-api/Services/FiscalRuleEngineService.cs`
- `backend/nfe-api/Services/NfeAuthorizationService.cs`
- `backend/nfe-api/Services/SupabaseFiscalRepository.cs`
- `backend/nfe-api/Services/SupabaseNfeRepository.cs`
- `src/types/fiscal.ts`
- `src/types/nfeEmission.ts`
- `src/services/fiscalRepository.ts`
- `src/components/fiscal/FiscalProductsPanel.tsx`
- `src/components/fiscal/FiscalRulesPanel.tsx`
- `src/components/fiscal/FiscalSimulatorPanel.tsx`
- `src/pages/accounting/FiscalModule.tsx`

## 10. Comandos executados

```powershell
npm.cmd run lint
npm.cmd run build
dotnet build backend\nfe-api\ContHub.NfeApi.csproj --no-restore
dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore
```

Resultado:

- Lint: passou.
- Frontend build: passou.
- Backend build: passou.
- Backend tests: 44 testes passaram.
- Frontend não possui script `test` no `package.json`.

## 11. SQL que precisa rodar no Supabase

Rodar:

```text
supabase/migrations/20260611_fiscal_gate_audit_conflicts.sql
```

Depois rodar diagnóstico:

```text
supabase/diagnostics/20260611_fiscal_schema_diagnostic.sql
```

Opcional em ambiente de teste:

```text
supabase/tests/20260611_fiscal_rls_isolation_tests.sql
```

## 12. Rollback plan

Como a migration é incremental, o rollback seguro é:

- Desativar o deploy do backend que usa o gate fiscal novo.
- Remover triggers criados pela migration se necessário.
- Manter colunas novas, pois são não destrutivas e não afetam dados antigos.
- Se for indispensável remover, fazer backup antes de dropar:
  - `fiscal_rule_conflicts.conflict_key`, `resolution_status`, `product_id`, `product_code`, `ncm`, `cest`
  - `fiscal_audit_logs.origin`, `metadata`
  - `nfe_documents.fiscal_validation_status`, `fiscal_block_reason`, `tax_preview_result`, `fiscal_rule_ids`

## 13. Próxima fase recomendada

1. Rodar a migration no Supabase.
2. Rodar o diagnóstico de schema.
3. Testar RLS com dois usuários/organizações.
4. Criar suíte automatizada do motor fiscal com casos de bloqueio.
5. Criar tela para resolver/ignorar conflitos com justificativa.
6. Melhorar exibição dos erros estruturados no formulário NF-e.
