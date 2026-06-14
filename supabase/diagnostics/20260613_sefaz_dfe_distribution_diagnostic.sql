-- CONT HUB - diagnostico da estrutura DF-e.
-- Rode depois da migration de compatibilidade para conferir tabelas, colunas, FKs, indices, RLS, policies, triggers e bucket.
-- Este script nao altera dados permanentes; usa apenas tabelas temporarias de diagnostico.

create temp table if not exists cont_hub_dfe_table_counts (
  table_name text primary key,
  table_exists boolean not null,
  row_count bigint
) on commit drop;

truncate table cont_hub_dfe_table_counts;

do $$
declare
  table_item text;
  count_value bigint;
begin
  foreach table_item in array array[
    'nfe_dfe_sync_states',
    'nfe_dfe_documents',
    'nfe_dfe_events',
    'nfe_dfe_sync_logs',
    'nfe_dfe_access_logs'
  ]
  loop
    if to_regclass(format('public.%I', table_item)) is not null then
      execute format('select count(*) from public.%I', table_item) into count_value;
      insert into cont_hub_dfe_table_counts values (table_item, true, count_value);
    else
      insert into cont_hub_dfe_table_counts values (table_item, false, null);
    end if;
  end loop;
end $$;

select
  '01_tabelas_e_quantidade' as diagnostico,
  table_name,
  table_exists,
  row_count
from cont_hub_dfe_table_counts
order by table_name;

select
  '02_colunas_atuais' as diagnostico,
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'nfe_dfe_sync_states',
    'nfe_dfe_documents',
    'nfe_dfe_events',
    'nfe_dfe_sync_logs',
    'nfe_dfe_access_logs'
  )
order by table_name, ordinal_position;

with legacy_columns(column_name) as (
  values
    ('company_id'),
    ('chave_acesso'),
    ('schema'),
    ('tipo_documento'),
    ('tipo_nota'),
    ('cnpj_emitente'),
    ('nome_emitente'),
    ('cnpj_destinatario'),
    ('nome_destinatario'),
    ('data_emissao'),
    ('valor_total'),
    ('situacao'),
    ('manifestacao_status'),
    ('xml_path'),
    ('resumo_json')
),
new_columns(column_name) as (
  values
    ('client_id'),
    ('access_key'),
    ('schema_name'),
    ('document_type'),
    ('direction'),
    ('issuer_cnpj'),
    ('issuer_name'),
    ('recipient_cnpj'),
    ('recipient_name'),
    ('issue_date'),
    ('authorization_date'),
    ('total_value'),
    ('nfe_status'),
    ('manifestation_status'),
    ('has_full_xml'),
    ('xml_storage_path'),
    ('xml_hash'),
    ('summary_data'),
    ('active')
)
select
  '03_colunas_antigas_e_novas_documents' as diagnostico,
  'antiga' as tipo,
  column_name,
  exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'nfe_dfe_documents'
      and c.column_name = legacy_columns.column_name
  ) as existe
from legacy_columns
union all
select
  '03_colunas_antigas_e_novas_documents' as diagnostico,
  'nova' as tipo,
  column_name,
  exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'nfe_dfe_documents'
      and c.column_name = new_columns.column_name
  ) as existe
from new_columns
order by tipo, column_name;

select
  '04_foreign_keys' as diagnostico,
  con.conname as constraint_name,
  src_ns.nspname || '.' || src.relname as source_table,
  (
    select array_agg(att.attname order by k.ordinality)
    from unnest(con.conkey) with ordinality as k(attnum, ordinality)
    join pg_attribute att
      on att.attrelid = con.conrelid
     and att.attnum = k.attnum
  ) as source_columns,
  ref_ns.nspname || '.' || ref.relname as referenced_table,
  (
    select array_agg(att.attname order by k.ordinality)
    from unnest(con.confkey) with ordinality as k(attnum, ordinality)
    join pg_attribute att
      on att.attrelid = con.confrelid
     and att.attnum = k.attnum
  ) as referenced_columns,
  case con.confdeltype
    when 'a' then 'no action'
    when 'r' then 'restrict'
    when 'c' then 'cascade'
    when 'n' then 'set null'
    when 'd' then 'set default'
    else con.confdeltype::text
  end as on_delete
