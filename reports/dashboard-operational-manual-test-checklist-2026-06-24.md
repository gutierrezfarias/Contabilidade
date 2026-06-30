# Checklist manual - Dashboard Operacional 2026-06-24

## Acesso e contexto

1. Entrar como administrador da plataforma.
2. Abrir um escritorio pela area administrativa usando visualizacao assistida.
3. Confirmar que o aviso "Visualizacao assistida ativa" aparece no Dashboard.
4. Confirmar que os links internos preservam `organization`, `month` e `year`.
5. Atualizar a pagina e confirmar que o escritorio e o periodo continuam corretos.

## Periodo

6. Alterar mes.
7. Alterar ano.
8. Confirmar que a URL muda para `?organization={id}&month={mes}&year={ano}`.
9. Confirmar que obrigacoes, financeiro e atividades mudam conforme o periodo.
10. Confirmar que certificados vencidos e falhas atuais continuam aparecendo mesmo ao trocar o periodo.

## KPIs

11. Conferir "Clientes ativos" contra a tabela de clientes ativos da organizacao.
12. Conferir "Vencem hoje" com obrigacoes/impostos abertos com vencimento na data atual.
13. Conferir "Em atraso" com obrigacoes/impostos vencidos e nao concluidos.
14. Conferir "Aguardando cliente" com documentos de aprovacao pendente.
15. Conferir "Situacao critica" com atrasos, certificados criticos e integracoes com erro.
16. Clicar em cada card e confirmar que vai para a tela relacionada.

## Pesquisa e acoes rapidas

17. Pesquisar cliente por razao social.
18. Pesquisar cliente por CNPJ.
19. Abrir um cliente pelo resultado de busca.
20. Abrir "Acao rapida".
21. Testar os links: adicionar cliente, criar obrigacao, importar documento, sincronizar SEFAZ, integracoes e emitir NF-e.

## Requer sua atencao

22. Conferir filtros: Todos, Criticos, Atrasados, Hoje, Proximos 7 dias e Aguardando cliente.
23. Abrir uma obrigacao pela acao contextual.
24. Abrir um imposto pela acao contextual.
25. Abrir um documento pendente pela acao contextual.
26. Abrir certificado critico pela acao contextual.
27. Confirmar que a ordenacao prioriza criticidade e vencimento.

## Obrigacoes e vencimentos

28. Conferir totais do bloco "Obrigacoes do mes".
29. Conferir barras de progresso.
30. Clicar em "Ver todas".
31. Conferir "Proximos vencimentos" com 5 a 8 itens.
32. Confirmar que itens concluidos nao aparecem como vencimentos abertos.

## Saude dos clientes

33. Confirmar status saudavel, atencao, critico ou nao configurado.
34. Conferir explicacao textual do motivo do status.
35. Abrir cliente pela tabela de saude.
36. Confirmar que cliente de outra organizacao nao aparece.

## Integracoes

37. Conferir card SEFAZ.
38. Conferir card Certificados.
39. Conferir card Integracoes contabeis.
40. Conferir card Importacoes.
41. Confirmar que integracoes nao configuradas aparecem como "Nao configurado" e nao como sucesso falso.

## Financeiro

42. Conferir honorarios previstos.
43. Conferir honorarios recebidos.
44. Conferir valor em atraso.
45. Conferir taxa de inadimplencia.
46. Conferir clientes inadimplentes.
47. Conferir receita media por cliente.
48. Testar usuario sem permissao financeira quando existir regra granular no banco.

## Equipe

49. Criar/usar funcionario com obrigacao atribuida.
50. Confirmar que a carga da equipe aparece.
51. Remover atribuicoes ou testar escritorio sem responsaveis.
52. Confirmar que o bloco nao ocupa espaco vazio.

## Atividades recentes

53. Conferir auditoria contabil.
54. Conferir auditoria fiscal.
55. Confirmar que nao aparecem tokens, senhas, XML completo ou certificado.
56. Confirmar que eventos de outra organizacao nao aparecem.

## Estados vazios

57. Testar escritorio sem clientes.
58. Testar escritorio sem obrigacoes no periodo.
59. Testar escritorio sem documentos pendentes.
60. Testar escritorio sem integracoes.
61. Confirmar textos orientativos e proximas acoes reais.

## Responsividade

62. Validar desktop com cinco KPIs em linha.
63. Validar tablet com cards reorganizados.
64. Validar mobile com cards empilhados.
65. Abrir drawer mobile.
66. Navegar por teclado pelos filtros, busca, cards e links.
67. Confirmar foco visivel.

## Diagnostico Supabase

68. Executar manualmente `supabase/diagnostics/20260624_accounting_operational_dashboard_diagnostic.sql`.
69. Conferir se todas as tabelas existem.
70. Conferir se RLS esta habilitado.
71. Conferir grants de `anon` e `authenticated`.
72. Conferir registros sem `organization_id`.
73. Conferir contagens por organizacao.
