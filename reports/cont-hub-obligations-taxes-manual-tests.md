# CONT HUB - Testes manuais de Obrigações e Impostos

Data: 2026-06-22

## Pré-requisito

Rodar no Supabase a migration:

`supabase/migrations/20260622_obligations_taxes_alerts_regularidade.sql`

## Roteiro manual

| Cenário | Passos | Resultado esperado | Status |
|---|---|---|---|
| Criar obrigação | Acessar `/obrigacoes-impostos`, aba Obrigacoes, preencher cliente, tipo, competência e vencimento, salvar | Registro aparece na lista paginada | PRONTO PARA TESTE |
| Editar obrigação | Clicar Editar, alterar status ou protocolo, salvar | Registro atualiza sem criar duplicado | PRONTO PARA TESTE |
| Arquivar obrigação | Clicar Arquivar | Registro sai da lista por `deleted_at`, sem apagar fisicamente | PRONTO PARA TESTE |
| Recorrência | Criar obrigação mensal com “Gerar até” futuro | Próximas competências são criadas sem duplicar existentes | PRONTO PARA TESTE |
| Criar imposto | Aba Impostos e guias, preencher cliente, tipo, competência, valores e vencimento | Registro aparece com total calculado | PRONTO PARA TESTE |
| Anexar guia | Selecionar arquivo no campo Guia antes de salvar | Documento é enviado ao bucket `accounting-documents` e ID vinculado no imposto/obrigação | PRONTO PARA TESTE |
| Anexar recibo | Selecionar comprovante antes de salvar ou editar | Recibo fica vinculado ao registro | PRONTO PARA TESTE |
| Portal do cliente | Entrar como usuário do portal | Cliente vê apenas próprios impostos/obrigações e baixa guia/recibo se existirem | PRONTO PARA TESTE |
| Alertas | Criar imposto vencido/obrigação vencida e abrir aba Alertas | Alerta crítico é exibido com origem, impacto e ação | PRONTO PARA TESTE |
| Sincronizar alertas | Clicar “Sincronizar alertas” | Eventos são gravados de forma idempotente, sem duplicar por mesma chave | PRONTO PARA TESTE |
| Regularidade | Abrir aba Regularidade e saúde | Cada cliente mostra itens transparentes por cadastro, certificado, imposto, obrigação e documento | PRONTO PARA TESTE |
| Multiempresa | Usuário da organização A tentar acessar registro da B por ID direto | RLS deve bloquear | DEPENDE DE TESTE NO SUPABASE |

## Observação

O teste automatizado confirma estrutura, uso de CRUD real e vínculos com portal, mas a validação final de RLS exige execução no Supabase remoto com usuários de organizações diferentes.
