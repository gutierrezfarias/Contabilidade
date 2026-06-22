# Auditoria e melhorias de paginacao - Cont Hub

## Resumo executivo

Foi implementada uma base reutilizavel de paginacao e aplicada de forma real/server-side na listagem SEFAZ/DF-e, que era o ponto de maior risco de crescimento e consumo indevido. A navegacao entre paginas agora consulta somente o banco Supabase com `.range()` e `count`, sem disparar nova chamada real para a SEFAZ.

Tambem foi aplicada paginacao visual nas listas de clientes do Admin e de clientes do contador. Essas duas ainda sao parciais, porque os services agregados continuam carregando todos os registros antes de paginar na tela.

Nenhuma chamada real para SEFAZ foi executada. Nenhum commit, push ou deploy foi feito.

## O que realmente funciona

- Componente reutilizavel de paginacao:
  - `src/types/pagination.ts`
  - `src/hooks/usePagination.ts`
  - `src/components/ui/PaginationControls.tsx`
  - `src/components/ui/PaginationSummary.tsx`
  - `src/components/ui/PageSizeSelector.tsx`
- SEFAZ/DF-e com paginacao server-side:
  - `src/services/sefazDocumentService.ts`
  - `src/pages/accounting/gov/Sefaz.tsx`
- Filtros SEFAZ enviados ao Supabase:
  - cliente;
  - organizacao;
  - direcao: recebida, emitida, transporte, citada, evento;
  - periodo;
  - busca;
  - status XML: todos, completo, resumo;
  - status de manifestacao;
  - ordenacao;
  - pagina e tamanho da pagina.
- A troca de pagina nao chama SEFAZ, apenas recarrega registros salvos.
- Selecao em lote ficou limitada a pagina atual.
- Texto da UI foi ajustado para explicar que exportacao/download atual usa apenas selecionados da pagina.
- URL da tela SEFAZ preserva filtros principais: pagina, pageSize, sortBy, sortDirection, period, searchField, direction, q, xml e manifestation.
- Migration incremental criada para indices de paginacao:
  - `supabase/migrations/20260617_dfe_pagination_indexes.sql`

## O que esta apenas visual

- Paginacao em `AdminClients` e `ClientManagement` e visual/local:
  - melhora a tela;
  - reduz renderizacao de muitos cards/linhas;
  - ainda nao reduz leitura no Supabase.
- Exportacao de "todos os filtrados" ainda nao existe. A tela deixa claro que o botao atual baixa somente selecionados da pagina.

## O que esta incompleto

- Paginacao server-side ainda nao foi aplicada em:
  - Mini CRM/leads;
  - Omnichannel conversas e mensagens;
  - Fiscal produtos e regras;
  - Integracoes contabeis: impostos, obrigacoes, historico de sincronizacao;
  - Documentos de clientes;
  - Pagamentos mensais;
  - Certificados;
  - CMS da pagina inicial.
- Dropdowns grandes ainda nao usam busca assincrona.
- Nao foram criados testes unitarios de frontend porque o projeto nao possui script/test runner configurado em `package.json`.

## O que nao foi implementado

- Endpoint backend generico de paginacao para listas administrativas agregadas.
- Exportacao backend de todos os registros filtrados.
- Import/export com paginacao e historico completo para todos os modulos.
- Testes automatizados especificos para os novos componentes React.
- Migracoes de indices para todas as demais tabelas grandes.

## Riscos fiscais

- A tela SEFAZ agora pagina dados salvos corretamente, mas nao muda a regra fiscal: buscar pagina nao deve consultar webservice SEFAZ.
- Emitidas continuam dependendo de XML importado, consulta por chave ou emissao pelo sistema; DF-e/NSU nao e historico completo de emitidas.
- DANFE continua condicionado a XML completo/autorizado.

## Riscos de seguranca

- A paginacao nao mexeu em certificado, senha, PFX/P12, NSU ou service_role.
- A leitura DF-e segue RLS existente nas migrations `20260613_sefaz_dfe_distribution*.sql`.
- A busca usa colunas filtradas no Supabase e remove caracteres problemáticos de busca `,` e `%` antes do `.or()`.

## Riscos multiempresa

- SEFAZ/DF-e continua filtrando por `organization_id` e `client_id`.
- AdminClients e ClientManagement paginam localmente, mas o isolamento segue dependendo dos services/RLS existentes.
- Omnichannel, Fiscal e Integracoes ainda precisam passar pela mesma revisao de paginacao e isolamento server-side.

## Inventario de requisitos

