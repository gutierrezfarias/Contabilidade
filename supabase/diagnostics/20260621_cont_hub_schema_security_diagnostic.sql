-- CONT HUB - read-only schema/security diagnostic.
-- Run in Supabase SQL Editor. This script only reads catalogs and information_schema.

with expected_tables(table_name, area) as (
  values
    ('user_roles', 'auth'),
    ('profiles', 'auth'),
    ('organizations', 'multiempresa'),
    ('organization_members', 'multiempresa'),
    ('admin_client_profiles', 'admin'),
    ('clients', 'contabil'),
    ('client_documents', 'contabil'),
    ('digital_certificates', 'certificado'),
    ('nfe_documents', 'nfe'),
    ('nfe_dfe_documents', 'dfe'),
    ('nfe_dfe_events', 'dfe'),
    ('nfe_dfe_sync_states', 'dfe'),
    ('nfe_dfe_logs', 'dfe'),
    ('nfe_sefaz_logs', 'nfe'),
    ('company_settings', 'configuracoes'),
    ('company_partners', 'configuracoes'),
    ('fiscal_profiles', 'fiscal'),
    ('fiscal_products', 'fiscal'),
    ('fiscal_rules', 'fiscal'),
    ('fiscal_audit_logs', 'fiscal'),
    ('serpro_documents', 'serpro'),
    ('serpro_requests', 'serpro'),
    ('serpro_operation_locks', 'serpro'),
    ('serpro_wallet_transactions', 'serpro'),
    ('omnichannel_channels', 'omnichannel'),
    ('home_settings', 'cms'),
    ('home_slides', 'cms'),
    ('home_banners', 'cms')
)
select
  'expected_tables' as diagnostic,
  area,
  table_name,
  to_regclass('public.' || table_name) is not null as exists
from expected_tables
order by area, table_name;

with expected_columns(table_name, column_name) as (
  values
    ('clients', 'organization_id'),
    ('clients', 'name'),
    ('clients', 'cnpj'),
    ('clients', 'cep'),
    ('clients', 'address'),
    ('clients', 'address_number'),
    ('clients', 'address_complement'),
    ('clients', 'neighborhood'),
    ('clients', 'city'),
    ('clients', 'state'),
    ('clients', 'tax_regime'),
    ('clients', 'company_size'),
    ('clients', 'main_cnae'),
    ('digital_certificates', 'organization_id'),
    ('digital_certificates', 'client_id'),
    ('digital_certificates', 'certificate_file_data'),
    ('digital_certificates', 'certificate_password'),
    ('digital_certificates', 'enabled_services'),
    ('nfe_dfe_documents', 'organization_id'),
    ('nfe_dfe_documents', 'client_id'),
    ('nfe_dfe_documents', 'access_key'),
    ('nfe_dfe_documents', 'schema_name'),
    ('nfe_dfe_documents', 'has_full_xml'),
    ('nfe_dfe_documents', 'xml_storage_path'),
    ('nfe_dfe_documents', 'nsu'),
    ('serpro_documents', 'organization_id'),
    ('serpro_requests', 'organization_id'),
    ('serpro_operation_locks', 'organization_id'),
    ('serpro_wallet_transactions', 'organization_id')
)
select
  'expected_columns' as diagnostic,
  expected.table_name,
  expected.column_name,
  columns.column_name is not null as exists,
  columns.data_type,
  columns.is_nullable
from expected_columns expected
left join information_schema.columns columns
  on columns.table_schema = 'public'
 and columns.table_name = expected.table_name
 and columns.column_name = expected.column_name
order by expected.table_name, expected.column_name;

select
  'rls_status' as diagnostic,
  namespace.nspname as schema_name,
  class.relname as table_name,
  class.relrowsecurity as rls_enabled,
  class.relforcerowsecurity as rls_forced
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
    'nfe_documents',
    'fiscal_profiles',
    'fiscal_products',
    'fiscal_rules',
    'fiscal_audit_logs',
    'serpro_documents',
    'serpro_requests',
    'serpro_operation_locks',
    'serpro_wallet_transactions',
    'company_settings'
  )
order by class.relname;

select
  'policies' as diagnostic,
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'clients',
    'client_documents',
    'digital_certificates',
    'nfe_dfe_documents',
    'nfe_dfe_events',
    'nfe_dfe_sync_states',
    'nfe_dfe_logs',
    'nfe_documents',
    'fiscal_profiles',
    'fiscal_products',
    'fiscal_rules',
    'fiscal_audit_logs',
    'serpro_documents',
    'serpro_requests',
    'serpro_operation_locks',
    'serpro_wallet_transactions',
    'company_settings'
  )
order by tablename, policyname;

select
  'role_table_grants' as diagnostic,
  grantee,
  table_schema,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role', 'postgres')
  and table_name in (
    'clients',
    'client_documents',
    'digital_certificates',
    'nfe_dfe_documents',
    'nfe_dfe_events',
    'nfe_dfe_sync_states',
    'nfe_dfe_logs',
    'nfe_documents',
    'fiscal_profiles',
    'fiscal_products',
    'fiscal_rules',
    'fiscal_audit_logs',
    'serpro_documents',
    'serpro_requests',
    'serpro_operation_locks',
    'serpro_wallet_transactions',
    'company_settings'
  )
order by table_name, grantee, privilege_type;

select
  'dfe_index_check' as diagnostic,
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and (
    tablename in ('nfe_dfe_documents', 'nfe_dfe_events', 'nfe_dfe_sync_states')
    or indexname in (
      'idx_nfe_dfe_documents_company_chave',
      'idx_nfe_dfe_documents_company_nsu',
      'nfe_dfe_documents_unique_org_client_access_key_idx',
      'nfe_dfe_documents_unique_logical_access_key_idx'
    )
  )
order by tablename, indexname;

select
  'old_conflicting_dfe_indexes' as diagnostic,
  indexname,
  case
    when indexname in ('idx_nfe_dfe_documents_company_chave', 'idx_nfe_dfe_documents_company_nsu')
      then 'drop_before_logical_identity'
    else 'review'
  end as recommended_action
from pg_indexes
where schemaname = 'public'
  and indexname in ('idx_nfe_dfe_documents_company_chave', 'idx_nfe_dfe_documents_company_nsu');

select
  'storage_buckets_catalog' as diagnostic,
  namespace.nspname as schema_name,
  class.relname as relation_name,
  class.relkind as relation_kind
from pg_class class
join pg_namespace namespace on namespace.oid = class.relnamespace
where namespace.nspname = 'storage'
  and class.relname in ('buckets', 'objects')
order by class.relname;

select
  'supabase_migrations_table' as diagnostic,
  to_regclass('supabase_migrations.schema_migrations') is not null as exists;