from pg_constraint con
join pg_class src on src.oid = con.conrelid
join pg_namespace src_ns on src_ns.oid = src.relnamespace
join pg_class ref on ref.oid = con.confrelid
join pg_namespace ref_ns on ref_ns.oid = ref.relnamespace
where con.contype = 'f'
  and src_ns.nspname = 'public'
  and src.relname in (
    'nfe_dfe_sync_states',
    'nfe_dfe_documents',
    'nfe_dfe_events',
    'nfe_dfe_sync_logs',
    'nfe_dfe_access_logs'
  )
order by source_table, constraint_name;

select
  '05_indices' as diagnostico,
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'nfe_dfe_sync_states',
    'nfe_dfe_documents',
    'nfe_dfe_events',
    'nfe_dfe_sync_logs',
    'nfe_dfe_access_logs'
  )
order by tablename, indexname;

select
  '06_rls' as diagnostico,
  ns.nspname as schema_name,
  cls.relname as table_name,
  cls.relrowsecurity as rls_enabled,
  cls.relforcerowsecurity as rls_forced
from pg_class cls
join pg_namespace ns on ns.oid = cls.relnamespace
where ns.nspname = 'public'
  and cls.relname in (
    'nfe_dfe_sync_states',
    'nfe_dfe_documents',
    'nfe_dfe_events',
    'nfe_dfe_sync_logs',
    'nfe_dfe_access_logs'
  )
order by table_name;

select
  '07_policies' as diagnostico,
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
    'nfe_dfe_sync_states',
    'nfe_dfe_documents',
    'nfe_dfe_events',
    'nfe_dfe_sync_logs',
    'nfe_dfe_access_logs'
  )
order by tablename, policyname;

select
  '08_triggers' as diagnostico,
  event_object_schema,
  event_object_table,
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in (
    'nfe_dfe_sync_states',
    'nfe_dfe_documents',
    'nfe_dfe_events',
    'nfe_dfe_sync_logs',
    'nfe_dfe_access_logs'
  )
order by event_object_table, trigger_name;

create temp table if not exists cont_hub_dfe_bucket_diagnostic (
  bucket_exists boolean not null,
  id text,
  name text,
  public boolean,
  file_size_limit bigint,
  allowed_mime_types text[]
) on commit drop;

truncate table cont_hub_dfe_bucket_diagnostic;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and to_regclass('storage.buckets') is not null then
    execute $sql$
      insert into cont_hub_dfe_bucket_diagnostic
      select true, id, name, public, file_size_limit, allowed_mime_types
      from storage.buckets
      where id = 'nfe-dfe-xml'
    $sql$;
  end if;

  if not exists (select 1 from cont_hub_dfe_bucket_diagnostic) then
    insert into cont_hub_dfe_bucket_diagnostic (bucket_exists, id, name, public, file_size_limit, allowed_mime_types)
    values (false, 'nfe-dfe-xml', 'nfe-dfe-xml', null, null, null);
  end if;
end $$;

select
  '09_bucket' as diagnostico,
  *
from cont_hub_dfe_bucket_diagnostic;

create temp table if not exists cont_hub_dfe_storage_policies (
  policyname text,
  cmd text,
  roles name[],
  qual text,
  with_check text
) on commit drop;

truncate table cont_hub_dfe_storage_policies;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and to_regclass('storage.objects') is not null then
    insert into cont_hub_dfe_storage_policies
    select policyname, cmd, roles, qual, with_check
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        qual ilike '%nfe-dfe-xml%'
        or with_check ilike '%nfe-dfe-xml%'
      );
  end if;
end $$;

select
  '10_storage_policies_nfe_dfe_xml' as diagnostico,
  *
from cont_hub_dfe_storage_policies
order by policyname;

create temp table if not exists cont_hub_dfe_inconsistencies (
  severity text not null,
  item text not null,
  detail text not null
) on commit drop;

truncate table cont_hub_dfe_inconsistencies;

insert into cont_hub_dfe_inconsistencies
select 'erro', table_name, 'Tabela obrigatoria nao existe'
from cont_hub_dfe_table_counts
where not table_exists;

