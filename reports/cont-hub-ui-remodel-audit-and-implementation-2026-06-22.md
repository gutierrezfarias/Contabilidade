# CONT HUB - Auditoria e remodelacao visual progressiva

Data: 2026-06-22

## Resumo executivo

Foi feita uma auditoria inicial das rotas, layouts e paginas principais do CONT HUB antes de alterar UI. A alteracao aplicada nesta fase foi conservadora: reorganizacao do menu lateral do ambiente contabil em grupos colapsaveis, melhoria de responsividade com drawer mobile e preservacao das rotas existentes.

Nao foram alterados: banco de dados, migrations, regras de negocio, backend fiscal, contratos de API, integracoes GOV, certificado PFX/P12, senha de certificado, RLS, autenticacao, permissoes, logs fiscais ou deploy.

## Arquivo alterado

| Arquivo | Tipo | O que mudou |
|---|---|---|
| `src/components/layout/DashboardLayout.tsx` | Layout contabil | Menu lateral agrupado, grupos colapsaveis, drawer mobile, estados ativos, acessibilidade basica e preservacao de `organization` na query string. |
| `src/pages/accounting/ClientManagement.tsx` | Gestao de Clientes | Aba Cadastros remodelada para lista principal, formulario sob acao, busca/filtros locais, cards de resumo e atalho para certificados. |

## Inventario de rotas e risco

| Pagina / area | Rota | Arquivo principal | Componentes / servicos relacionados | Permissao / integracao | Risco | Recomendacao |
|---|---|---|---|---|---|---|
| Pagina inicial publica | `/` | `src/pages/home/Home.tsx` | `homeContent`, CMS home | Publico | Baixo | Pode receber refinamento visual isolado. |
| Login | `/login` | `src/pages/auth/Login.tsx` | `authService`, `AuthContext` | Publico | Medio | Preservar fluxo Supabase/Auth. |
| Cadastro | `/cadastro` | `src/pages/auth/Register.tsx` | `authService` | Publico | Medio | Nao alterar validacao sem teste. |
| Esqueci senha | `/esqueci-senha` | `src/pages/auth/ForgotPassword.tsx` | Supabase password reset | Publico | Medio | Preservar mensagem/validacao de e-mail. |
| Redefinir senha | `/redefinir-senha` | `src/pages/auth/ResetPassword.tsx` | Supabase session/reset | Publico | Medio | Nao mudar parametros de retorno. |
| Home de aplicativos | `/aplicativos` | `src/pages/apps/AppHome.tsx` | `appCatalog`, `paymentService` | Login | Medio | Pode melhorar cards sem mexer em liberacao. |
| Crie seu site | `/aplicativos/crie-seu-site` | `src/pages/website/WebsiteBuilder.tsx` | `websiteBuilderService` | Login + app pago | Medio | Remodelar em fase propria. |
| Psicologa IA | `/aplicativos/psicologa-ia` | `src/pages/apps/PremiumApp.tsx` | `PaidAppRoute` | Login + app pago | Baixo | Visual simples. |
| Mini CRM | `/mini-crm` | `src/pages/miniCrm/MiniCrm.tsx` | `miniCrmService` | Login + app pago | Medio | Revisar pipeline sem alterar conversao para cliente. |
| Omnichannel | `/omnichannel` | `src/pages/omnichannel/Omnichannel.tsx` | `omnichannelService`, webhooks | Login + app pago | Alto | Tokens, canais e mensagens exigem cuidado. |
| Pagamentos do contador | `/configuracoes/pagamentos` | `src/pages/settings/Payments.tsx` | `paymentService` | Login | Alto | Nao alterar liberacao/isencao sem teste. |
| Dashboard contabil | `/dashboard` | `src/pages/dashboard/Dashboard.tsx` | `accountingData`, Supabase | Login + app gestao | Medio | Pode receber cards mais densos. |
| Gestao de Clientes | `/gestao-clientes` | `src/pages/accounting/ClientManagement.tsx` | `accountingRepository`, ViaCEP, importacao, certificados, pagamentos | Login + app gestao | Alto | Parcialmente remodelada: lista principal e formulario sob acao. Proxima fase: workspace individual. |
| Consulta CNPJ | `/consulta-cnpj` | `src/pages/accounting/CnpjConsultation.tsx` | `cnpjService` | Login + app gestao | Medio | Pode adicionar botao "Adicionar empresa" mantendo preview. |
| Documentos contabeis | `/documentos-contabeis` | `src/pages/accounting/AccountingDocuments.tsx` | `accountingDocumentsService` | Login + app gestao | Alto | Preservar arquivos/storage/RLS. |
| Obrigacoes e impostos | `/obrigacoes-impostos` | `src/pages/accounting/ObligationsTaxes.tsx` | `accountingComplianceService` | Login + app gestao | Alto | Fiscal/alertas, nao mexer sem testes. |
| Fiscal | `/fiscal` | `src/pages/accounting/FiscalModule.tsx` | `fiscalRepository`, `fiscalBackendService` | Login + app gestao | Alto | Regra fiscal, auditoria e simulador protegidos. |
| Gestao Financeira | `/gestao-financeira` | `ClientManagement` com `initialTab=pagamentos` | Pagamentos de clientes | Login + app gestao | Alto | Compartilha componente grande de clientes. |
| SEFAZ | `/gov/sefaz` | `src/pages/accounting/gov/Sefaz.tsx` | `sefazDocumentService`, `nfeEmissionService`, certificados | Login + app gestao | Critico | Apenas menu externo foi alterado; contratos GOV intocados. |
| e-CAC | `/gov/ecac` | `src/pages/accounting/gov/Ecac.tsx` | certificados, servicos GOV | Login + app gestao | Critico | Nao alterar sem regression fiscal. |
| Receita Federal | `/gov/receita-federal` | `src/pages/accounting/settings/RevenueFederalSettings.tsx` | `serproService` | Login + app gestao | Critico | Serpro/Receita protegidos. |
| Integracoes | `/integracoes` | `src/pages/accounting/Integrations.tsx` | `accountingIntegrationsService` | Login + app gestao | Alto | API externa, importacao e sincronismo. |
| Configuracoes contabeis | `/configuracoes-contabeis` | `src/pages/accounting/settings/AccountingSettings.tsx` | `accountingSettingsService`, Google Business | Login + app gestao | Alto | Perfil da empresa, socios, docs e permissao. |
| Portal do cliente | `/portal` | `src/pages/portal/ClientPortal.tsx` | portal/accounting docs | Login | Alto | Isolamento cliente e arquivos. |
| Admin dashboard | `/admin` | `src/pages/admin/AdminDashboard.tsx` | `AdminRoute`, admin services | Admin | Alto | Menu admin separado deve continuar independente. |
| Admin clientes | `/admin/clientes` | `src/pages/admin/AdminClients.tsx` | `adminClientService`, reset senha, apps | Admin | Alto | Nao misturar com menu do contador. |
| Admin aplicativos | `/admin/aplicativos` | `src/pages/admin/AdminApps.tsx` | `adminAppsService` | Admin | Medio | Pode remodelar depois. |
| Admin pagamentos | `/admin/pagamentos` | `AdminPlaceholder` | futuro financeiro admin | Admin | Medio | Ainda placeholder. |
| Admin Serpro | `/admin/integracoes/serpro` | `src/pages/admin/AdminSerpro.tsx` | `serproService` | Admin | Critico | Credenciais/contratos Serpro. |
| Admin configuracoes | `/admin/configuracoes` | `src/pages/admin/AdminSettings.tsx` | CMS home, financeiras, empresa | Admin | Alto | Preservar CMS e integracoes financeiras. |

