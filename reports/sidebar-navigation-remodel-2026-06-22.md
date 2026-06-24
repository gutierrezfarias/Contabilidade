# Relatorio - Menu lateral contabil

Data: 2026-06-22

## Resumo executivo

O menu lateral contabil foi corrigido em `src/components/layout/DashboardLayout.tsx`.

O ajuste ficou restrito a navegacao lateral: nao houve alteracao de paginas internas, GOV, backend, APIs, migrations, RLS, credenciais, variaveis de ambiente, rotas ou deploy.

## Causa do problema de recolhimento

O grupo ativo era forçado a ficar aberto durante a renderizacao por uma regra equivalente a:

```tsx
isOpen = openGroups[group.id] || isActiveGroup
```

Com isso, mesmo quando o usuario clicava para recolher o grupo atual, a rota ativa fazia o grupo abrir imediatamente de novo.

## Correcao aplicada

- O estado real de abertura agora vem somente de `openGroups`.
- Ao carregar uma rota ou navegar para outro grupo, o grupo correspondente e aberto uma vez.
- Depois disso, a interacao manual do usuario e respeitada.
- O ajuste usa uma abertura assíncrona curta no `useEffect` para atender o lint de React Hooks e evitar cascata de renderizacao.
- Desktop e drawer mobile compartilham a mesma estrutura de menu.

## Estado anterior

- Dashboard aparecia como item simples na estrutura antiga, sem hierarquia nova.
- GOV tinha controle proprio separado.
- Grupos podiam reabrir sozinhos quando a rota ativa pertencia ao grupo.
- Os icones eram letras e simbolos como `#`, `@`, `F`, `O`, `C`, `D`, `~`, `*`, `+` e `-`.
- Integracoes era item de primeiro nivel.

## Novo comportamento

- Dashboard e link direto para `/dashboard`.
- Grupos expandem e recolhem pelo cabecalho inteiro.
- O icone de expansao usa chevron vetorial com rotacao.
- A rota ativa abre seu grupo quando a navegacao muda.
- O usuario consegue recolher manualmente o grupo ativo sem ele reabrir no mesmo clique.
- O menu possui rolagem vertical no desktop e no mobile.

## Biblioteca de icones

Nao havia biblioteca de icones instalada no projeto.

Para evitar nova dependencia, foram criados icones SVG inline locais no proprio `DashboardLayout.tsx`, com tamanho e espessura consistentes.

## Mapeamento de icones

| Area | Icone usado |
|---|---|
| Dashboard | `dashboard` |
| Clientes | `building` |
| Gestao de Clientes | `building` |
| Consulta CNPJ | `badgeCheck` |
| Documentos Contabeis | `documents` |
| Fiscal | `fiscal` |
| Visao Fiscal | `receipt` |
| Obrigacoes e Impostos | `calendar` |
| Financeiro | `dollar` |
| GOV | `gov` |
| SEFAZ | `documents` |
| e-CAC | `shield` |
| Receita Federal | `gov` |
| Administracao | `admin` |
| Integracoes e Automacoes | `integrations` |
| Configuracoes | `settings` |
| Menu Administrativo | `shield` |
| Expandir/Recolher | `chevron` |
| Drawer mobile | `menu` |

## Estrutura final do menu

```text
Dashboard

Clientes
  Gestao de Clientes
  Consulta CNPJ
  Documentos Contabeis

Fiscal
  Visao Fiscal
  Obrigacoes e Impostos

Financeiro
  Gestao Financeira

GOV
  SEFAZ
  e-CAC
  Receita Federal

Administracao
  Integracoes e Automacoes
  Configuracoes
  Menu Administrativo (somente admin)
```

## Rotas preservadas

| Item | Rota |
|---|---|
| Dashboard | `/dashboard` |
| Gestao de Clientes | `/gestao-clientes` |
| Consulta CNPJ | `/consulta-cnpj` |
| Documentos Contabeis | `/documentos-contabeis` |
| Visao Fiscal | `/fiscal` |
| Obrigacoes e Impostos | `/obrigacoes-impostos` |
| Gestao Financeira | `/gestao-financeira` |
| SEFAZ | `/gov/sefaz` |
| e-CAC | `/gov/ecac` |
| Receita Federal | `/gov/receita-federal` |
| Integracoes e Automacoes | `/integracoes` |
| Configuracoes | `/configuracoes-contabeis` |
| Menu Administrativo | `/admin` |

O parametro `?organization=...` continua preservado pelo helper `toWorkspace`.

## Permissoes preservadas

- O item `Menu Administrativo` continua condicionado a `isAdmin`.
- Nenhuma regra de permissao foi alterada.
- Nenhuma rota protegida foi modificada.
- Nenhuma politica RLS foi tocada.

## Preservacao do GOV

O GOV recebeu apenas:

- Icone semantico no grupo.
- Controle de expandir/recolher consistente.
- Destaque visual da rota ativa.

Nao houve alteracao em paginas, APIs, certificados, PFX/P12, senhas, SERPRO, SEFAZ, e-CAC, Receita Federal, logs, auditoria ou backend.

## Arquivos alterados nesta tarefa

- `src/components/layout/DashboardLayout.tsx`
- `reports/sidebar-navigation-remodel-2026-06-22.md`
- `reports/sidebar-navigation-manual-test-checklist-2026-06-22.md`

## Validacoes executadas

| Comando | Resultado |
|---|---|
| `npm.cmd run lint` | Passou |
| `npm.cmd run build` | Passou |
| `dotnet build backend\nfe-api\ContHub.NfeApi.csproj` | Passou com avisos NU1900 de consulta de vulnerabilidade no NuGet, sem erros |
| `dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj` | Passou: 136/136 testes |

Observacoes:

- O primeiro `dotnet test` falhou por bloqueio de rede do sandbox ao acessar o NuGet.
- Foi reexecutado com permissao de rede e passou.
- O frontend nao possui script `test` no `package.json`.
- O build Vite manteve aviso conhecido de chunk grande, sem falha.

## Testes manuais ainda recomendados

- Expandir e recolher todos os grupos no desktop.
- Recolher o grupo ativo e confirmar que ele nao reabre sozinho.
- Abrir o drawer mobile, expandir/recolher grupos e navegar por item filho.
- Validar `?organization=...` em links do menu.
- Testar usuario admin e usuario comum para confirmar visibilidade do `Menu Administrativo`.
- Abrir rotas GOV e confirmar que as paginas continuam funcionando.
