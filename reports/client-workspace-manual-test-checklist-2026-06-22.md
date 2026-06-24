# Checklist Manual - Area Individual do Cliente

Data: 2026-06-22

## Acesso e rota

- [ ] Acessar `/gestao-clientes`.
- [ ] Clicar em `Abrir` em um cliente.
- [ ] Confirmar abertura de `/gestao-clientes/:clientId`.
- [ ] Recarregar a pagina e confirmar que o mesmo cliente continua aberto.
- [ ] Confirmar que `?organization=...` foi preservado quando existir.
- [ ] Tentar abrir um `clientId` inexistente e confirmar estado de cliente nao encontrado.
- [ ] Tentar abrir cliente de outra organizacao e confirmar bloqueio/estado vazio pela RLS.

## Cabeçalho

- [ ] Conferir razao social.
- [ ] Conferir CNPJ.
- [ ] Conferir cidade/UF.
- [ ] Conferir status ativo/inativo.
- [ ] Conferir regime tributario.
- [ ] Conferir porte.
- [ ] Conferir mensalidade.
- [ ] Conferir status do certificado.
- [ ] Botao `Voltar a lista` retorna para Gestao de Clientes.
- [ ] Botao `Editar cadastro` abre o formulario existente do cliente.
- [ ] Botao `Abrir SEFAZ` preserva organizacao e cliente na URL.

## Dashboard

- [ ] Cards exibem dados reais quando existem.
- [ ] Fontes que falham aparecem como `Nao consultado` ou alerta.
- [ ] Alertas aparecem para cadastro incompleto.
- [ ] Alertas aparecem para certificado ausente, inativo, vencido ou perto do vencimento.
- [ ] Alertas aparecem para pagamentos vencidos, quando houver.
- [ ] Clicar em cards navegaveis troca para a aba correta.
- [ ] Atividades recentes mostram apenas documentos, pagamentos e certificados reais.

## Abas

- [ ] Dashboard abre por padrao.
- [ ] `?tab=cadastro` abre Cadastro.
- [ ] `?tab=fiscal` abre Fiscal.
- [ ] `?tab=obrigacoes` abre Obrigacoes e Impostos.
- [ ] `?tab=financeiro` abre Financeiro.
- [ ] `?tab=documentos` abre Documentos.
- [ ] `?tab=certificados` abre Certificados.
- [ ] `?tab=integracoes` abre Integracoes.
- [ ] `?tab=historico` abre Historico.
- [ ] Em tela pequena, as abas rolam horizontalmente.

## Cadastro

- [ ] Dados do cliente aparecem corretamente.
- [ ] Logo/imagem aparece quando cadastrado.
- [ ] Botao `Editar no cadastro` abre a tela atual de Gestao de Clientes com formulario preenchido.
- [ ] Salvar no formulario existente continua funcionando.

## Financeiro

- [ ] Pagamentos do periodo atual aparecem filtrados pelo cliente.
- [ ] Status e valores conferem com a tela financeira.
- [ ] Cliente sem pagamentos mostra estado vazio.

## Documentos

- [ ] Documentos contabeis aparecem quando existentes.
- [ ] Documentos de cadastro/importacao por documento aparecem quando existentes.
- [ ] Cliente sem documentos mostra estado vazio.

## Certificados

- [ ] Certificados do cliente aparecem.
- [ ] Status, ambiente, UF, arquivo, senha cadastrada e quantidade de servicos aparecem.
- [ ] Senha nao e exibida no dashboard individual.
- [ ] Botao `Gerenciar certificados` abre o fluxo atual de certificados.
- [ ] O comportamento atual de PFX/P12 e senha permanece intacto no fluxo original.

## Fiscal, Obrigações e Integrações

- [ ] Fiscal mostra perfil, produtos e regras quando existirem.
- [ ] Obrigacoes mostra totais e registros recentes quando existirem.
- [ ] Impostos/guias mostram totais e registros recentes quando existirem.
- [ ] Integracoes mostram vinculos do cliente quando a API responder.
- [ ] Links para modulos existentes preservam `organization` e `clientId`.

## Regressão

- [ ] `/dashboard` continua funcionando.
- [ ] `/gestao-clientes` continua funcionando.
- [ ] Cadastro novo de cliente continua funcionando.
- [ ] Importar CSV continua funcionando.
- [ ] Importar por documento continua funcionando.
- [ ] Certificados continuam salvando pelo fluxo atual.
- [ ] Pagamentos continuam funcionando.
- [ ] GOV/SEFAZ/e-CAC nao tiveram comportamento alterado.
