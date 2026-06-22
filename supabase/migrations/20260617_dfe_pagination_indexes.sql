-- CONT HUB - Indices auxiliares para paginacao e filtros da listagem SEFAZ/DF-e.
-- Idempotente, nao altera dados e nao remove objetos existentes.

create index if not exists nfe_dfe_documents_active_direction_issue_page_idx
  on public.nfe_dfe_documents (
    organization_id,
    client_id,
    direction,
    issue_date desc,
    created_at desc
  )
  where active = true;

create index if not exists nfe_dfe_documents_active_xml_issue_page_idx
  on public.nfe_dfe_documents (
    organization_id,
    client_id,
    direction,
    has_full_xml,
    issue_date desc,
    created_at desc
  )
  where active = true;

create index if not exists nfe_dfe_documents_active_manifestation_page_idx
  on public.nfe_dfe_documents (
    organization_id,
    client_id,
    direction,
    manifestation_status,
    issue_date desc,
    created_at desc
  )
  where active = true;

create index if not exists nfe_dfe_documents_active_value_page_idx
  on public.nfe_dfe_documents (
    organization_id,
    client_id,
    direction,
    total_value desc,
    created_at desc
  )
  where active = true;

create index if not exists nfe_dfe_documents_active_issuer_page_idx
  on public.nfe_dfe_documents (
    organization_id,
    client_id,
    direction,
    issuer_name,
    created_at desc
  )
  where active = true;
