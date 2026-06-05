# Auditoria NF-e / SEFAZ

Data: 2026-06-04

## Arquivos analisados

- `src/pages/accounting/gov/Sefaz.tsx`
- `src/services/sefazDocumentService.ts`
- `src/services/accountingRepository.ts`
- `api/sefaz/consultar-dfe.ts`
- `api/sefaz/consultar-chave.ts`
- `api/sefaz/manifestar.ts`
- `supabase/migrations/20260602_accounting_core_repair.sql`
- `supabase/migrations/20260603_sefaz_dfe_center.sql`

## Tabelas encontradas

- `public.clients`
- `public.digital_certificates`
- `public.certificate_services`
- `public.nfe_documents`
- `public.sefaz_sync_state`
- `public.organizations`
- `public.organization_members`
- `public.user_roles`

## Campos encontrados

### clients

- `id`, `organization_id`, `company_name`, `cnpj`, `phone`, `email`
- `cep`, `address`, `neighborhood`, `city`, `state`
- `tax_regime`, `company_size`, `main_cnae`, `legal_nature`
- `photo_data`, `is_monthly`, `monthly_fee`, `active`

### digital_certificates

- `id`, `organization_id`, `client_id`
- `certificate_type`, `holder_name`, `tax_id`
- `valid_from`, `valid_until`, `status`
- `serial_number`, `issuer`, `environment`, `state_uf`, `municipal_code`
- `secure_reference`, `certificate_password`
- `certificate_file_name`, `certificate_file_size`, `certificate_file_data`

### nfe_documents

- `id`, `organization_id`, `client_id`, `certificate_id`
- `access_key`, `number`, `series`, `issue_date`, `amount`, `status`
- `operation_type`, `recipient_name`, `recipient_document`, `description`
- `xml_url`, `danfe_url`
- Campos adicionados pela central DF-e: `document_model`, `document_direction`, `nsu`, `raw_xml`, `raw_summary`, `sefaz_status_code`, `last_consulted_at`, `manifestation_status`

### sefaz_sync_state

- `last_nsu`, `max_nsu`, `last_status_code`, `last_status_message`
- `last_success_at`, `last_error_at`, `last_error_message`

## Campos faltantes/recomendados

- `clients.state_registration`: Inscricao Estadual.
- `clients.municipal_registration`: Inscricao Municipal.
- `clients.city_ibge_code`: Codigo IBGE do municipio.
- `nfe_documents.webservice`: webservice fiscal usado na chamada.
- `nfe_documents.last_xmotivo`: ultimo motivo retornado.
- `nfe_documents.request_xml_path`: caminho do XML enviado.
- `nfe_documents.response_xml_path`: caminho do XML retornado.
- `nfe_documents.origem_consulta`: origem da nota: chave, dfe, importacao ou emissao.
- `nfe_sefaz_logs`: tabela separada para trilha tecnica de consultas/eventos.
- `nfe_nsu_control`: tabela compativel com controle de NSU pedido no escopo.
- `nfe_dfe_documents`: tabela compativel para documentos DF-e separados, caso queira separar de `nfe_documents`.

## SQL sugerido

Arquivo gerado:

`supabase/sql/required-nfe-schema.sql`

Esse SQL e incremental, nao apaga dados e usa:

- `create table if not exists`
- `alter table add column if not exists`
- indices `if not exists`
- policies criadas apenas quando ainda nao existem

## Impactos esperados

- A tela SEFAZ passa a mostrar pendencias claras antes de consultar, baixar, manifestar ou emitir.
- O status da integracao mostra ultimo NSU, cStat, xMotivo e erro tecnico salvo.
- O banco ganha estrutura opcional para logs e compatibilidade com controle DF-e separado.
- O fluxo atual continua usando `nfe_documents` e `sefaz_sync_state`.

## Pontos que continuam simulados/parciais

- Emissao real NF-e completa ainda nao autoriza nota na SEFAZ. Hoje a tela salva rascunho.
- DANFE e exibido quando existe XML salvo ou `danfe_url`.
- Consulta por chave valida status/protocolo da NF-e, mas nao baixa automaticamente o XML completo.
- Relatorios, etiquetas e envio em lote ainda sao acoes de UI preparadas.

## Proximos passos para backend SEFAZ 100% real

1. Implementar autorizacao NF-e: montar XML 4.00, assinar, validar XSD, chamar `NFeAutorizacao4`, consultar recibo e salvar protocolo.
2. Gravar XML autorizado e XML de retorno em Storage privado.
3. Persistir logs em `nfe_sefaz_logs` a cada chamada.
4. Implementar download de XML/DANFE a partir dos documentos autorizados.
5. Implementar eventos restantes: cancelamento, carta de correcao e inutilizacao.
6. Evoluir senha/certificado para cofre server-side criptografado.

