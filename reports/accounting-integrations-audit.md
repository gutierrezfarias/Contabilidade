# Auditoria - Central de Integracoes Contabeis

Data: 2026-06-16

## Resumo executivo

Foi analisado o estado do CONT HUB antes da implementacao da Central de Integracoes Contabeis. O sistema ja possuia modulo fiscal, clientes, Supabase, rotas protegidas, backend .NET fiscal e uma tela de integracoes ainda visual. Nao havia, porem, uma fundacao padronizada para integrar sistemas contabeis externos como NetSpeed, Dominio, Alterdata, SCI, Questor ou Contmatic.

## Diagnostico objetivo

| Area | Situacao encontrada | Risco | Acao definida |
| --- | --- | --- | --- |
| Tela `/integracoes` | Existia como area simples/visual | Nao salvava integracoes reais | Substituir por central com CRUD e diagnostico |
| Banco Supabase | Nao havia tabelas contabeis padronizadas | Sem persistencia, sem auditoria e sem isolamento dedicado | Criar migration incremental |
| RLS | Existia em outros modulos, nao neste dominio | Risco multiempresa se novas tabelas fossem criadas sem politicas | Criar politicas por `organization_id` |
| Provider/adapters | Nao existia interface de provider contabil | Acoplamento futuro e risco de inventar contrato NetSpeed | Criar `IAccountingIntegrationProvider` |
| NetSpeed | Sem documentacao oficial no repositorio | Inventar endpoints causaria falso funcionamento | Criar provider seguro `not_configured` |
| Importacao manual | Sem fluxo padronizado | Dependencia prematura de API externa | Criar previa, validacao e confirmacao CSV/JSON |
| Auditoria | Sem log especifico para dados contabeis | Dificuldade de rastrear alteracoes | Criar `accounting_audit_logs` |
| Certificado digital | Fluxo existente sensivel | Risco de quebrar SEFAZ/e-CAC | Nao alterar nada nesse fluxo |
| Vercel functions | Projeto ja estava no limite do plano Hobby | Deploy poderia falhar | Reaproveitar `/api/dfe/[...path]` |

## Decisoes tecnicas

- Manter o backend contabil dentro do backend fiscal .NET existente por reaproveitar autenticacao, Supabase service role e controle por organizacao.
- Usar o catch-all Vercel ja existente `/api/dfe/[...path]` para evitar criar novas Serverless Functions.
- Tratar NetSpeed como provider configuravel, mas sem chamada externa real enquanto nao houver contrato/documentacao.
- Comecar com CSV/JSON real e deixar XLSX explicitamente bloqueado ate existir leitor dedicado.
- Nao transformar o CONT HUB em sistema contabil completo nesta fase.

## Impacto no certificado digital

Nenhum arquivo do fluxo de certificado digital foi alterado. Senha, upload, exibicao e uso atual permanecem como estavam.
