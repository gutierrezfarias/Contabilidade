-- Diagnostico somente leitura - auditoria fiscal completa CONT HUB.
-- Rode no SQL Editor depois da migration 20260623_fiscal_audit_completion.sql.

with expected_columns(column_name, expected_type) as (
  values
    ('organization_id', 'uuid'),
    ('client_id', 'uuid'),
    ('created_by', 'uuid'),
    ('entity_type', 'text'),
    ('entity_id', 'uuid'),
    ('action', 'text'),
    ('old_data', 'jsonb'),
    ('new_data', 'jsonb'),
    ('changed_fields', 'jsonb'),
    ('origin', 'text'),
    ('correlation_id', 'text'),
    ('metadata', 'jsonb'),
    ('created_at', 'timestamp with time zone')
)
select
  '01_columns' as diagnostic,
  expected_columns.column_name,
  expected_columns.expected_type,
  columns.data_type,
  case
    when columns.column_name is null then 'MISSING'
    when columns.data_type = expected_columns.expected_type then 'OK'
    else 'TYPE_MISMATCH'
  end as status
from expected_columns
left join information_schema.columns columns
  on columns.table_schema = 'public'
 and columns.table_name = 'fiscal_audit_logs'
 and columns.column_name = expected_columns.column_name
order by expected_columns.column_name;

select
  '02_rls' as diagnostic,
  classes.relname as table_name,
  classes.relrowsecurity as rls_enabled,
  classes.relforcerowsecurity as force_rls
from pg_class classes
where classes.oid = 'public.fiscal_audit_logs'::regclass;

select
  '03_policies' as diagnostic,
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'fiscal_audit_logs'
order by policyname;

select
  '04_privileges' as diagnostic,
  grantee,
  privilege_type,
  is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'fiscal_audit_logs'
  and grantee in ('anon', 'authenticated', 'service_role', 'postgres')
order by grantee, privilege_type;

select
  '05_unexpected_frontend_write_grants' as diagnostic,
  grantee,
  privilege_type,
  case
    when grantee = 'anon' then 'BLOCK'
    when grantee = 'authenticated' and privilege_type <> 'SELECT' then 'BLOCK'
    else 'OK'
  end as status
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'fiscal_audit_logs'
  and (
    grantee = 'anon'
    or (grantee = 'authenticated' and privilege_type <> 'SELECT')
  )
order by grantee, privilege_type;

with expected_functions(function_name) as (
  values
    ('cont_hub_sanitize_fiscal_audit_data'),
    ('cont_hub_jsonb_changed_fields'),
    ('cont_hub_validate_fiscal_audit_log'),
    ('log_fiscal_table_change'),
    ('approve_fiscal_profile'),
    ('reject_fiscal_profile'),
    ('approve_fiscal_rule'),
    ('reject_fiscal_rule')
)
select
  '06_functions' as diagnostic,
  expected_functions.function_name,
  case when routines.routine_name is null then 'MISSING' else 'OK' end as status,
  routines.security_type
from expected_functions
left join information_schema.routines routines
  on routines.specific_schema = 'public'
 and routines.routine_name = expected_functions.function_name
order by expected_functions.function_name;

with expected_triggers(table_name, trigger_name) as (
  values
    ('fiscal_audit_logs', 'fiscal_audit_logs_integrity_trigger'),
    ('fiscal_company_profiles', 'fiscal_profile_audit_trigger'),
    ('fiscal_products', 'fiscal_product_audit_trigger'),
    ('fiscal_product_groups', 'fiscal_product_group_audit_trigger'),
    ('fiscal_operation_types', 'fiscal_operation_type_audit_trigger'),
    ('fiscal_benefits', 'fiscal_benefit_audit_trigger'),
    ('custom_cfops', 'custom_cfop_audit_trigger'),
    ('fiscal_rules', 'fiscal_rule_audit_trigger'),
    ('fiscal_rule_versions', 'fiscal_rule_version_audit_trigger'),
    ('fiscal_rule_conflicts', 'fiscal_conflict_audit_trigger'),
    ('fiscal_simulations', 'fiscal_simulation_audit_trigger')
)
select
  '07_triggers' as diagnostic,
  expected_triggers.table_name,
  expected_triggers.trigger_name,
  case when triggers.trigger_name is null then 'MISSING' else 'OK' end as status,
  triggers.action_timing,
  triggers.event_manipulation
from expected_triggers
left join information_schema.triggers triggers
  on triggers.event_object_schema = 'public'
 and triggers.event_object_table = expected_triggers.table_name
 and triggers.trigger_name = expected_triggers.trigger_name
order by expected_triggers.table_name, expected_triggers.trigger_name, triggers.event_manipulation;

select
  '08_invalid_client_scope' as diagnostic,
  count(*) as invalid_rows
from public.fiscal_audit_logs logs
left join public.clients clients
  on clients.id = logs.client_id
where logs.client_id is not null
  and (
    clients.id is null
    or clients.organization_id <> logs.organization_id
  );

select
  '09_sensitive_payload_probe' as diagnostic,
  public.cont_hub_sanitize_fiscal_audit_data(
    jsonb_build_object(
      'senha', '123456',
      'token', 'abc',
      'xml', '<xml>conteudo</xml>',
      'cnpj', '00.000.000/0000-00',
      'nested', jsonb_build_object('password', 'secret', 'safe', 'ok')
    )
  ) as sanitized_sample;

select
  '10_recent_audit_shape' as diagnostic,
  id,
  organization_id,
  client_id,
  entity_type,
  entity_id,
  action,
  changed_fields,
  origin,
  correlation_id,
  created_by,
  created_at
from public.fiscal_audit_logs
order by created_at desc
limit 20;

