-- CONT HUB - diagnostico somente leitura do Dashboard Operacional
-- Execute no SQL Editor do Supabase para validar fontes, RLS, privilegios e indices usados pelo painel.

with dashboard_tables(table_name) as (
  values
    ('clients'),
    ('client_payments'),
    ('accounting_obligations'),
    ('accounting_tax_records'),
    ('accounting_documents'),
    ('digital_certificates'),
    ('accounting_integrations'),
    ('accounting_sync_runs'),
    ('accounting_import_batches'),
    ('accounting_audit_logs'),
    ('fiscal_audit_logs'),
    ('nfe_dfe_sync_states'),
    ('employees')
)
select
  table_name,
  to_regclass('public.' || table_name) is not null as exists_in_public
from dashboard_tables
order by table_name;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'clients',
    'client_payments',
    'accounting_obligations',
    'accounting_tax_records',
    'accounting_documents',
    'digital_certificates',
    'accounting_integrations',
    'accounting_sync_runs',
    'accounting_import_batches',
    'accounting_audit_logs',
    'fiscal_audit_logs',
    'nfe_dfe_sync_states',
    'employees'
  )
order by c.relname;

select
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
    'clients',
    'client_payments',
    'accounting_obligations',
    'accounting_tax_records',
    'accounting_documents',
    'digital_certificates',
    'accounting_integrations',
    'accounting_sync_runs',
    'accounting_import_batches',
    'accounting_audit_logs',
    'fiscal_audit_logs',
    'nfe_dfe_sync_states',
    'employees'
  )
order by tablename, policyname;

select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'clients',
    'client_payments',
    'accounting_obligations',
    'accounting_tax_records',
    'accounting_documents',
    'digital_certificates',
    'accounting_integrations',
    'accounting_sync_runs',
    'accounting_import_batches',
    'accounting_audit_logs',
    'fiscal_audit_logs',
    'nfe_dfe_sync_states',
    'employees'
  )
order by table_name, grantee, privilege_type;

select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'clients',
    'client_payments',
    'accounting_obligations',
    'accounting_tax_records',
    'accounting_documents',
    'digital_certificates',
    'accounting_integrations',
    'accounting_sync_runs',
    'accounting_import_batches',
    'accounting_audit_logs',
    'fiscal_audit_logs',
    'nfe_dfe_sync_states',
    'employees'
  )
order by tablename, indexname;

select 'clients_without_organization' as check_name, count(*) as total
from public.clients
where organization_id is null
union all
select 'payments_without_organization', count(*)
from public.client_payments
where organization_id is null
union all
select 'obligations_without_organization', count(*)
from public.accounting_obligations
where organization_id is null
union all
select 'taxes_without_organization', count(*)
from public.accounting_tax_records
where organization_id is null
union all
select 'documents_without_organization', count(*)
from public.accounting_documents
where organization_id is null
union all
select 'certificates_without_organization', count(*)
from public.digital_certificates
where organization_id is null;

select
  organization_id,
  count(*) as active_clients
from public.clients
where active is true
group by organization_id
order by active_clients desc;

select
  organization_id,
  status,
  count(*) as total
from public.accounting_obligations
group by organization_id, status
order by organization_id, status;

select
  organization_id,
  status,
  count(*) as total
from public.accounting_tax_records
group by organization_id, status
order by organization_id, status;