## Matriz de risco

| Area | Status atual | Risco | Proxima acao |
|---|---|---|---|
| Menu contabil | Implementado | Baixo | Validar navegacao manual em desktop/mobile. |
| GOV/SEFAZ/e-CAC/Receita | Intocado internamente | Critico | Fazer regressao manual antes de qualquer remodelacao interna. |
| Gestao de Clientes | Parcialmente remodelado | Alto | Proxima fase: workspace individual do cliente e painel/rota dedicada para novo/editar. |
| Certificados digitais | Intocado | Critico | Nunca mover senha/PFX sem decisao arquitetural e testes. |
| Pagamentos/isencoes | Intocado | Alto | Manter fluxo atual ate fase financeira. |
| Admin | Intocado | Alto | Nao misturar menu admin com menu cliente/contador. |

## O que foi preservado

- Todas as rotas existentes em `AppRoutes.tsx`.
- Protecao por `ProtectedRoute`, `PaidAppRoute` e `AdminRoute`.
- Redirecionamento de admin para `/admin` quando nao ha `organization` na URL.
- `organization` na query string em acesso assistido pelo admin.
- Links GOV para `/gov/sefaz`, `/gov/ecac` e `/gov/receita-federal`.
- Funcao de logout.
- Acesso ao menu administrativo apenas quando `isAdmin` e verdadeiro.
- Nenhuma alteracao em services, hooks, Supabase, backend ou migrations.
- Nenhuma alteracao no fluxo de certificados PFX/P12 e senha.

## Implementacao aplicada

O menu lateral contabil foi reorganizado em grupos:

1. Dashboard
2. Clientes
3. Fiscal
4. Financeiro
5. GOV
6. Integracoes e Automacoes
7. Administracao

