# CONT HUB - Checklist manual da remodelacao visual

Data: 2026-06-22

## Escopo testado automaticamente

- Lint frontend: passou.
- Build frontend: passou.
- Build backend .NET: passou.
- Testes backend .NET: 136 aprovados.

## Checklist manual recomendado

### Menu contabil

- [ ] Acessar `/dashboard` como contador comum.
- [ ] Confirmar que o grupo `Dashboard` aparece ativo.
- [ ] Recolher e expandir o menu pelo botao `A`.
- [ ] Abrir e fechar os grupos `Clientes`, `Fiscal`, `Financeiro`, `GOV`, `Integracoes e Automacoes` e `Administracao`.
- [ ] Confirmar que o grupo da rota atual continua aberto.
- [ ] Confirmar que o botao `Sair` continua redirecionando para `/login`.

### Navegacao por grupos

- [ ] `Dashboard > Dashboard geral` abre `/dashboard`.
- [ ] `Clientes > Gestao de Clientes` abre `/gestao-clientes`.
- [ ] `Clientes > Consulta CNPJ` abre `/consulta-cnpj`.
- [ ] `Clientes > Documentos Contabeis` abre `/documentos-contabeis`.
- [ ] `Fiscal > Visao Fiscal` abre `/fiscal`.
- [ ] `Fiscal > Obrigacoes e Impostos` abre `/obrigacoes-impostos`.
- [ ] `Financeiro > Gestao Financeira` abre `/gestao-financeira`.
- [ ] `GOV > SEFAZ` abre `/gov/sefaz`.
- [ ] `GOV > e-CAC` abre `/gov/ecac`.
- [ ] `GOV > Receita Federal` abre `/gov/receita-federal`.
- [ ] `Integracoes e Automacoes > Integracoes` abre `/integracoes`.
- [ ] `Administracao > Configuracoes` abre `/configuracoes-contabeis`.

### Admin em acesso assistido

- [ ] Login admin sem `organization` redireciona para `/admin`.
- [ ] Login admin com `?organization=...` consegue navegar no ambiente contabil.
- [ ] Ao navegar pelo menu contabil com `?organization=...`, a query string permanece.
- [ ] `Administracao > Menu Administrativo` aparece apenas para admin.
- [ ] `Menu Administrativo` volta para `/admin`.

### Mobile / telas pequenas

- [ ] Em largura mobile, o menu lateral desktop nao aparece fixo.
- [ ] O botao do menu no header abre o drawer.
- [ ] O drawer abre com textos completos mesmo se o menu desktop estava recolhido.
- [ ] Clicar fora fecha o drawer.
- [ ] Clicar em um item do menu fecha o drawer e navega corretamente.

### GOV protegido

- [ ] SEFAZ carrega sem erro visual novo.
- [ ] e-CAC carrega sem erro visual novo.
- [ ] Receita Federal carrega sem erro visual novo.
- [ ] Seletores de cliente/certificado continuam aparecendo quando ha dados.
- [ ] Nenhuma senha de certificado aparece indevidamente.
- [ ] Fluxos de consultar/sincronizar/emissao continuam usando as mesmas mensagens existentes.

### Gestao de Clientes preservada

- [ ] Acessar `/gestao-clientes` e confirmar que a lista e os filtros aparecem antes do formulario.
- [ ] Confirmar que o formulario completo nao fica aberto permanentemente.
- [ ] Clicar em `Novo cliente` e confirmar que o formulario abre vazio.
- [ ] Clicar em `Fechar` e confirmar que o formulario fecha sem navegar.
- [ ] Usar busca por razao social, CNPJ, telefone, e-mail, cidade ou UF.
- [ ] Usar filtros por status, regime, porte e mensalidade.
- [ ] Confirmar que a paginacao considera o resultado filtrado.
- [ ] Cadastro manual de cliente continua abrindo e salvando.
- [ ] Editar cliente continua preenchendo o formulario.
- [ ] ViaCEP continua preenchendo endereco, bairro, cidade, UF e IBGE quando aplicavel.
- [ ] Importar CSV continua disponivel.
- [ ] Importar por Documento continua disponivel.
- [ ] Importar por Documento abre o formulario com os dados extraidos.
- [ ] Lista de clientes e paginacao continuam aparecendo.
- [ ] Aba Pagamentos continua acessivel em `/gestao-financeira`.
- [ ] Aba Certificados continua anexando PFX/P12 e senha como antes.

### Regressao visual

- [ ] Desktop 1366px: menu nao cobre conteudo.
- [ ] Notebook estreito: conteudo nao fica cortado horizontalmente.
- [ ] Mobile: header, drawer e conteudo permanecem legiveis.
- [ ] Foco por teclado aparece nos botoes/grupos.

## Riscos residuais

- A tela `ClientManagement.tsx` continua densa e com formulario/lista no mesmo lugar.
- As telas GOV nao foram remodeladas internamente por seguranca.
- O build ainda alerta chunks grandes, principalmente por dependencias pesadas ja existentes.
