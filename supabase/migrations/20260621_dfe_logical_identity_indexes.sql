-- CONT HUB - DF-e logical identity indexes.
-- Safe/idempotent: does not delete data. It stops if logical duplicates already exist.
-- Identity rule: one NF-e document per organization_id + client_id + access_key.
-- schema_name is document metadata and must not be part of the logical NF-e identity.

do $$
declare
  duplicate_count integer := 0;
begin
  if to_regclass('public.nfe_dfe_documents') is null then
    raise notice 'public.nfe_dfe_documents does not exist yet; skipping DF-e logical identity indexes.';
    return;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'nfe_dfe_documents'
      and column_name in ('organization_id', 'client_id', 'access_key')
    group by table_schema, table_name
    having count(*) = 3
  ) then
    raise notice 'public.nfe_dfe_documents does not have organization_id/client_id/access_key columns; skipping.';
    return;
  end if;

  select count(*)
    into duplicate_count
  from (
    select organization_id, client_id, access_key
    from public.nfe_dfe_documents
    where coalesce(access_key, '') <> ''
      and coalesce(active, true)
    group by organization_id, client_id, access_key
    having count(*) > 1
  ) duplicated;

  if duplicate_count > 0 then
    raise exception
      'DF-e duplicate logical documents found. Review duplicates before creating nfe_dfe_documents_unique_org_client_access_key_idx.';
  end if;

  drop index if exists public.idx_nfe_dfe_documents_company_chave;
  drop index if exists public.idx_nfe_dfe_documents_company_nsu;
  drop index if exists public.nfe_dfe_documents_unique_schema_access_key_idx;
  drop index if exists public.nfe_dfe_documents_unique_nsu_schema_idx;

  create unique index if not exists nfe_dfe_documents_unique_org_client_access_key_idx
    on public.nfe_dfe_documents (organization_id, client_id, access_key)
    where coalesce(access_key, '') <> ''
      and coalesce(active, true);

  create index if not exists nfe_dfe_documents_org_client_nsu_idx
    on public.nfe_dfe_documents (organization_id, client_id, nsu)
    where coalesce(nsu, '') <> '';

  create index if not exists nfe_dfe_documents_org_client_direction_issue_idx
    on public.nfe_dfe_documents (organization_id, client_id, direction, issue_date desc);
end $$;

notify pgrst, 'reload schema';
