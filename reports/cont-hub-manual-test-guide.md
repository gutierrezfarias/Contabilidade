# CONT HUB - Manual Test Guide

Data: 2026-06-21

## 1. Autenticacao

1. Abrir `/`.
2. Ir para login.
3. Entrar com usuario cliente.
4. Confirmar redirecionamento para `/aplicativos`.
5. Tentar abrir `/admin` e confirmar bloqueio.
6. Entrar com admin e confirmar redirecionamento para `/admin`.

## 2. Cliente contabil

1. Abrir `/gestao-clientes`.
2. Criar cliente com CNPJ, telefone, CEP, endereco, bairro, cidade, UF e codigo IBGE.
3. Editar o cliente.
4. Importar documento CNPJ.
5. Confirmar anexo vinculado ao cliente.
6. Excluir somente registro de teste.

## 3. Certificado

1. Abrir aba Certificados.
2. Selecionar cliente.
3. Confirmar autopreenchimento basico.
4. Informar senha no campo atual.
5. Anexar `.pfx/.p12`.
6. Salvar.
7. Reabrir e confirmar senha/arquivo conforme fluxo atual.

## 4. SEFAZ/DF-e

1. Abrir `/gov/sefaz`.
2. Selecionar cliente e certificado ativo.
3. Confirmar ambiente/UF/senha/arquivo.
4. Executar status SEFAZ.
5. Executar Consulta Resumo.
6. Confirmar que cooldown aparece se aplicavel.
7. Baixar XML de documento retornado se houver.
8. Confirmar que emitidas exigem XML/importacao/chave/emissao pelo sistema.

## 5. NF-e emissao homologacao

1. Usar empresa credenciada em homologacao.
2. Preencher destinatario completo.
3. Preencher item com NCM, CFOP, CST/CSOSN, PIS/COFINS.
4. Rodar previa fiscal.
5. Gerar XML.
6. Assinar XML.
7. Validar XSD.
8. Transmitir somente em homologacao.
9. Verificar cStat/xMotivo/logs.

## 6. Fiscal

1. Abrir `/fiscal`.
2. Criar/editar perfil fiscal.
3. Criar produto fiscal.
4. Criar regra fiscal aprovada.
5. Rodar simulador.
6. Confirmar bloqueio quando produto/perfil/regra estiver incompleto.

## 7. Omnichannel

1. Abrir `/omnichannel`.
2. Cadastrar canal Telegram.
3. Ativar webhook pela interface.
4. Enviar mensagem ao bot.
5. Confirmar conversa na caixa de entrada.
6. Responder pela tela.

## 8. Admin

1. Abrir `/admin/clientes`.
2. Filtrar cliente.
3. Editar cliente e apps adquiridos.
4. Conferir isencao por app e geral.
5. Abrir `/admin/configuracoes`.
6. Editar home CMS.
7. Abrir `/admin/integracoes/serpro`.

