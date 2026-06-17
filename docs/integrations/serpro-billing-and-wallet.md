# Serpro - Cobranca, Carteira e Margem

## Conceitos

- `provider_cost`: custo estimado/cobrado pelo Serpro.
- `sale_price`: preco cobrado do contador pelo CONT HUB.
- `margin_amount`: diferenca entre venda e custo.
- `wallet.balance`: saldo do escritorio.
- `wallet.reserved_balance`: saldo reservado para chamadas em andamento.

## Modo gerenciado

1. Antes da chamada, o backend resolve o preco do servico.
2. Valida se o escritorio tem saldo disponivel.
3. Reserva ou bloqueia a chamada.
4. Apos sucesso, captura o valor.
5. Em falha tecnica, libera ou estorna conforme regra.

## Modo direto

No modo direto, a carteira nao e debitada por chamadas Serpro, porque a cobranca ocorre no contrato do proprio contador.

## Limites

Cada escritorio pode ter:

- limite diario de requisicoes;
- limite mensal de credito;
- servicos habilitados individualmente;
- preco customizado por servico;
- isencao por servico.

## Importante

A migration cria a estrutura de carteira e auditoria. A reserva/captura real deve ser usada quando o provider oficial Serpro estiver ativo.
