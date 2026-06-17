# Relatorio final - Serpro Dual-Mode - 2026-06-16

## Diagnostico atual

Antes desta implementacao, o Cont Hub tinha SEFAZ/NF-e, e-CAC visual, certificados digitais e multiempresa. Nao havia modulo Receita Federal/Serpro com contrato duplo, carteira, autorizacoes, precificacao ou consumo por escritorio.

## Arquitetura implementada

Foi adicionada uma camada Receita Federal/Serpro separada do modulo SEFAZ:

- banco Supabase com RLS;
- backend .NET para resolver contrato, credencial, carteira e auditoria;
- frontend Admin CONT HUB;
- frontend do contador;
- documentacao operacional;
- testes unitarios.

## Modalidades

### Modo CONT HUB gerenciado

- Usa contrato global Serpro da plataforma.
- Exige habilitacao do admin.
- Pode consumir carteira do escritorio.
- Permite calcular custo, venda e margem.

### Modo direto do contador

- O contador informa sua propria credencial Serpro.
- O Serpro cobra o contador.
- O Cont Hub registra configuracao, uso e auditoria.
- Nao debita carteira por chamada Serpro direta.

## Admin CONT HUB

Nova tela:

- `/admin/integracoes/serpro`

Permite:

- configurar contrato global;
- informar credenciais oficiais;
- habilitar modo gerenciado;
- visualizar catalogo inicial;
- visualizar precos/custos;
- visualizar quantidade de escritorios.

## Admin do contador

Nova tela:

- `/gov/receita-federal`

Permite:

- escolher modo de contrato;
- salvar configuracoes do escritorio;
- cadastrar credencial direta Serpro;
- habilitar servicos;
- visualizar carteira;
- visualizar autorizacoes/procuracoes;
- testar prontidao local.

## Credenciais

Consumer Secret nao e exibido apos salvar. O backend guarda:

- status de configuracao;
- referencia segura;
- fingerprint interno;
- auditoria.

## Certificados

O fluxo de certificado digital A1/PFX/P12 e a senha do certificado nao foram alterados. O modulo Serpro apenas referencia o certificado quando o servico oficial exigir.

## Autorizacoes

Criada estrutura `serpro_client_authorizations` para controlar procuracoes/autorizacoes por:

- escritorio;
- cliente;
- servico;
- status;
- validade;
- evidencia documental.

## Carteira, precificacao e consumo

Criadas tabelas de:

- carteira;
- transacoes;
- precos;
- custo;
- margem;
- requests;
- tentativas;
- uso.

## Servicos

Catalogo inicial criado:

- CND / CPEND;
- Situacao fiscal;
- Caixa postal / DTE;
- Procuracoes digitais;
- DCTFWeb;
- PER/DCOMP.

## Banco

Rodar:

- `supabase/migrations/20260616_serpro_dual_contract_mode.sql`

Depois conferir:

- `supabase/diagnostics/20260616_serpro_dual_contract_mode_diagnostic.sql`

## Endpoints

Principais endpoints novos:

- `/api/admin/serpro/*`
- `/api/serpro/*`
- `/api/revenue/*`

O proxy Vercel existente foi atualizado para encaminhar esses prefixos ao backend fiscal/Railway.

## Seguranca

Medidas aplicadas:

- RLS por `organization_id`;
- admin restrito por `user_roles`;
- segredo nao retorna ao frontend;
- logs sem senha/certificado/XML;
- chamadas reais bloqueadas quando provider oficial nao estiver configurado.

## Testes e build

Executado com sucesso:

- `npm.cmd run lint`
- `npm.cmd run build`
- `dotnet build backend\nfe-api\ContHub.NfeApi.csproj --no-restore`
- `dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore`

Resultado backend tests:

- 69 testes aprovados.

## Pendencias reais

1. Rodar a migration Serpro no Supabase.
2. Configurar variaveis no backend/Railway.
3. Cadastrar contrato/credenciais oficiais Serpro.
4. Implementar provider oficial de cada produto Serpro contratado com base na documentacao oficial.
5. Habilitar execucao real somente quando o provider oficial estiver pronto.
6. Implementar captura/reserva real de carteira quando chamada real for ativada.

## Proximos passos recomendados

1. Rodar SQL Serpro.
2. Abrir `/admin/integracoes/serpro` e preencher contrato global.
3. Abrir `/gov/receita-federal` com um contador e escolher o modo.
4. Configurar um unico servico inicial, preferencialmente CND/CPEND, com provider oficial.
5. Testar em homologacao antes de liberar producao.

## Confirmacao obrigatoria

Nao foi alterado o fluxo existente de certificado digital, arquivo PFX/P12 ou senha do certificado. Nenhuma senha gov.br foi criada, solicitada ou armazenada.
