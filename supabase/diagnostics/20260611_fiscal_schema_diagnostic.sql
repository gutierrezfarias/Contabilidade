-- Diagnostico somente leitura da estrutura fiscal CONT HUB.
-- Rode no SQL Editor para verificar tabelas, RLS, policies e colunas essenciais.

with expected_tables(table_name) as (
  values
    ('fiscal_company_profiles'),
    ('fiscal_products'),
    ('fiscal_rules'),
    ('fiscal_rule_conflicts'),
    ('fiscal_audit_logs'),
    ('fiscal_import_jobs'),
    ('fiscal_import_job_rows'),
    ('fiscal_import_mapping_templates'),
    ('ncm_catalog')
)
select
  expected_tables.table_name,
  case when tables.table_name is null then 'MISSING' else 'OK' end as table_status,
  coalesce(classes.relrowsecurity, false) as rls_enabled,
  count(policies.policyname) as policy_count
from expected_tables
left join information_schema.tables tables
  on tables.table_schema = 'public'
 and tables.table_name = expected_tables.table_name
left join pg_class classes
  on classes.relname = expected_tables.table_name
 and classes.relnamespace = 'public'::regnamespace
left join pg_policies policies
  on policies.schemaname = 'public'
 and policies.tablename = expected_tables.table_name
group by expected_tables.table_name, tables.table_name, classes.relrowsecurity
order by expected_tables.table_name;

select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'fiscal_company_profiles',
    'fiscal_products',
    'fiscal_rules',
    'fiscal_rule_conflicts',
    'fiscal_audit_logs',
    'nfe_documents'
  )
  and column_name in (
    'organization_id',
    'client_id',
    'approval_status',
    'active',
    'product_id',
    'group_id',
    'conflict_key',
    'resolution_status',
    'origin',
    'metadata',
    'fiscal_validation_status',
    'fiscal_block_reason',
    'tax_preview_result',
    'fiscal_rule_ids'
  )
order by table_name, column_name;

select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename like 'fiscal_%'
order by tablename, policyname;
