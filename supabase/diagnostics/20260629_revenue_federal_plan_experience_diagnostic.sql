-- Diagnostico somente leitura: planos e agente local Receita Federal / SERPRO.

select table_name, is_insertable_into
from information_schema.tables
where table_schema = 'public'
  and table_name in ('serpro_contract_plans', 'serpro_local_agents')
order by table_name;

select code, commercial_name, monthly_price, active, display_order,
       cardinality(allowed_service_ids) as allowed_services
from public.serpro_contract_plans
order by display_order, commercial_name;

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('serpro_organization_settings', 'serpro_service_catalog', 'serpro_client_authorizations')
  and column_name in (
    'plan_code', 'supports_local_agent', 'supports_manual_import', 'consumes_credit',
    'certificate_id', 'last_validated_at', 'pending_reason'
  )
order by table_name, ordinal_position;

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('serpro_contract_plans', 'serpro_local_agents')
order by tablename, policyname;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('serpro_contract_plans', 'serpro_local_agents')
  and grantee in ('anon', 'authenticated', 'service_role', 'postgres')
order by table_name, grantee, privilege_type;

select plan_code, count(*) as organizations
from public.serpro_organization_settings
group by plan_code
order by plan_code;
