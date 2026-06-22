# CONT HUB - Master Scope Audit

Data: 2026-06-21

## Resumo executivo

O CONT HUB ja tem uma base ampla: React/Vite, Supabase, rotas separadas para cliente/admin, backend .NET 8 para NF-e/DF-e/Receita, migrations SQL, RLS em muitos dominios e testes backend. A implementacao, porem, nao esta 100% concluida em producao: ha modulos reais parciais, modulos preparados para integracao externa e telas que ainda funcionam como demonstracao ou assistente operacional.

O ponto mais maduro do fiscal e o backend .NET: ha motor fiscal, DF-e, logs, cooldown, assinatura, XML, XSD e autorizacao NF-e. O ponto mais sensivel e seguranca de segredos: certificado A1/PFX/P12 e senha estao preservados no fluxo atual como solicitado, mas isso exige cofre/criptografia antes de escala real.

## Matriz objetiva

| Requisito | Status | Evidencia | Risco | Proxima acao |
|---|---|---|---|---|
| Autenticacao/login/cadastro/reset | PARCIAL | `src/services/authService.ts` | RPC de email precisa existir no Supabase | Testar reset real e email confirmado |
| Bloqueio de rotas privadas | CONCLUIDA | `src/routes/ProtectedRoute.tsx`, `AdminRoute.tsx`, `PaidAppRoute.tsx` | Autorizacao por app tem fallback local | Remover fallback local para autorizacao critica |
| Admin separado do cliente | PARCIAL | `src/routes/AppRoutes.tsx`, `src/pages/admin/*` | Admin pagamentos ainda placeholder | Completar modulo admin pagamentos |
| Home publica CMS | PARCIAL | `AdminHomePage.tsx`, `home_cms.sql` | Depende migrations/RLS aplicadas e imagens/storage | Teste CRUD real no Supabase |
| Clientes do contador | PARCIAL | `ClientManagement.tsx`, `accountingRepository.ts` | Anexos base64 podem pesar banco | Migrar arquivos grandes para Storage |
| Certificado digital | PARCIAL | `digital_certificates`, `CertificateService.cs` | Senha/PFX no banco/front por requisito atual | Cofre/criptografia sem mudar UX |
| DF-e SEFAZ | PARCIAL | `SefazDfeDistributionService.cs` | Depende certificado, backend publicado e regras SEFAZ | Teste real por UF/ambiente |
| Emissao NF-e 55 | PARCIAL | `NfeAuthorizationService.cs` | Nao comprovada ponta a ponta nesta auditoria | Homologar com certificado e XSD oficial |
| e-CAC/Serpro/Receita | PARCIAL | `RevenueFederalSettings.tsx`, `SupabaseSerproRepository.cs` | Bloqueado por credenciais/contrato externo | Configurar Serpro ou modo manual |
| Modulo fiscal | PARCIAL | `FiscalModule.tsx`, `FiscalRuleEngineService.cs` | Regras incorretas geram risco fiscal | Testes por regime/UF/NCM |
| NCM oficial | PARCIAL | `NcmCatalogService.cs` | Catalogo pode ficar desatualizado | Agendar sync e monitorar |
| Omnichannel | PARCIAL | `Omnichannel.tsx`, APIs Telegram | Meta/WhatsApp/Instagram dependem API externa | Cofre e conectores oficiais |
| Mini CRM | PARCIAL | `MiniCrm.tsx` | Conversao lead->cliente precisa teste | Validar fluxo de conversao |
| Criar site | PARCIAL | `WebsiteBuilder.tsx` | Publicacao/dominio real nao comprovados | Implementar pipeline de publicacao |
| Pagamentos | PARCIAL | `Payments.tsx`, `paymentService.ts` | Compra simulada/localStorage | Integrar gateway e webhooks |
| Psicologa IA | NAO IMPLEMENTADA | `PremiumApp` | App futuro externo | Manter bloqueado/coming soon |
| Relogio de ponto/folha | BLOQUEADA POR SERVICO EXTERNO | Escopo declarado externo | Nao deve misturar DB | Integrar somente via catalogo/API |

## Evidencias tecnicas

- Rotas principais auditadas em `src/routes/AppRoutes.tsx`.
- APIs Vercel auditadas em `api/`.
- Backend auditado em `backend/nfe-api/Program.cs`.
- Migrations auditadas em `supabase/migrations`.
- Testes backend existentes em `backend/nfe-api.tests`.
- Busca por mocks/TODOs apontou compra simulada, AuthLayout com texto demonstrativo, NetSpeed em modo seguro sem chamada externa e Psicologa IA futura.

## Correcoes locais nesta rodada

Nao foi aplicada correcao funcional invasiva. Foram criados inventarios e relatorios solicitados. Isso evita quebrar fluxo fiscal, certificado, senha, PFX/P12 e rotas em uso.

## Validacao local

| Comando | Resultado |
|---|---|
| `npm.cmd run lint` | Passou |
| `npm.cmd run build` | Passou |
| `dotnet build backend\nfe-api\ContHub.NfeApi.csproj -c Release --no-restore` | Passou |
| `dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore` | Passou, 118 testes |

## Plano por fases

1. Hardening de segredos: cofre/criptografia para PFX, senha, tokens Telegram/Meta/Google/Serpro.
2. Confirmacao live Supabase: executar diagnosticos de RLS/grants e comparar com SQL local.
3. NF-e homologacao real: XSD oficial, certificado valido, empresa credenciada e logs Railway.
4. DF-e producao controlada: cooldown, ultNSU/maxNSU, storage e download XML/DANFE.
5. Pagamentos reais: PSP/gateway, webhooks, conciliacao e liberacao sem localStorage.
6. Omnichannel: separar Telegram pronto, Meta dependente de aprovacao/API.
7. Importacao/Exportacao: endurecer CSV injection, macros, mapeamento e historico.
8. Observabilidade: dashboards de erro por organizacao/cliente/endpoint.
