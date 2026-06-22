# CONT HUB - Obrigações e Impostos

Data: 2026-06-22

## Resumo executivo

Foi criada a base operacional de **Obrigações e Impostos/Guias** para o contador, sem refazer o módulo de portal/documentos. A implementação usa Supabase real, RLS existente por organização, upload privado de documentos contábeis e portal do cliente com download de guia/recibo quando vinculados.

## Resultado por funcionalidade

| Funcionalidade | Situação anterior | Implementação | Evidência | Status |
|---|---|---|---|---|
| Tabelas de obrigações | Existia `accounting_obligations` básica via integrações | Migration incremental adiciona período, recorrência, anexos, notas, alerta, status ampliados e unicidade natural | `supabase/migrations/20260622_obligations_taxes_alerts_regularidade.sql` | CORRIGIDA, AGUARDANDO SUPABASE |
| Tabelas de impostos/guias | Existia `accounting_tax_records` básica/importada | Migration incremental adiciona principal, multa, juros, total, pagamento, guia, recibo, parcelas e alerta | `supabase/migrations/20260622_obligations_taxes_alerts_regularidade.sql` | CORRIGIDA, AGUARDANDO SUPABASE |
| CRUD do contador | Não havia tela dedicada | Criada rota `/obrigacoes-impostos` com criar, editar, arquivar logicamente, filtros e paginação | `src/pages/accounting/ObligationsTaxes.tsx` | CORRIGIDA E TESTADA |
| Recorrência | Não existia geração | Gera competências futuras sem duplicar pela chave tipo/competência/cliente | `src/services/accountingComplianceService.ts` | CORRIGIDA E TESTADA |
| Anexos de guia/recibo | Portal/documentos existia, mas sem vínculo operacional | Upload usa `accounting_documents` e grava IDs na obrigação/imposto | `src/services/accountingComplianceService.ts` | CORRIGIDA E TESTADA |
| Portal do cliente | Lia impostos/obrigações básicos | Passa a ler guia/recibo e permite download por URL assinada | `src/services/accountingDocumentsService.ts`, `src/pages/portal/ClientPortal.tsx` | CORRIGIDA E TESTADA |
| Alertas | Não havia eventos dedicados | Criadas tabelas de settings/eventos e função idempotente; frontend calcula e sincroniza alertas | `20260622_obligations_taxes_alerts_regularidade.sql`, `accountingComplianceService.ts` | CORRIGIDA, AGUARDANDO SUPABASE |
| Auditoria | Tabelas antigas já tinham trigger | Novas tabelas de alerta usam trigger de auditoria existente | `log_accounting_table_change` reutilizada | CORRIGIDA, AGUARDANDO SUPABASE |
| RLS/multiempresa | Existia `accounting_can_access_org` | Novas tabelas usam RLS por organização; obrigações/impostos reaproveitam RLS existente | Migration linha de RLS/grants | CORRIGIDA, AGUARDANDO SUPABASE |

## Arquivos criados ou modificados

- `supabase/migrations/20260622_obligations_taxes_alerts_regularidade.sql`
- `src/types/accountingCompliance.ts`
- `src/services/accountingComplianceService.ts`
- `src/pages/accounting/ObligationsTaxes.tsx`
- `src/routes/AppRoutes.tsx`
- `src/components/layout/DashboardLayout.tsx`
- `src/types/accountingDocuments.ts`
- `src/services/accountingDocumentsService.ts`
- `src/pages/portal/ClientPortal.tsx`
- `backend/nfe-api.tests/AccountingObligationsTaxesPhase2Tests.cs`

## Testes e validações

- `npm.cmd run lint`: passou.
- `npm.cmd run build`: passou.
- `dotnet build backend\nfe-api\ContHub.NfeApi.csproj -c Release --no-restore`: passou.
- `dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore`: passou, 132 testes.

## Pendência externa

Rodar no Supabase:

`supabase/migrations/20260622_obligations_taxes_alerts_regularidade.sql`

Sem essa migration, campos novos como `guide_document_id`, `receipt_document_id`, `principal_amount` e tabelas de alerta não existirão no banco remoto.
