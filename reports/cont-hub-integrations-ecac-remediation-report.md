# CONT HUB - Integrações e Importação Manual e-CAC

Data: 2026-06-22

## Resumo executivo

Nesta fase não foi refeita a Central de Integrações nem a importação manual e-CAC. A implementação existente foi preservada. O avanço principal desta entrega foi conectar Obrigações/Impostos com documentos, portal, alertas e regularidade.

## Situação por requisito

| Requisito | Evidência atual | Risco | Próxima ação | Status |
|---|---|---|---|---|
| CRUD de integrações | `src/pages/accounting/Integrations.tsx`, `src/services/accountingIntegrationsService.ts`, `supabase/migrations/20260616_accounting_integrations.sql` | Requer validação manual completa de ativar/desativar e histórico | Auditar tela de ponta a ponta com Supabase remoto | PARCIAL |
| Importação CSV/JSON/XLSX | Backend possui parser e preview/confirm | Ainda precisa validação visual da prévia para todos os tipos | Criar roteiro com arquivos reais e inválidos | PARCIAL |
| Proteção contra CSV Injection | Testes existentes cobrem fórmulas perigosas | Bom, mas precisa teste manual no upload real | Manter testes e validar interface | CORRIGIDA |
| NetSpeed sem simulação | Tela informa modo seguro; sem chamada externa real | Correto enquanto não houver contrato/API oficial | Só ativar após documentação/credenciais | CORRIGIDA, AGUARDANDO SERVICO EXTERNO |
| Importação manual e-CAC sem SERPRO | Existem regras e testes de arquivo perigoso/ZIP path traversal | Não foi revalidado visualmente nesta fase | Auditar fluxo de upload/preview/confirm | PARCIAL |
| Chamada SERPRO | Não deve ocorrer no modo manual | Risco se alguma tela chamar endpoint errado | Fazer auditoria específica em próxima fase | NÃO COMPROVADO |

## Testes executados relacionados

- `dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore`: passou.
- Testes existentes incluem `ManualRevenueImportRulesTests`.

## Próxima fase recomendada

1. Rodar auditoria funcional somente da tela `/integracoes`.
2. Testar importação manual e-CAC com PDF, XML, JSON, CSV, XLSX, TXT e ZIP.
3. Confirmar que nenhum fluxo manual chama SERPRO.
4. Criar/atualizar relatório específico com evidência de upload, prévia, confirmação, rejeição, duplicidade e histórico.
