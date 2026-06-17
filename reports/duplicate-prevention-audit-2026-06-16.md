# Auditoria de duplicidade - Receita Federal, Serpro e importacao manual

Data: 2026-06-16

## Resumo executivo

A auditoria confirmou que a importacao manual ja tinha uma protecao inicial por hash SHA-256 do conteudo do arquivo, incluindo arquivos extraidos de ZIP. Essa protecao ja cobria reenvio do mesmo arquivo com outro nome.

Porem, antes desta correcao, o modulo ainda nao tinha protecao completa por identificador externo oficial, chave logica estavel, idempotency_key para requisicoes Serpro, lock operacional, nem constraints de carteira suficientes para impedir captura/reserva duplicada.

Foi criada uma migration complementar nao destrutiva para reforcar banco e backend.

## Onde ja existia protecao

- Importacao manual calculava hash SHA-256 do conteudo do arquivo.
- ZIP era expandido e cada arquivo interno era processado individualmente.
- ZIP bloqueava path traversal e arquivos perigosos.
- Frontend desabilitava botoes durante preview/confirmacao com `manualLoading`.
- Carteira considerava saldo reservado na validacao de saldo disponivel.
- Fluxo Serpro atual ainda nao executa chamada real faturavel; ele registra solicitacao bloqueada quando provider oficial nao esta habilitado.

## Onde nao existia protecao suficiente

- Nao havia `idempotency_key` em `serpro_requests`.
- Nao havia `request_payload_hash` em `serpro_requests`.
- Nao havia unique constraint para evitar requisicoes repetidas por mesma organizacao, cliente, servico, ambiente e payload.
- Nao havia tabela de lock operacional para concorrencia.
- Nao havia `external_id`, `document_hash` e `logical_key` em `serpro_documents`.
- Nao havia unique constraint para documento por `external_id`, `document_hash`, `protocol_number` e `logical_key`.
- Carteira nao tinha chave unica por transacao/reserva/captura.
- Importacao manual ainda dependia somente do hash do arquivo para detectar duplicidade.

## Correcoes implementadas

### Banco de dados

Criada migration:

- `supabase/migrations/20260616_duplicate_prevention_serpro_revenue.sql`

Ela adiciona:

- `serpro_requests.idempotency_key`
- `serpro_requests.request_payload_hash`
- `serpro_requests.locked_until`
- `serpro_requests.retry_of_request_id`
- `serpro_requests.result_valid_until`
- `serpro_documents.external_id`
- `serpro_documents.document_hash`
- `serpro_documents.logical_key`
- `serpro_documents.external_updated_at`
- `serpro_wallet_transactions.idempotency_key`
- `serpro_wallet_transactions.captured_from_transaction_id`
- tabela `serpro_operation_locks`

Constraints/indices criados:

- `serpro_requests_idempotency_unique_idx`
- `serpro_requests_active_payload_unique_idx`
- `serpro_requests_correlation_unique_idx`
- `serpro_operation_locks_active_key_unique_idx`
- `serpro_wallet_transactions_idempotency_unique_idx`
- `serpro_wallet_transactions_once_per_request_type_idx`
- `serpro_documents_external_id_unique_idx`
- `serpro_documents_document_hash_unique_idx`
- `serpro_documents_protocol_unique_idx`
- `serpro_documents_logical_key_unique_idx`

### Backend

Arquivos alterados/criados nesta etapa:

- `backend/nfe-api/Models/SerproModels.cs`
- `backend/nfe-api/Services/ManualRevenueImportRules.cs`
- `backend/nfe-api/Services/ManualRevenueImportService.cs`
- `backend/nfe-api/Services/SerproDomainRules.cs`
- `backend/nfe-api/Services/SupabaseSerproRepository.cs`
- `backend/nfe-api.tests/DuplicatePreventionRulesTests.cs`
- `supabase/migrations/20260616_duplicate_prevention_serpro_revenue.sql`

Implementado:

