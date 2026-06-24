# Checklist manual - Menu lateral contabil

Data: 2026-06-22

## Desktop

- [ ] Abrir `/dashboard` e confirmar Dashboard como link direto, sem submenu.
- [ ] Expandir `Clientes`.
- [ ] Recolher `Clientes`.
- [ ] Expandir `Fiscal`.
- [ ] Recolher `Fiscal`.
- [ ] Expandir `Financeiro`.
- [ ] Recolher `Financeiro`.
- [ ] Expandir `GOV`.
- [ ] Recolher `GOV`.
- [ ] Expandir `Administracao`.
- [ ] Recolher `Administracao`.
- [ ] Recolher o grupo da rota ativa e confirmar que ele nao reabre sozinho.
- [ ] Navegar para um item filho e confirmar que o grupo correto abre.
- [ ] Confirmar destaque visual do item ativo.
- [ ] Confirmar que a rolagem do menu aparece quando a altura da tela for pequena.

## Mobile

- [ ] Abrir o drawer pelo botao do cabecalho.
- [ ] Expandir e recolher `Clientes`.
- [ ] Expandir e recolher `GOV`.
- [ ] Navegar para um item filho.
- [ ] Confirmar que o drawer fecha apos navegar.
- [ ] Reabrir o drawer e confirmar que a rota ativa continua identificavel.

## Rotas e parametros

- [ ] Acessar com `?organization=...`.
- [ ] Clicar em Dashboard e confirmar que o parametro foi preservado.
- [ ] Clicar em Gestao de Clientes e confirmar que o parametro foi preservado.
- [ ] Clicar em Integracoes e Automacoes dentro de Administracao e confirmar rota `/integracoes`.
- [ ] Atualizar a pagina com `F5` e confirmar que o grupo da rota atual inicia aberto.
- [ ] Usar voltar/avancar do navegador e confirmar abertura do grupo correspondente.

## Permissoes

- [ ] Usuario comum nao deve ver `Menu Administrativo`.
- [ ] Usuario admin deve ver `Menu Administrativo`.
- [ ] `Configuracoes` e `Integracoes e Automacoes` devem manter o acesso existente do sistema.

## GOV

- [ ] Abrir `/gov/sefaz`.
- [ ] Abrir `/gov/ecac`.
- [ ] Abrir `/gov/receita-federal`.
- [ ] Confirmar que apenas o menu mudou visualmente.
- [ ] Confirmar que telas, dados, certificados, senhas e acoes GOV permanecem iguais.

## Acessibilidade basica

- [ ] Navegar pelo menu usando `Tab`.
- [ ] Confirmar foco visivel nos botoes de grupo.
- [ ] Confirmar `Enter`/`Space` expandindo e recolhendo grupos.
- [ ] Confirmar que os botoes de grupo possuem texto acessivel de expandir/recolher.
