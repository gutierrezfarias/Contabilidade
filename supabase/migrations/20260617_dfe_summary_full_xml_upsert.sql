-- CONT HUB - DF-e summary/full XML idempotency guard.
-- Ensures one logical NF-e record per organization/client/access_key.
-- Non-destructive: if duplicates already exist, this migration stops and asks for manual reconciliation.

do $$
declare
  duplicate_count integer := 0;
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'nfe_dfe_documents'
  ) then
    raise notice 'public.nfe_dfe_documents does not exist yet; skipping DF-e logical index.';
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
    raise notice 'public.nfe_dfe_documents does not have organization_id/client_id/access_key columns; skipping DF-e logical index.';
    return;
  end if;

  select count(*)
    into duplicate_count
  from (
    select organization_id, client_id, access_key
    from public.nfe_dfe_documents
    where coalesce(access_key, '') <> ''
    group by organization_id, client_id, access_key
    having count(*) > 1
  ) duplicated;

  if duplicate_count > 0 then
    raise exception
      'DF-e duplicate logical documents found. Review duplicates before creating nfe_dfe_documents_unique_logical_access_key_idx.';
  end if;

  create unique index if not exists nfe_dfe_documents_unique_logical_access_key_idx
    on public.nfe_dfe_documents (organization_id, client_id, access_key)
    where access_key <> '';
end $$;

notify pgrst, 'reload schema';