- Geração de `external_id` manual quando existir protocolo ou recibo.
- Geração de `logical_key` manual por organizacao, cliente/tax_id, provider, tipo, competencia, vencimento, valor e external_id.
- Consulta de duplicidade manual por `file_hash`, `document_hash`, `external_id` ou `logical_key`.
- Persistencia de `document_hash`, `external_id` e `logical_key`.
- Geração de `request_payload_hash` para Serpro.
- Geração/reuso de `idempotency_key` para requisicoes Serpro.
- Reutilizacao de requisicao existente quando a mesma operacao for enviada novamente.
- Funcoes de chave para carteira/reserva/captura.

## Estrategia manual

Ordem aplicada:

1. Identificador externo oficial quando existe: protocolo ou recibo.
2. Hash SHA-256 do conteudo do arquivo.
3. Chave logica estavel quando nao existe identificador oficial.

O nome do arquivo nao e usado como criterio principal. Arquivo renomeado continua duplicado porque o hash e calculado pelo conteudo.

ZIP:

- Hash e calculado por arquivo interno.
- Arquivo interno repetido em outro ZIP continua duplicado.
- Path traversal e bloqueado.
- Executaveis/scripts sao bloqueados.
- Limite de tamanho por arquivo e por ZIP e aplicado.

## Estrategia automatica

Foi preparada a base para idempotencia real:

- `idempotency_key`
- `request_payload_hash`
- `correlation_id`
- tabela de lock operacional
- unique index por escopo ativo

O backend passa a consultar requisicao existente antes de criar nova solicitacao.

Observacao: chamadas reais pagas ao Serpro continuam nao implementadas/nao executadas neste backend; portanto nao houve chamada externa paga nos testes.

## Estrategia da carteira

Foram adicionadas travas de banco para:

- uma mesma transacao por `idempotency_key`;
- uma reserva/captura/liberacao/reembolso por `request_id` e tipo.

Como o fluxo atual ainda nao captura credito em chamada real, a protecao ficou preparada para quando o provider Serpro real for ativado.

## Testes adicionados

Arquivo:

- `backend/nfe-api.tests/DuplicatePreventionRulesTests.cs`

Coberturas principais:

- Mesmo CSV duas vezes.
- Mesmo JSON duas vezes.
- Mesmo PDF duas vezes.
- Mesmo arquivo com outro nome.
- Mesmo documento dentro de ZIPs diferentes.
- Mesmo registro em organizacoes diferentes.
- Mesmo registro para clientes diferentes.
- Mesma idempotency_key.
- Duplo clique por mesma chave de operacao.
- Retry por timeout.
- Retry por erro.
- Documento retornado com mesmo protocolo.
- Chave de carteira para reserva/captura.
- Bloqueio de CSV Injection.
- Bloqueio de path traversal.
- Presenca das constraints na migration.

## Resultado da validacao

Comandos executados:

- `dotnet build backend\nfe-api\ContHub.NfeApi.csproj --no-restore`
- `dotnet test backend\nfe-api.tests\ContHub.NfeApi.Tests.csproj --no-restore`
- `npm.cmd run lint`
- `npm.cmd run build`

Resultado:

- Backend build: passou.
- Backend tests: passou, 105 testes.
- Frontend lint: passou.
- Frontend build: passou.

## Riscos restantes

- A idempotencia automatica esta preparada, mas o provider Serpro real ainda nao executa chamadas externas faturaveis.
- A carteira ainda nao faz reserva/captura real nesse fluxo, portanto a protecao de debito duplicado esta pronta no banco, mas ainda precisa ser integrada ao provider real quando ele existir.
- A importacao manual identifica CPF/CNPJ, mas o vinculo automatico atual depende dos dados existentes do cliente; se nao houver CPF/CNPJ cadastrado no cliente, o usuario precisa corrigir na previa.
- A chave logica pode bloquear documentos realmente iguais em tipo, competencia, vencimento e valor para o mesmo cliente quando nao houver identificador externo; nesse caso o fluxo deve tratar como conflito/revisao em evolucao futura.

## Certificado digital

A senha do certificado digital, o fluxo PFX/P12 e a exibicao atual da senha nao foram alterados.

## Conclusao

A carga manual agora possui protecao por hash, external_id e logical_key.

A carga automatica agora possui base concreta de idempotencia no banco e no backend antes de criar nova requisicao.

A carteira agora possui constraints para impedir reserva/captura duplicada quando o fluxo real de cobranca for ligado.
