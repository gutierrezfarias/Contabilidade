# Serpro - Modo Direto do Contador

Neste modo, cada escritorio informa suas proprias credenciais Serpro pela tela do sistema.

## Quando usar

- O contador ja tem contrato Serpro.
- O Serpro deve cobrar diretamente o escritorio.
- O CONT HUB apenas organiza a configuracao, auditoria e consumo.

## Fluxo

1. Contador acessa GOV > Receita Federal.
2. Escolhe `Meu contrato direto Serpro`.
3. Informa CNPJ do contrato, Consumer Key, Consumer Secret e referencia do segredo.
4. Habilita os servicos contratados.
5. Testa a configuracao.

## Cobranca

No modo direto:

- O Serpro cobra o contador.
- O CONT HUB nao desconta carteira por chamada Serpro.
- O CONT HUB ainda registra uso, auditoria e status.

## Fallback

O contador pode permitir fallback para contrato CONT HUB se o admin permitir. Quando o fallback for usado, a chamada passa a consumir carteira do escritorio.

## Seguranca

As credenciais ficam configuradas pela interface. O backend retorna apenas status e referencia, nunca o segredo em texto puro.