with required_columns(table_name, column_name) as (
  values
    ('nfe_dfe_sync_states', 'organization_id'),
    ('nfe_dfe_sync_states', 'client_id'),
    ('nfe_dfe_sync_states', 'certificate_id'),
    ('nfe_dfe_sync_states', 'environment'),
    ('nfe_dfe_sync_states', 'last_nsu'),
    ('nfe_dfe_sync_states', 'max_nsu'),
    ('nfe_dfe_sync_states', 'status'),
    ('nfe_dfe_documents', 'organization_id'),
    ('nfe_dfe_documents', 'client_id'),
    ('nfe_dfe_documents', 'certificate_id'),
    ('nfe_dfe_documents', 'access_key'),
    ('nfe_dfe_documents', 'schema_name'),
    ('nfe_dfe_documents', 'document_type'),
    ('nfe_dfe_documents', 'direction'),
    ('nfe_dfe_documents', 'issuer_cnpj'),
    ('nfe_dfe_documents', 'recipient_cnpj'),
    ('nfe_dfe_documents', 'issue_date'),
    ('nfe_dfe_documents', 'authorization_date'),
    ('nfe_dfe_documents', 'total_value'),
    ('nfe_dfe_documents', 'nfe_status'),
    ('nfe_dfe_documents', 'manifestation_status'),
    ('nfe_dfe_documents', 'xml_storage_path'),
    ('nfe_dfe_documents', 'xml_hash'),
    ('nfe_dfe_documents', 'summary_data'),
    ('nfe_dfe_documents', 'active'),
    ('nfe_dfe_events', 'organization_id'),
    ('nfe_dfe_events', 'client_id'),
    ('nfe_dfe_events', 'document_id'),
    ('nfe_dfe_events', 'access_key'),
    ('nfe_dfe_events', 'event_type'),
    ('nfe_dfe_sync_logs', 'organization_id'),
    ('nfe_dfe_sync_logs', 'client_id'),
    ('nfe_dfe_sync_logs', 'certificate_id'),
    ('nfe_dfe_sync_logs', 'sefaz_status_code'),
    ('nfe_dfe_access_logs', 'organization_id'),
    ('nfe_dfe_access_logs', 'client_id'),
    ('nfe_dfe_access_logs', 'document_id'),
    ('nfe_dfe_access_logs', 'action')
)
insert into cont_hub_dfe_inconsistencies
select 'erro', table_name || '.' || column_name, 'Coluna obrigatoria nao existe'
from required_columns rc
where not exists (
  select 1
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = rc.table_name
    and c.column_name = rc.column_name
);

insert into cont_hub_dfe_inconsistencies
select 'aviso', 'nfe_dfe_documents.' || column_name, 'Coluna antiga ainda existe'
from information_schema.columns
where table_schema = 'public'
  and table_name = 'nfe_dfe_documents'
  and column_name in (
    'company_id',
    'chave_acesso',
    'schema',
    'tipo_documento',
    'tipo_nota',
    'cnpj_emitente',
    'nome_emitente',
    'cnpj_destinatario',
    'nome_destinatario',
    'data_emissao',
    'valor_total',
    'situacao',
    'manifestacao_status',
    'xml_path',
    'resumo_json'
  );

insert into cont_hub_dfe_inconsistencies
select 'erro', 'nfe-dfe-xml', 'Bucket privado nao existe'
from cont_hub_dfe_bucket_diagnostic
where not bucket_exists;

insert into cont_hub_dfe_inconsistencies
select 'erro', 'nfe-dfe-xml', 'Bucket esta publico, deveria ser privado'
from cont_hub_dfe_bucket_diagnostic
where bucket_exists
  and public is true;

insert into cont_hub_dfe_inconsistencies
select 'aviso', 'nfe-dfe-xml', 'Bucket com limite diferente de 10 MB'
from cont_hub_dfe_bucket_diagnostic
where bucket_exists
  and coalesce(file_size_limit, 0) <> 10485760;

insert into cont_hub_dfe_inconsistencies
select 'aviso', table_name, 'Tabela sem RLS habilitado'
from (
  select cls.relname as table_name, cls.relrowsecurity
  from pg_class cls
  join pg_namespace ns on ns.oid = cls.relnamespace
  where ns.nspname = 'public'
    and cls.relname in (
      'nfe_dfe_sync_states',
      'nfe_dfe_documents',
      'nfe_dfe_events',
      'nfe_dfe_sync_logs',
      'nfe_dfe_access_logs'
    )
) rls
where not relrowsecurity;

select
  '11_inconsistencias' as diagnostico,
  severity,
  item,
  detail
from cont_hub_dfe_inconsistencies
order by
  case severity when 'erro' then 1 when 'aviso' then 2 else 3 end,
  item;

