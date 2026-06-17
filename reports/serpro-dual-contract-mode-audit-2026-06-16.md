# Auditoria Serpro Dual-Mode - 2026-06-16

## Resumo executivo

O Cont Hub ja possui autenticacao, multiempresa por `organization_id`, modulo SEFAZ/NF-e, certificados digitais A1 cadastrados por cliente e telas GOV/e-CAC. Nao foi encontrado modulo Serpro/Receita Federal com contrato duplo, carteira pre-paga, catalogo de servicos, precificacao, consumo por escritorio, autorizacoes/procuracoes ou segregacao entre contrato Cont Hub e contrato direto do contador.

## Evidencias encontradas

| Area | Evidencia | Status |
| --- | --- | --- |
| Certificado digital | `digital_certificates` com arquivo, senha, ambiente, UF e servicos habilitados | Existente |
| SEFAZ/NF-e | `src/pages/accounting/gov/Sefaz.tsx`, backend `/api/sefaz/status` e servicos DF-e | Existente |
| e-CAC | `src/pages/accounting/gov/Ecac.tsx` | Visual/preparado |
| Admin Cont Hub | Rotas `/admin`, `/admin/clientes`, `/admin/aplicativos`, `/admin/pagamentos`, `/admin/configuracoes` | Existente |
| Config contador | `/configuracoes-contabeis`, `/integracoes` | Existente |
| Integracoes contabeis | `20260616_accounting_integrations.sql` | Existente |
| Serpro dual-mode | Nenhuma tabela, endpoint ou tela dedicada localizada | Ausente |

## Lacunas

1. Nao ha tabela para contrato Serpro global do Cont Hub.
2. Nao ha tabela para credenciais Serpro diretas por escritorio.
3. Nao ha catalogo Receita/Serpro versionado.
4. Nao ha precificacao/custo/margem por servico.
5. Nao ha carteira pre-paga por escritorio.
6. Nao ha consumo, reserva, captura, estorno ou limites por chamada.
7. Nao ha autorizacao/procuracao digital vinculada a cliente/servico.
8. Nao ha logs Receita/Serpro separados de logs SEFAZ/NF-e.
9. Nao ha endpoint backend para resolver modalidade `cont_hub_managed` versus `direct_serpro`.
10. Nao ha tela administrativa Serpro para Cont Hub.
11. Nao ha tela do contador para configurar contrato direto, modo gerenciado, servicos e carteira.

## Riscos atuais

| Risco | Impacto |
| --- | --- |
| Misturar credencial global com credencial do contador | Cobranca incorreta e risco contratual |
| Executar chamada sem carteira/saldo no modo gerenciado | Prejuizo financeiro ao Cont Hub |
| Expor segredo Serpro no frontend ou logs | Vazamento de credencial critica |
| Permitir escritorio ver consumo de outro escritorio | Falha multiempresa |
| Usar e-CAC por automacao de portal | Risco juridico/operacional; deve priorizar API oficial |

## Plano implementavel

1. Criar schema Supabase Serpro dual-mode com RLS, carteira, precos, consumo, auditoria e catalogo.
2. Criar backend .NET para resolver contrato, credencial, carteira e autorizacao antes de qualquer chamada Receita.
3. Criar endpoints administrativos e endpoints do contador.
4. Criar telas Admin Cont Hub e Configuracoes Receita Federal do contador.
5. Documentar modalidades, cobranca, autorizacoes e operacao.
6. Manter servicos reais bloqueados ate configurar credenciais oficiais e endpoints Serpro documentados.

## Confirmacao importante

Esta auditoria nao recomenda alterar o fluxo existente de certificado digital A1/PFX/P12 nem a senha do certificado. O Serpro deve consumir esse cadastro quando o servico oficial exigir certificado, mas sem modificar a forma atual de cadastro.
