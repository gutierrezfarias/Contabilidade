# Serpro - Modo Gerenciado CONT HUB

Neste modo, o CONT HUB usa um contrato global Serpro da plataforma para atender escritorios habilitados.

## Quando usar

- O contador nao tem contrato Serpro proprio.
- O CONT HUB quer cobrar por uso, pacote ou credito pre-pago.
- A plataforma quer controlar custo, preco, margem, limite e auditoria.

## Fluxo

1. Admin CONT HUB acessa `/admin/integracoes/serpro`.
2. Cadastra contrato global, CNPJ, ambiente e credenciais oficiais.
3. Habilita modo gerenciado.
4. Define catalogo, custo e preco dos servicos.
5. Habilita o escritorio e saldo/carteira.
6. O contador acessa GOV > Receita Federal e escolhe `Usar contrato CONT HUB`.
7. Cada chamada valida saldo, servico, autorizacao e certificado antes de executar.

## Cobranca

No modo gerenciado:

- O Serpro cobra o CONT HUB.
- O CONT HUB cobra o contador.
- Cada chamada pode gerar custo, preco de venda e margem.
- Se nao houver saldo, a chamada deve ser bloqueada.

## Seguranca

- Consumer Secret nao deve ser exibido apos salvar.
- Nao registrar segredo, certificado, senha ou XML em logs.
- O certificado A1/PFX/P12 continua no fluxo atual do sistema.

## Status atual

A estrutura de contrato, carteira, catalogo, precificacao, auditoria e bloqueio esta pronta. A chamada real aos produtos oficiais Serpro deve ser habilitada somente quando o provider oficial estiver configurado no backend.