Melhorias adicionadas:

- Grupo ativo abre automaticamente por calculo de rota.
- Grupos podem ser recolhidos/expandidos.
- Menu lateral inteiro continua recolhivel pelo botao `A`.
- Drawer mobile foi adicionado para telas pequenas.
- Drawer mobile abre expandido mesmo se o menu desktop estiver recolhido.
- Navegacao usa `aria-expanded`, `aria-controls`, foco visivel e labels.

## Gestao de Clientes remodelada nesta fase

Alteracoes aplicadas na aba `Cadastros`:

- A listagem virou a area principal da pagina.
- O formulario completo nao aparece mais permanentemente.
- Botao `Novo cliente` abre o formulario existente.
- Botao `Editar` abre o mesmo formulario existente preenchido com o cliente.
- Importacao por documento abre o formulario e preenche os mesmos campos ja existentes.
- Busca local por razao social, CNPJ, telefone, e-mail, cidade, UF, bairro, regime e porte.
- Filtros locais por status, regime tributario, porte e mensalidade.
- Paginacao agora respeita os filtros aplicados.
- Cards de resumo exibem total, resultado filtrado, ativos e mensalistas.
- O formulario duplicado de certificado foi retirado da aba Cadastros e substituido por um atalho para a aba `Certificados`, onde o CRUD completo permanece.

Funcionalidades preservadas:

- Criar cliente.
- Editar cliente.
- Excluir cliente.
- Importar CSV.
- Importar por documento.
- Baixar modelo CSV.
- ViaCEP.
- Mascara CNPJ, telefone e CEP.
- Upload de imagem/logotipo.
- Vinculo de documento importado ao cliente salvo.
- Visualizacao/exclusao de documentos do cliente.
- Pagamentos na aba `Pagamentos`.
- Certificado PFX/P12, senha e servicos habilitados na aba `Certificados`.

## GOV regression

| Item | Status |
|---|---|
| Rotas GOV preservadas | Sim |
| Arquivos GOV alterados | Nao |
| Contratos SEFAZ/e-CAC/Receita alterados | Nao |
| Certificado PFX/P12 alterado | Nao |
| Senha de certificado alterada | Nao |
| Chamadas `/api/dfe`, `/api/nfe`, `/api/sefaz`, `/api/revenue`, `/api/serpro` alteradas | Nao |
| Risco residual | Baixo para esta fase, pois a mudanca ficou no menu/layout externo. |

## Validacoes executadas

| Comando | Resultado | Observacao |
|---|---|---|
| `npm.cmd run lint` | Passou | Sem erros apos ajuste do efeito React. |
| `npm.cmd run build` | Passou | Vite alertou apenas chunk grande ja existente. |
| `dotnet build backend\nfe-api\ContHub.NfeApi.csproj -c Release --no-restore` | Passou | 0 erros, 0 avisos. |
| `dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore` | Passou | 136 testes aprovados. |

## O que ficou apenas planejado

- Criacao de workspace individual do cliente.
- Separacao definitiva de cadastro, pagamentos, certificados e documentos por subpaginas/painel.
- Remodelacao de dashboard, fiscal, financeiro e documentos.
- Auditoria visual tela a tela com screenshots.
- Teste manual em navegador autenticado.

## Plano de correcao por fases

### Fase 1 - Base visual segura

Concluida nesta entrega: menu agrupado, drawer mobile, sem mudanca de regra.

### Fase 2 - Gestao de Clientes sem perda funcional

- Concluido parcialmente: listagem virou conteudo principal.
- Concluido parcialmente: novo/editar abrem o formulario existente sob acao.
- Concluido: importacao CSV/documento, ViaCEP, mascaras, logo, pagamentos e certificados foram preservados.
- Pendente: criar workspace do cliente com abas Dados, Documentos, Pagamentos, Certificados, Fiscal e Historico.

### Fase 3 - Fiscal/GOV com regressao controlada

- Ajustar apenas experiencia visual de SEFAZ/e-CAC/Receita.
- Manter contratos de backend e certificados.
- Criar checklist especifico para sincronismo DF-e, emissao NF-e, consulta status e Receita/Serpro.

### Fase 4 - Admin e apps

- Separar telas admin por dominio: clientes, apps, pagamentos, CMS, contratos/integracoes.
- Preservar isolamento de admin x contador.

## Recomendacoes futuras

- Introduzir componente comum de `ModuleShell` para paginas internas.
- Criar `SidebarGroup` reutilizavel para admin e contador, mantendo menus separados.
- Quebrar `ClientManagement.tsx` em componentes menores antes de remodelar.
- Criar testes de navegacao para menu, mobile drawer e preservacao de `organization`.
- Avaliar code splitting para reduzir chunk grande do build.
