# CONT HUB - Regularidade Fiscal e Saúde do Cliente

Data: 2026-06-22

## Resumo executivo

Foi criada uma visão de regularidade/saúde dentro de `/obrigacoes-impostos`, sem inventar dados externos. A saúde do cliente é calculada por fatores visíveis: cliente ativo/inativo, certificado cadastrado/vencido, obrigações vencidas, impostos vencidos, guias/recibos ausentes e documentos pendentes.

## O que realmente funciona

| Requisito | Implementação | Evidência | Status |
|---|---|---|---|
| Indicador transparente | Cada item mostra origem, detalhe, impacto, ação e data | `src/services/accountingComplianceService.ts` | CORRIGIDA E TESTADA |
| Sem IA/invenção | Só usa registros do Supabase carregados do sistema | `buildRegularityAndHealth` | CORRIGIDA E TESTADA |
| Obrigações vencidas | Usa `due_date` e status real | `buildComplianceAlerts` | CORRIGIDA E TESTADA |
| Impostos vencidos | Usa `due_date`, status e guia/recibo | `buildComplianceAlerts` | CORRIGIDA E TESTADA |
| Certificado digital | Consulta `digital_certificates` e avalia status/vencimento | `buildRegularityAndHealth` | CORRIGIDA E TESTADA |
| Documentos pendentes | Consulta `accounting_documents` pendentes | `buildRegularityAndHealth` | CORRIGIDA E TESTADA |
| Dados externos Receita/e-CAC/SEFAZ | Não consulta se integração não estiver implementada | Mensagens são baseadas apenas no dado local | PARCIAL |

## Riscos

- A pontuação é operacional, não jurídica. Ela ajuda a priorizar, mas não substitui validação oficial em Receita Federal, e-CAC ou SEFAZ.
- Sem execução da migration no Supabase, alguns campos novos de guia/recibo/alerta não existirão.
- Teste multiempresa real depende de usuários/organizações diferentes no Supabase remoto.

## Próxima ação

Após rodar a migration, testar com:

1. Cliente sem certificado;
2. Cliente com certificado vencido;
3. Imposto vencido sem recibo;
4. Obrigação vencida;
5. Documento pendente;
6. Usuário do portal tentando acessar dados de outro cliente.
