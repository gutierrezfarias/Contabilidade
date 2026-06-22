# CONT HUB - Testes Manuais P2/P3

Data: 2026-06-22

## Pre-requisito

Rodar no Supabase:

`supabase/migrations/20260622_client_portal_and_accounting_documents.sql`

## Documentos Contabeis

1. Entrar com usuario contador.
2. Acessar `/documentos-contabeis`.
3. Selecionar um cliente.
4. Preencher categoria, competencia, vencimento, descricao e arquivo PDF valido.
5. Clicar em `Salvar documento`.
6. Esperado: mensagem de sucesso e documento aparece na lista.
7. Clicar em `Baixar`.
8. Esperado: abre signed URL do Storage privado.
9. Usar filtros por cliente, categoria, status e busca por nome.
10. Esperado: lista respeita filtros e paginacao.
11. Clicar em `Substituir` e enviar outro arquivo valido.
12. Esperado: nova versao criada e anterior marcada como substituida.
13. Clicar em `Arquivar`.
14. Esperado: documento sai da lista padrao por exclusao logica.

## Validacoes de arquivo

1. Tentar enviar `.exe`, `.ps1`, `.js`, `.vbs`, `.xlsm`.
2. Esperado: sistema bloqueia.
3. Tentar enviar arquivo acima de 25 MB.
4. Esperado: sistema bloqueia.
5. Tentar arquivo com caminho no nome.
6. Esperado: sistema bloqueia.

## Portal do Cliente

1. Em `/documentos-contabeis`, selecionar um cliente.
2. Informar e-mail do usuario externo em `Portal do Cliente`.
3. Clicar em `Liberar acesso`.
4. Se o usuario ja existir no Supabase Auth, esperado: status `active`.
5. Se nao existir, esperado: status `invited`.
6. Criar/login com o mesmo e-mail.
7. Acessar `/portal`.
8. Esperado: visualizar somente documentos, impostos, obrigacoes e NF-es daquele cliente.
9. Baixar um documento.
10. Esperado: download funciona e acesso fica registrado em `client_portal_access_logs`.
11. Tentar acessar dados de outro cliente por troca manual de URL.
12. Esperado: nenhum dado de outro `client_id` aparece.

## Recuperacao de acesso

1. Em `/documentos-contabeis`, clicar em `Enviar redefinicao` no usuario do portal.
2. Esperado: Supabase Auth envia e-mail de redefinicao.

## Evidencias automaticas ja executadas

- `npm.cmd run lint`: passou.
- `npm.cmd run build`: passou.
- `dotnet build backend\nfe-api\ContHub.NfeApi.csproj -c Release --no-restore`: passou.
- `dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore`: passou com 127 testes.

## Pendencias para teste manual

- Execucao da migration no Supabase remoto.
- Criacao/verificacao do bucket privado `accounting-documents`.
- Teste real com usuario externo do portal.
- Teste real de RLS com dois clientes na mesma organizacao e com organizacoes diferentes.
