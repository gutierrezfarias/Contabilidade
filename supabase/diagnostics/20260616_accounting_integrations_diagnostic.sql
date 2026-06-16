-- CONT HUB - Diagnostico da Central de Integracoes Contabeis.
-- Rode no SQL Editor do Supabase depois da migration 20260616_accounting_integrations.sql.

with expected_tables(table_name) as (
  values
    ('accounting_integrations'),
    ('accounting_integration_clients'),
    ('accounting_sync_runs'),
    ('accounting_sync_errors'),
    ('accounting_tax_records'),
    ('accounting_documents'),
    ('accounting_obligations'),
    ('accounting_payroll_records'),
    ('accounting_statements'),
    ('accounting_import_templates'),
    ('accounting_import_batches'),
    ('accounting_import_errors'),
    ('accounting_audit_logs')
)
select
  expected_tables.table_name,
  case when tables.table_name is null then 'FALTANDO' else 'OK' end as table_status,
  coalesce(classes.relrowsecurity, false) as rls_enabled,
  coalesce(policy_counts.policy_count, 0) as policy_count
from expected_tables
left join information_schema.tables tables
  on tables.table_schema = 'public'
 and tables.table_name = expected_tables.table_name
left join pg_class classes
  on classes.oid = to_regclass('public.' || expected_tables.table_name)
left join (
  select tablename, count(*) as policy_count
  from pg_policies
  where schemaname = 'public'
  group by tablename
) policy_counts
  on policy_counts.tablename = expected_tables.table_name
order by expected_tables.table_name;

select
  'accounting_integrations' as area,
  count(*) as total,
  count(*) filter (where active and deleted_at is null) as active_count,
  count(*) filter (where status = 'error') as error_count
from public.accounting_integrations;

select
  provider,
  record_type,
  file_format,
  count(*) as templates
from public.accounting_import_templates
group by provider, record_type, file_format
order by provider, record_type;

select
  'recent_sync_runs' as area,
  id,
  organization_id,
  provider,
  sync_type,
  status,
  started_at,
  finished_at,
  received_count,
  created_count,
  updated_count,
  error_count
from public.accounting_sync_runs
order by started_at desc
limit 20;
