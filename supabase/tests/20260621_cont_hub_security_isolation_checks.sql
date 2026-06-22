-- CONT HUB - read-only security/isolation checks.
-- Run after migrations. This does not insert, update or delete production data.

with target_tables(table_name, anon_should_have_any, authenticated_writable) as (
  values
    ('serpro_documents', false, false),
    ('serpro_requests', false, false),
    ('serpro_operation_locks', false, false),
    ('serpro_wallet_transactions', false, false),
    ('nfe_dfe_documents', false, false),
    ('nfe_dfe_events', false, false),
    ('nfe_dfe_sync_states', false, false),
    ('digital_certificates', false, false)
),
actual as (
  select
    target.table_name,
    bool_or(grants.grantee = 'anon') as anon_has_any,
    bool_or(
      grants.grantee = 'authenticated'
      and grants.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES')
    ) as authenticated_has_write
  from target_tables target
  left join information_schema.role_table_grants grants
    on grants.table_schema = 'public'
   and grants.table_name = target.table_name
   and grants.grantee in ('anon', 'authenticated')
  group by target.table_name
)
select
  'grant_expectations' as check_name,
  target.table_name,
  coalesce(actual.anon_has_any, false) = target.anon_should_have_any as anon_result,
  coalesce(actual.authenticated_has_write, false) = target.authenticated_writable as authenticated_write_result,
  coalesce(actual.anon_has_any, false) as anon_has_any,
  coalesce(actual.authenticated_has_write, false) as authenticated_has_write
from target_tables target
left join actual on actual.table_name = target.table_name
order by target.table_name;

select
  'rls_enabled_expectations' as check_name,
  class.relname as table_name,
  class.relrowsecurity as rls_enabled
from pg_class class
join pg_namespace namespace on namespace.oid = class.relnamespace
where namespace.nspname = 'public'
  and class.relkind = 'r'
  and class.relname in (
    'clients',
    'client_documents',
    'digital_certificates',
    'nfe_dfe_documents',
    'nfe_dfe_events',
    'nfe_dfe_sync_states',
    'nfe_dfe_logs',
    'serpro_documents',
    'serpro_requests',
    'serpro_operation_locks',
    'serpro_wallet_transactions'
  )
order by class.relname;

select
  'dfe_logical_duplicate_probe' as check_name,
  organization_id,
  client_id,
  access_key,
  count(*) as records
from public.nfe_dfe_documents
where to_regclass('public.nfe_dfe_documents') is not null
  and coalesce(access_key, '') <> ''
  and coalesce(active, true)
group by organization_id, client_id, access_key
having count(*) > 1
order by records desc, access_key;

select
  'dfe_identity_index_expected' as check_name,
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'nfe_dfe_documents'
      and indexname = 'nfe_dfe_documents_unique_org_client_access_key_idx'
      and indexdef ilike '%organization_id%'
      and indexdef ilike '%client_id%'
      and indexdef ilike '%access_key%'
      and indexdef not ilike '%schema_name%'
  ) as passed;

select
  'storage_private_bucket_presence' as check_name,
  exists (
    select 1
    from pg_class class
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'storage'
      and class.relname = 'objects'
  ) as storage_objects_catalog_exists;
