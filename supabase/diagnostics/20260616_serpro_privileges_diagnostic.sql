-- CONT HUB - Diagnostico de privilegios Serpro.
-- Rode apos 20260616_serpro_least_privilege_grants.sql.

with target_tables(table_schema, table_name) as (
  values
    ('public', 'serpro_documents'),
    ('public', 'serpro_requests'),
    ('public', 'serpro_operation_locks'),
    ('public', 'serpro_wallet_transactions')
),
target_roles(role_name) as (
  values
    ('anon'),
    ('authenticated'),
    ('service_role'),
    ('postgres')
),
expected as (
  select
    tr.role_name,
    tt.table_schema,
    tt.table_name,
    case
      when tr.role_name = 'anon' then array[]::text[]
      when tr.role_name = 'authenticated' and tt.table_name = 'serpro_operation_locks' then array[]::text[]
      when tr.role_name = 'authenticated' then array['SELECT']::text[]
      else array['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]
    end as expected_privileges
  from target_roles tr
  cross join target_tables tt
),
actual as (
  select
    grantee as role_name,
    table_schema,
    table_name,
    array_agg(privilege_type::text order by privilege_type::text) as actual_privileges
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in (
      'serpro_documents',
      'serpro_requests',
      'serpro_operation_locks',
      'serpro_wallet_transactions'
    )
    and grantee in ('anon', 'authenticated', 'service_role', 'postgres')
  group by grantee, table_schema, table_name
)
select
  e.role_name,
  e.table_schema,
  e.table_name,
  e.expected_privileges,
  coalesce(a.actual_privileges, array[]::text[]) as actual_privileges,
  coalesce(a.actual_privileges, array[]::text[]) = e.expected_privileges as ok
from expected e
left join actual a
  on a.role_name = e.role_name
 and a.table_schema = e.table_schema
 and a.table_name = e.table_name
order by e.table_name, e.role_name;

-- Resumo apenas dos itens fora do esperado.
with grants as (
  select
    grantee,
    table_name,
    privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in (
      'serpro_documents',
      'serpro_requests',
      'serpro_operation_locks',
      'serpro_wallet_transactions'
    )
    and grantee in ('anon', 'authenticated')
)
select *
from grants
where grantee = 'anon'
   or privilege_type in ('DELETE', 'INSERT', 'REFERENCES', 'TRIGGER', 'TRUNCATE', 'UPDATE')
   or (grantee = 'authenticated' and table_name = 'serpro_operation_locks')
order by table_name, grantee, privilege_type;
