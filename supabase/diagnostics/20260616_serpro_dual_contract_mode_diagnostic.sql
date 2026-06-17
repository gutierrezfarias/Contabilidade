-- Diagnostico CONT HUB - Serpro dual contract mode.
-- Execute apos a migration 20260616_serpro_dual_contract_mode.sql.

select 'tables' as check_type, table_name, 'ok' as status
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'serpro_platform_contracts',
    'serpro_platform_credentials',
    'serpro_organization_settings',
    'serpro_organization_credentials',
    'serpro_service_catalog',
    'serpro_service_pricing',
    'serpro_organization_services',
    'serpro_client_authorizations',
    'serpro_wallets',
    'serpro_wallet_transactions',
    'serpro_requests',
    'serpro_request_attempts',
    'serpro_usage_records',
    'serpro_documents',
    'serpro_audit_logs'
  )
order by table_name;

select 'rls' as check_type, relname as table_name, relrowsecurity::text as status
from pg_class
where relnamespace = 'public'::regnamespace
  and relname like 'serpro_%'
order by relname;

select 'policies' as check_type, tablename as table_name, policyname as status
from pg_policies
where schemaname = 'public'
  and tablename like 'serpro_%'
order by tablename, policyname;

select 'catalog' as check_type, id as table_name, status::text
from public.serpro_service_catalog
order by id;

select 'pricing' as check_type, service_id as table_name, concat(environment::text, ' | custo=', provider_cost, ' | venda=', sale_price) as status
from public.serpro_service_pricing
order by service_id, environment;