| Requisito | Status | Evidencia | Risco | Proxima acao |
|---|---|---|---|---|
| Inventario de listas grandes | Parcial | Busca em `src/pages` e `src/services` | Algumas listas menores podem ficar fora | Formalizar inventario completo por modulo |
| Componentes reutilizaveis | Concluido | `PaginationControls`, `PaginationSummary`, `PageSizeSelector` | Baixo | Reusar nos demais modulos |
| Hook reutilizavel | Concluido | `usePagination.ts` | Baixo | Integrar a filtros de mais telas |
| Tipo `PaginatedResult<T>` | Concluido | `src/types/pagination.ts` | Baixo | Padronizar services restantes |
| SEFAZ/DF-e server-side | Concluido | `listNfeDocuments` usa `select('*', { count: 'exact' })` e `.range()` | Medio | Testar com volume real |
| SEFAZ nao chamar webservice ao paginar | Concluido | `loadDocuments` consulta Supabase; `refreshDocuments` e separado | Baixo | Manter separacao |
| Filtros resetam para pagina 1 | Concluido | `Sefaz.tsx` reseta pagina ao trocar filtros | Baixo | Repetir em outros modulos |
| Estado em URL | Parcial | SEFAZ grava pagina/filtros | Baixo | Aplicar onde for util |
| Selecionar todos da pagina | Concluido | Texto e logica em `toggleAllRows` | Baixo | Criar selecao multi-pagina somente com backend |
| Exportacao pagina vs todos filtrados | Parcial | UI explica limite atual | Medio | Criar endpoint de exportacao filtrada |
| Eventos DF-e como aba | Concluido | `documentTabs` inclui `evento` | Baixo | Validar dados reais |
| Manifestacao com status alem de pendente | Parcial | Filtro visual e query por status | Medio | Normalizar status gravados |
| DANFE vs XML completo | Parcial | UI ja diferencia resumo/completo | Medio | Gerador DANFE backend ainda e fase separada |
| Indices DF-e | Concluido | `20260617_dfe_pagination_indexes.sql` | Baixo | Rodar no Supabase |
| Admin clientes paginado | Parcial | `AdminClients.tsx` usa paginacao local | Medio | Migrar service para server-side |
| Clientes do contador paginado | Parcial | `ClientManagement.tsx` usa paginacao local | Medio | Migrar `listAccountingClients` para server-side |
| Omnichannel conversas/mensagens | Nao iniciado | `omnichannelService.ts` lista tudo | Alto | Paginar conversas e mensagens |
| Mini CRM/leads | Nao iniciado | `miniCrmService.ts` lista tudo | Medio | Paginar leads por stage/search |
| Fiscal produtos/regras | Nao iniciado | `fiscalRepository.ts` lista tudo | Alto | Paginar produtos, regras e importacoes |
| Integracoes contabeis | Nao iniciado | `Integrations.tsx` renderiza listas completas | Medio | Paginar historico e registros importados |
| Testes frontend | Nao comprovado | Sem script `test` no `package.json` | Medio | Adicionar Vitest/RTL em fase propria |
| Build frontend | Concluido | `npm.cmd run build` aprovado | Baixo | Revalidar apos proximas fases |
| Build backend | Concluido | `dotnet build ... -c Release --no-restore` aprovado | Baixo | Revalidar antes de deploy |
| Testes backend | Concluido | `dotnet test ...` aprovado, 118 testes | Baixo | Adicionar testes de endpoints paginados |

## Arquivos criados ou modificados

Criados:

- `src/types/pagination.ts`
- `src/hooks/usePagination.ts`
- `src/components/ui/PaginationControls.tsx`
- `src/components/ui/PaginationSummary.tsx`
- `src/components/ui/PageSizeSelector.tsx`
- `supabase/migrations/20260617_dfe_pagination_indexes.sql`
- `reports/system-wide-pagination-and-sefaz-list-improvements-2026-06-17.md`

Modificados:

- `src/services/sefazDocumentService.ts`
- `src/pages/accounting/gov/Sefaz.tsx`
- `src/pages/admin/AdminClients.tsx`
- `src/pages/accounting/ClientManagement.tsx`

## Validacoes executadas

- `npm.cmd run lint` - aprovado.
- `npm.cmd run build` - aprovado.
- `dotnet build backend\nfe-api\ContHub.NfeApi.csproj -c Release --no-restore` - aprovado.
- `dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore` - aprovado, 118 testes.

## Proxima fase recomendada

1. Rodar no Supabase a migration:
   - `supabase/migrations/20260617_dfe_pagination_indexes.sql`
2. Migrar `listAccountingClients`, `listAdminClients`, `listMiniCrmLeads`, `listOmnichannelConversations`, `listOmnichannelMessages`, `listFiscalProducts`, `listFiscalRules` e historicos de integracao para `PaginatedResult<T>`.
3. Criar exportacao backend para "todos os filtrados".
4. Criar testes automatizados de frontend para `PaginationControls` e tela SEFAZ.
5. Auditar indices das tabelas restantes antes de ativar paginação server-side em massa.
