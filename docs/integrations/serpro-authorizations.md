# Serpro - Autorizacoes e Procuracoes

Alguns servicos Receita Federal exigem autorizacao, procuracao digital ou permissao especifica para o contador acessar dados do cliente.

## Regra

O sistema deve validar:

1. escritorio logado;
2. cliente vinculado ao escritorio;
3. certificado ativo quando exigido;
4. servico habilitado;
5. autorizacao/procuracao valida quando exigida.

## Cadastro

A tabela `serpro_client_authorizations` guarda:

- escritorio;
- cliente;
- servico;
- tipo de autorizacao;
- status;
- validade;
- documento de evidencia;
- observacoes;
- auditoria.

## O que nao fazer

- Nao armazenar senha gov.br no frontend.
- Nao automatizar portal com CAPTCHA.
- Nao usar scraping como se fosse API oficial.
- Nao executar chamada em nome do cliente sem autorizacao.

## Certificado digital

O fluxo de certificado A1/PFX/P12 e senha continua sendo o mesmo ja existente no CONT HUB. Esta implementacao apenas referencia o certificado quando um servico oficial exigir.
