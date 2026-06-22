# CONT HUB - Security Report

Data: 2026-06-21

## Pontos positivos

- Rotas autenticadas usam `ProtectedRoute`.
- Rotas admin usam `AdminRoute` e `useRole`.
- APIs Vercel fiscais exigem Authorization Bearer antes de chamar backend.
- Backend .NET usa `RequireUserAsync` e `EnsureOrganizationAccessAsync` em endpoints criticos auditados.
- Migrations locais contem RLS em muitos dominios.
- `20260616_serpro_least_privilege_grants.sql` aplica menor privilegio em tabelas Serpro sensiveis.
- Logs DF-e mascaram CNPJ e nao registram XML/certificado/senha.

## Riscos altos

| Risco | Evidencia | Impacto | Recomendacao |
|---|---|---|---|
| PFX/P12 e senha em fluxo frontend/banco | `ClientManagement.tsx`, `accountingRepository.ts` | Vazamento de certificado fiscal | Cofre/criptografia mantendo campo visual atual |
| Service role em APIs Vercel/backend | `api/*`, `Supabase*Repository.cs` | Bypass de RLS se endpoint falhar validacao | Garantir validacao organization/client em toda rota |
| Tokens omnichannel em cadastro | `Omnichannel.tsx`, `omnichannelService.ts` | Controle indevido de canais | Migrar segredos para cofre |
| Compra simulada/localStorage | `paymentService.ts` | Acesso indevido se usado como autorizacao final | Usar somente Supabase/webhook PSP para autorizacao real |
| Arquivos em base64 no banco | `client_documents`, `photo_data`, certificado | Crescimento, vazamento, backup sensivel | Storage privado + signed URL + scanning |

## RLS e grants

- Evidencia local mostra RLS habilitado em migrations de plataforma, contabil, home, fiscal, DF-e e Serpro.
- A auditoria nao conectou ao Supabase live, portanto nao prova que todos os SQLs foram executados no banco remoto.
- Serpro tem migration especifica de menor privilegio.
- Recomendado rodar diagnostico no Supabase para `information_schema.role_table_grants` e `pg_policies`.

## Upload e arquivos

- Certificado aceita `.pfx/.p12`.
- Importacao de documento aceita PDF/imagem.
- Deve haver validacao adicional de tamanho, MIME real, conteudo e antivirus antes de escala.

## Injection/XSS/CSV

- Busca PostgREST usa sanitizacao basica em DF-e.
- CSV Injection/macros precisam cobertura explicita em importacoes contabeis/fiscais.
- Campos renderizados em React reduzem XSS por default, mas HTML externo/documentos/XML devem continuar sem `dangerouslySetInnerHTML`.

## Conclusao

Arquitetura esta no caminho certo, mas os segredos fiscais ainda sao o maior risco. Antes de escalar clientes reais, priorizar cofre/criptografia, diagnostico RLS live e revisao de logs.

