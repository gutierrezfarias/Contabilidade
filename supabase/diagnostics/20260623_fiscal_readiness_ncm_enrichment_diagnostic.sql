-- CONT HUB - diagnostico somente leitura da migration fiscal/NCM 20260623.
-- Seguro para executar no SQL Editor do Supabase.
-- Nao executa DDL, INSERT, UPDATE, DELETE, TRUNCATE ou chamada de funcao mutavel.

select
  'migration_objects_overview' as section,
  expected.object_type,
  expected.object_name,
  case
    when expected.object_type = 'table'
      then to_regclass(format('public.%I', expected.object_name)) is not null
    when expected.object_type = 'function'
      then exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = expected.object_name
      )
    when expected.object_type = 'trigger'
      then exists (
        select 1
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'ncm_catalog'
          and t.tgname = expected.object_name
          and not t.tgisinternal
      )
    when expected.object_type = 'index'
      then to_regclass(format('public.%I', expected.object_name)) is not null
    else false
  end as exists
from (
  values
    ('table', 'ncm_catalog'),
    ('table', 'ncm_sync_jobs'),
    ('table', 'fiscal_company_profiles'),
    ('table', 'fiscal_field_sources'),
    ('function', 'cont_hub_digits'),
    ('function', 'cont_hub_format_ncm'),
    ('function', 'cont_hub_search_text'),
    ('function', 'normalize_ncm_catalog_fields'),
    ('trigger', 'normalize_ncm_catalog_fields_trigger'),
    ('index', 'ncm_catalog_normalized_code_uidx'),
    ('index', 'ncm_catalog_description_search_idx'),
    ('index', 'ncm_catalog_active_normalized_idx'),
    ('index', 'ncm_sync_jobs_single_running_idx'),
    ('index', 'fiscal_field_sources_org_client_idx'),
    ('index', 'fiscal_field_sources_profile_idx')
) as expected(object_type, object_name)
order by expected.object_type, expected.object_name;

select
  'column_inventory' as section,
  c.table_name,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in (
    'ncm_catalog',
    'ncm_sync_jobs',
    'fiscal_company_profiles',
    'fiscal_field_sources'
  )
order by c.table_name, c.ordinal_position;

select
  'constraints' as section,
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  string_agg(kcu.column_name, ', ' order by kcu.ordinal_position) as columns
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on kcu.constraint_schema = tc.constraint_schema
 and kcu.constraint_name = tc.constraint_name
 and kcu.table_schema = tc.table_schema
 and kcu.table_name = tc.table_name
where tc.table_schema = 'public'
  and tc.table_name in (
    'ncm_catalog',
    'ncm_sync_jobs',
    'fiscal_company_profiles',
    'fiscal_field_sources'
  )
group by tc.table_name, tc.constraint_name, tc.constraint_type
order by tc.table_name, tc.constraint_type, tc.constraint_name;

select
  'indexes' as section,
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'ncm_catalog',
    'ncm_sync_jobs',
    'fiscal_company_profiles',
    'fiscal_field_sources'
  )
order by tablename, indexname;

select
  'functions' as section,
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as result_type,
  p.provolatile as volatility,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'cont_hub_digits',
    'cont_hub_format_ncm',
    'cont_hub_search_text',
    'normalize_ncm_catalog_fields'
  )
order by p.proname;

select
  'triggers' as section,
  n.nspname as schema_name,
  c.relname as table_name,
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid) as trigger_definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'ncm_catalog',
    'ncm_sync_jobs',
    'fiscal_company_profiles',
    'fiscal_field_sources'
  )
  and not t.tgisinternal
order by c.relname, t.tgname;

select
  'rls_status' as section,
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'ncm_catalog',
    'ncm_sync_jobs',
    'fiscal_company_profiles',
    'fiscal_field_sources'
  )
order by c.relname;

select
  'rls_policies' as section,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'ncm_catalog',
    'ncm_sync_jobs',
    'fiscal_company_profiles',
    'fiscal_field_sources'
  )
order by tablename, policyname;

select
  'grants' as section,
  table_schema,
  table_name,
  grantee,
  privilege_type,
  is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'ncm_catalog',
    'ncm_sync_jobs',
    'fiscal_company_profiles',
    'fiscal_field_sources'
  )
  and grantee in ('anon', 'authenticated', 'service_role', 'postgres')
order by table_name, grantee, privilege_type;

select
  'ncm_catalog_counts' as section,
  count(*) as total_records,
  count(*) filter (where is_active) as active_records,
  count(*) filter (where not is_active) as inactive_records,
  count(*) filter (where normalized_code is null or normalized_code = '') as missing_normalized_code,
  count(*) filter (where description is null or btrim(description) = '') as missing_description,
  count(*) filter (where normalized_code like '0%') as records_with_initial_zero,
  min(imported_at) as first_imported_at,
  max(imported_at) as last_imported_at,
  max(updated_at) as last_updated_at
from public.ncm_catalog;

select
  'ncm_latest_sync' as section,
  id,
  status,
  total_codes,
  inserted_codes,
  updated_codes,
  rejected_codes,
  source,
  source_version,
  duration_ms,
  error_message,
  created_at,
  started_at,
  finished_at
from public.ncm_sync_jobs
order by created_at desc
limit 5;

select
  'ncm_known_code_01023911' as section,
  id,
  code,
  normalized_code,
  formatted_code,
  description,
  description_search,
  source,
  source_version,
  imported_at,
  is_active,
  case
    when normalized_code = '01023911'
     and formatted_code = '0102.39.11'
     and normalized_code like '0%'
    then true
    else false
  end as zero_initial_preserved
from public.ncm_catalog
where normalized_code = '01023911'
   or code = '0102.39.11'
   or formatted_code = '0102.39.11'
order by updated_at desc nulls last;

select
  'ncm_duplicates' as section,
  normalized_code,
  count(*) as duplicate_count,
  array_agg(id::text order by id::text) as ids
from public.ncm_catalog
where normalized_code is not null
  and normalized_code <> ''
group by normalized_code
having count(*) > 1
order by duplicate_count desc, normalized_code
limit 50;

select
  'ncm_invalid_records' as section,
  id,
  code,
  normalized_code,
  formatted_code,
  description,
  case
    when normalized_code is null or normalized_code = '' then 'missing_normalized_code'
    when normalized_code !~ '^[0-9]{8}$' then 'invalid_normalized_code'
    when description is null or btrim(description) = '' then 'missing_description'
    else 'unknown'
  end as issue
from public.ncm_catalog
where normalized_code is null
   or normalized_code = ''
   or normalized_code !~ '^[0-9]{8}$'
   or description is null
   or btrim(description) = ''
order by updated_at desc nulls last
limit 100;

select
  'ncm_zero_initial_samples' as section,
  id,
  code,
  normalized_code,
  formatted_code,
  description
from public.ncm_catalog
where normalized_code like '0%'
order by normalized_code
limit 25;
