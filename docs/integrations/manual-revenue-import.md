# Receita Federal - Importacao manual gratuita

Esta modalidade permite que o contador acesse manualmente o portal e-CAC, baixe documentos disponiveis e envie os arquivos ao Cont Hub.

## Caracteristicas

- Nao usa API Serpro.
- Nao exige Consumer Key.
- Nao exige Consumer Secret.
- Nao reserva credito.
- Nao desconta carteira.
- Nao gera custo de API.
- Nao altera o fluxo de certificado digital.

## Formatos aceitos inicialmente

- PDF
- XML
- JSON
- CSV
- ZIP

A arquitetura fica preparada para XLSX e TXT, mas eles nao sao habilitados inicialmente.

## Fluxo

1. Contador entra em GOV > Receita Federal.
2. Seleciona `Importacao manual gratuita`.
3. Seleciona um ou varios arquivos.
4. O sistema gera uma previa.
5. O contador revisa cliente, tipo, competencia e status.
6. O contador confirma.
7. O backend salva os arquivos no Supabase Storage privado.
8. O sistema registra lote, hash, documento, origem e auditoria.

## ZIP

Ao processar ZIP, o backend:

- valida tamanho;
- bloqueia path traversal;
- bloqueia executaveis;
- bloqueia ZIP dentro de ZIP;
- calcula hash por documento;
- processa cada entrada individualmente.

## Identificacao

O sistema tenta identificar por texto nativo, XML, JSON, CSV, nome do arquivo, metadados e regex:

- CPF/CNPJ;
- razao social;
- tipo do documento;
- competencia;
- vencimento;
- valor;
- codigo de receita;
- recibo;
- protocolo;
- situacao;
- validade de certidao.

## Vinculo com cliente

- Um cliente encontrado: sugere vinculo automatico.
- Nenhum cliente: exige correcao manual.
- Multiplos clientes: exige selecao manual.

## Duplicidade

Duplicidade e bloqueada por hash SHA-256 por escritorio.

## Seguranca

Nao executar formulas de planilha. CSV Injection e marcado nas regras de seguranca para tratamento futuro de XLSX/CSV avancado.
