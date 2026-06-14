-- CONT HUB - compatibilidade da estrutura DF-e oficial.
-- Rode este script ANTES de repetir a migration 20260613_sefaz_dfe_distribution.sql.
-- Ele corrige bancos onde public.nfe_dfe_documents ja existia vazia com colunas antigas em portugues.
-- Nao executa operacoes destrutivas quando existem registros na estrutura antiga.

create extension if not exists pgcrypto;

create or replace function pg_temp.cont_hub_has_column(p_table regclass, p_column text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from pg_attribute
    where attrelid = p_table
      and attname = p_column
      and attnum > 0
      and not attisdropped
  );
$$;

create or replace function pg_temp.cont_hub_set_not_null_if_safe(p_table regclass, p_column text)
returns void
language plpgsql
as $$
declare
  has_null boolean;
begin
  if not pg_temp.cont_hub_has_column(p_table, p_column) then
    return;
  end if;

  execute format('select exists (select 1 from %s where %I is null)', p_table, p_column)
    into has_null;

  if not has_null then
    execute format('alter table %s alter column %I set not null', p_table, p_column);
  end if;
end;
$$;

create or replace function pg_temp.cont_hub_ensure_fk(
  p_table regclass,
  p_column text,
  p_constraint text,
  p_ref_table regclass,
  p_ref_column text,
  p_on_delete text
)
returns void
language plpgsql
as $$
declare
  local_attnum smallint;
  ref_attnum smallint;
  fk record;
  correct_exists boolean;
begin
  if not pg_temp.cont_hub_has_column(p_table, p_column) then
    return;
  end if;

  select attnum into local_attnum
  from pg_attribute
  where attrelid = p_table
    and attname = p_column
    and attnum > 0
    and not attisdropped;

  select attnum into ref_attnum
  from pg_attribute
  where attrelid = p_ref_table
    and attname = p_ref_column
    and attnum > 0
    and not attisdropped;

  for fk in
    select conname, confrelid, conkey, confkey
    from pg_constraint
    where conrelid = p_table
      and contype = 'f'
      and array_length(conkey, 1) = 1
      and conkey[1] = local_attnum
  loop
    if fk.confrelid <> p_ref_table
       or array_length(fk.confkey, 1) <> 1
       or fk.confkey[1] <> ref_attnum then
      execute format('alter table %s drop constraint %I', p_table, fk.conname);
    end if;
  end loop;

  select exists (
    select 1
    from pg_constraint
    where conrelid = p_table
      and contype = 'f'
      and array_length(conkey, 1) = 1
      and conkey[1] = local_attnum
      and confrelid = p_ref_table
      and array_length(confkey, 1) = 1
      and confkey[1] = ref_attnum
  ) into correct_exists;

  if not correct_exists then
    execute format(
      'alter table %s add constraint %I foreign key (%I) references %s (%I) on delete %s',
      p_table,
      p_constraint,
      p_column,
      p_ref_table,
      p_ref_column,
      p_on_delete
    );
  end if;
end;
$$;

create or replace function pg_temp.cont_hub_has_index(
  p_schema text,
  p_table text,
  p_columns text[],
  p_unique boolean
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from pg_index ix
    join pg_class tbl on tbl.oid = ix.indrelid
    join pg_namespace ns on ns.oid = tbl.relnamespace
    where ns.nspname = p_schema
      and tbl.relname = p_table
      and ix.indisunique = p_unique
      and (
        select array_agg(att.attname::text order by k.ordinality)
        from unnest(string_to_array(ix.indkey::text, ' ')::smallint[]) with ordinality as k(attnum, ordinality)
        join pg_attribute att
          on att.attrelid = ix.indrelid
         and att.attnum = k.attnum
      ) = p_columns
  );
$$;

create table if not exists public.nfe_dfe_sync_states (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  certificate_id uuid not null,
  cnpj text not null default '',
  environment text not null default 'homologacao',
  last_nsu text not null default '000000000000000',
  max_nsu text not null default '000000000000000',
  last_sync_at timestamptz,
  next_allowed_sync_at timestamptz,
  last_status_code text not null default '',
  last_status_message text not null default '',
  status text not null default 'idle',
  consecutive_errors integer not null default 0,
  lock_token text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nfe_dfe_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  certificate_id uuid,
  nsu text not null default '',
  access_key text not null default '',
  schema_name text not null default '',
  document_type text not null default '',
  direction text not null default 'citada',
  issuer_cnpj text not null default '',
  issuer_name text not null default '',
  recipient_cnpj text not null default '',
  recipient_name text not null default '',
  issue_date timestamptz,
  authorization_date timestamptz,
  total_value numeric(14,2) not null default 0,
  nfe_status text not null default '',
  manifestation_status text not null default 'Pendente',
  has_full_xml boolean not null default false,
  xml_storage_path text not null default '',
  xml_hash text not null default '',
  summary_data jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nfe_dfe_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  document_id uuid,
  access_key text not null default '',
  protocol_number text not null default '',
  event_type text not null default '',
  sequence integer not null default 1,
  event_date timestamptz,
  status_code text not null default '',
  status_message text not null default '',
  private_xml_storage_path text not null default '',
  request_xml_hash text not null default '',
  response_xml_hash text not null default '',
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.nfe_dfe_sync_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  certificate_id uuid,
  environment text not null default 'homologacao',
  start_nsu text not null default '',
  end_nsu text not null default '',
  max_nsu text not null default '',
  received_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  ignored_count integer not null default 0,
  sefaz_status_code text not null default '',
  sefaz_status_message text not null default '',
  duration_ms integer not null default 0,
  error_message text not null default '',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  triggered_by uuid
);

create table if not exists public.nfe_dfe_access_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  document_id uuid,
  action text not null default '',
  access_key text not null default '',
  created_by uuid,
  created_at timestamptz not null default now()
);

do $$
declare
  row_count bigint;
  legacy_pair record;
  has_legacy_equivalent boolean;
begin
  select count(*) into row_count from public.nfe_dfe_documents;

  select exists (
    select 1
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
      )
  ) into has_legacy_equivalent;

  if row_count > 0 and has_legacy_equivalent then
    raise exception
      'public.nfe_dfe_documents possui % registro(s) e colunas antigas. Migration interrompida para evitar perda; use migracao por copia de dados.',
      row_count;
  end if;

  if row_count = 0 then
    for legacy_pair in
      select *
      from (
        values
          ('company_id', 'client_id'),
          ('chave_acesso', 'access_key'),
          ('schema', 'schema_name'),
          ('tipo_documento', 'document_type'),
          ('tipo_nota', 'direction'),
          ('cnpj_emitente', 'issuer_cnpj'),
          ('nome_emitente', 'issuer_name'),
          ('cnpj_destinatario', 'recipient_cnpj'),
          ('nome_destinatario', 'recipient_name'),
          ('data_emissao', 'issue_date'),
          ('valor_total', 'total_value'),
          ('situacao', 'nfe_status'),
          ('manifestacao_status', 'manifestation_status'),
          ('xml_path', 'xml_storage_path'),
          ('resumo_json', 'summary_data')
      ) as mapping(old_name, new_name)
    loop
      if pg_temp.cont_hub_has_column('public.nfe_dfe_documents'::regclass, legacy_pair.old_name) then
        if not pg_temp.cont_hub_has_column('public.nfe_dfe_documents'::regclass, legacy_pair.new_name) then
          execute format(
            'alter table public.nfe_dfe_documents rename column %I to %I',
            legacy_pair.old_name,
            legacy_pair.new_name
          );
        else
          execute format(
            'alter table public.nfe_dfe_documents drop column %I',
            legacy_pair.old_name
          );
        end if;
      end if;
    end loop;
  end if;
end $$;

alter table public.nfe_dfe_sync_states
  add column if not exists organization_id uuid,
  add column if not exists client_id uuid,
  add column if not exists certificate_id uuid,
  add column if not exists cnpj text not null default '',
  add column if not exists environment text not null default 'homologacao',
  add column if not exists last_nsu text not null default '000000000000000',
  add column if not exists max_nsu text not null default '000000000000000',
  add column if not exists last_sync_at timestamptz,
  add column if not exists next_allowed_sync_at timestamptz,
  add column if not exists last_status_code text not null default '',
  add column if not exists last_status_message text not null default '',
  add column if not exists status text not null default 'idle',
  add column if not exists consecutive_errors integer not null default 0,
  add column if not exists lock_token text,
  add column if not exists locked_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.nfe_dfe_documents
  add column if not exists organization_id uuid,
  add column if not exists client_id uuid,
  add column if not exists certificate_id uuid,
  add column if not exists nsu text not null default '',
  add column if not exists access_key text not null default '',
  add column if not exists schema_name text not null default '',
  add column if not exists document_type text not null default '',
  add column if not exists direction text not null default 'citada',
  add column if not exists issuer_cnpj text not null default '',
  add column if not exists issuer_name text not null default '',
  add column if not exists recipient_cnpj text not null default '',
  add column if not exists recipient_name text not null default '',
  add column if not exists issue_date timestamptz,
  add column if not exists authorization_date timestamptz,
  add column if not exists total_value numeric(14,2) not null default 0,
  add column if not exists nfe_status text not null default '',
  add column if not exists manifestation_status text not null default 'Pendente',
  add column if not exists has_full_xml boolean not null default false,
  add column if not exists xml_storage_path text not null default '',
  add column if not exists xml_hash text not null default '',
  add column if not exists summary_data jsonb not null default '{}'::jsonb,
  add column if not exists active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.nfe_dfe_events
  add column if not exists organization_id uuid,
  add column if not exists client_id uuid,
  add column if not exists document_id uuid,
  add column if not exists access_key text not null default '',
  add column if not exists protocol_number text not null default '',
  add column if not exists event_type text not null default '',
  add column if not exists sequence integer not null default 1,
  add column if not exists event_date timestamptz,
  add column if not exists status_code text not null default '',
  add column if not exists status_message text not null default '',
  add column if not exists private_xml_storage_path text not null default '',
  add column if not exists request_xml_hash text not null default '',
  add column if not exists response_xml_hash text not null default '',
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now();

alter table public.nfe_dfe_sync_logs
  add column if not exists organization_id uuid,
  add column if not exists client_id uuid,
  add column if not exists certificate_id uuid,
  add column if not exists environment text not null default 'homologacao',
  add column if not exists start_nsu text not null default '',
  add column if not exists end_nsu text not null default '',
  add column if not exists max_nsu text not null default '',
  add column if not exists received_count integer not null default 0,
  add column if not exists inserted_count integer not null default 0,
  add column if not exists updated_count integer not null default 0,
  add column if not exists ignored_count integer not null default 0,
  add column if not exists sefaz_status_code text not null default '',
  add column if not exists sefaz_status_message text not null default '',
  add column if not exists duration_ms integer not null default 0,
  add column if not exists error_message text not null default '',
  add column if not exists started_at timestamptz not null default now(),
  add column if not exists finished_at timestamptz,
  add column if not exists triggered_by uuid;

alter table public.nfe_dfe_access_logs
  add column if not exists organization_id uuid,
  add column if not exists client_id uuid,
  add column if not exists document_id uuid,
  add column if not exists action text not null default '',
  add column if not exists access_key text not null default '',
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now();

do $$
declare
  row_count bigint;
begin
  select count(*) into row_count from public.nfe_dfe_documents;

  if row_count = 0 then
    alter table public.nfe_dfe_documents
      alter column issue_date type timestamptz using issue_date::timestamptz,
      alter column authorization_date type timestamptz using authorization_date::timestamptz,
      alter column total_value type numeric(14,2) using coalesce(nullif(total_value::text, '')::numeric, 0)::numeric(14,2),
      alter column summary_data type jsonb using coalesce(summary_data::jsonb, '{}'::jsonb);
  end if;
end $$;

alter table public.nfe_dfe_sync_states
  alter column cnpj set default '',
  alter column environment set default 'homologacao',
  alter column last_nsu set default '000000000000000',
  alter column max_nsu set default '000000000000000',
  alter column last_status_code set default '',
  alter column last_status_message set default '',
  alter column status set default 'idle',
  alter column consecutive_errors set default 0,
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.nfe_dfe_documents
  alter column nsu set default '',
  alter column access_key set default '',
  alter column schema_name set default '',
  alter column document_type set default '',
  alter column direction set default 'citada',
  alter column issuer_cnpj set default '',
  alter column issuer_name set default '',
  alter column recipient_cnpj set default '',
  alter column recipient_name set default '',
  alter column total_value set default 0,
  alter column nfe_status set default '',
  alter column manifestation_status set default 'Pendente',
  alter column has_full_xml set default false,
  alter column xml_storage_path set default '',
  alter column xml_hash set default '',
  alter column summary_data set default '{}'::jsonb,
  alter column active set default true,
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.nfe_dfe_events
  alter column access_key set default '',
  alter column protocol_number set default '',
  alter column event_type set default '',
  alter column sequence set default 1,
  alter column status_code set default '',
  alter column status_message set default '',
  alter column private_xml_storage_path set default '',
  alter column request_xml_hash set default '',
  alter column response_xml_hash set default '',
  alter column created_at set default now();

alter table public.nfe_dfe_sync_logs
  alter column environment set default 'homologacao',
  alter column start_nsu set default '',
  alter column end_nsu set default '',
  alter column max_nsu set default '',
  alter column received_count set default 0,
  alter column inserted_count set default 0,
  alter column updated_count set default 0,
  alter column ignored_count set default 0,
  alter column sefaz_status_code set default '',
  alter column sefaz_status_message set default '',
  alter column duration_ms set default 0,
  alter column error_message set default '',
  alter column started_at set default now();

alter table public.nfe_dfe_access_logs
  alter column action set default '',
  alter column access_key set default '',
  alter column created_at set default now();

select pg_temp.cont_hub_set_not_null_if_safe('public.nfe_dfe_sync_states'::regclass, column_name)
from (values
  ('organization_id'),
  ('client_id'),
  ('certificate_id'),
  ('cnpj'),
  ('environment'),
  ('last_nsu'),
  ('max_nsu'),
  ('last_status_code'),
  ('last_status_message'),
  ('status'),
  ('consecutive_errors'),
  ('created_at'),
  ('updated_at')
) as required(column_name);

select pg_temp.cont_hub_set_not_null_if_safe('public.nfe_dfe_documents'::regclass, column_name)
from (values
  ('organization_id'),
  ('client_id'),
  ('nsu'),
  ('access_key'),
  ('schema_name'),
  ('document_type'),
  ('direction'),
  ('issuer_cnpj'),
  ('issuer_name'),
  ('recipient_cnpj'),
  ('recipient_name'),
  ('total_value'),
  ('nfe_status'),
  ('manifestation_status'),
  ('has_full_xml'),
  ('xml_storage_path'),
  ('xml_hash'),
  ('summary_data'),
  ('active'),
  ('created_at'),
  ('updated_at')
) as required(column_name);

select pg_temp.cont_hub_set_not_null_if_safe('public.nfe_dfe_events'::regclass, column_name)
from (values
  ('organization_id'),
  ('client_id'),
  ('access_key'),
  ('protocol_number'),
  ('event_type'),
  ('sequence'),
  ('status_code'),
  ('status_message'),
  ('private_xml_storage_path'),
  ('request_xml_hash'),
  ('response_xml_hash'),
  ('created_at')
) as required(column_name);

select pg_temp.cont_hub_set_not_null_if_safe('public.nfe_dfe_sync_logs'::regclass, column_name)
from (values
  ('organization_id'),
  ('client_id'),
  ('environment'),
  ('start_nsu'),
  ('end_nsu'),
  ('max_nsu'),
  ('received_count'),
  ('inserted_count'),
  ('updated_count'),
  ('ignored_count'),
  ('sefaz_status_code'),
  ('sefaz_status_message'),
  ('duration_ms'),
  ('error_message'),
  ('started_at')
) as required(column_name);

select pg_temp.cont_hub_set_not_null_if_safe('public.nfe_dfe_access_logs'::regclass, column_name)
from (values
  ('organization_id'),
  ('client_id'),
  ('action'),
  ('access_key'),
  ('created_at')
) as required(column_name);

select pg_temp.cont_hub_ensure_fk('public.nfe_dfe_sync_states'::regclass, 'organization_id', 'nfe_dfe_sync_states_organization_id_fkey', 'public.organizations'::regclass, 'id', 'cascade');
select pg_temp.cont_hub_ensure_fk('public.nfe_dfe_sync_states'::regclass, 'client_id', 'nfe_dfe_sync_states_client_id_fkey', 'public.clients'::regclass, 'id', 'cascade');
select pg_temp.cont_hub_ensure_fk('public.nfe_dfe_sync_states'::regclass, 'certificate_id', 'nfe_dfe_sync_states_certificate_id_fkey', 'public.digital_certificates'::regclass, 'id', 'cascade');

select pg_temp.cont_hub_ensure_fk('public.nfe_dfe_documents'::regclass, 'organization_id', 'nfe_dfe_documents_organization_id_fkey', 'public.organizations'::regclass, 'id', 'cascade');
select pg_temp.cont_hub_ensure_fk('public.nfe_dfe_documents'::regclass, 'client_id', 'nfe_dfe_documents_client_id_fkey', 'public.clients'::regclass, 'id', 'cascade');
select pg_temp.cont_hub_ensure_fk('public.nfe_dfe_documents'::regclass, 'certificate_id', 'nfe_dfe_documents_certificate_id_fkey', 'public.digital_certificates'::regclass, 'id', 'set null');

select pg_temp.cont_hub_ensure_fk('public.nfe_dfe_events'::regclass, 'organization_id', 'nfe_dfe_events_organization_id_fkey', 'public.organizations'::regclass, 'id', 'cascade');
select pg_temp.cont_hub_ensure_fk('public.nfe_dfe_events'::regclass, 'client_id', 'nfe_dfe_events_client_id_fkey', 'public.clients'::regclass, 'id', 'cascade');
select pg_temp.cont_hub_ensure_fk('public.nfe_dfe_events'::regclass, 'document_id', 'nfe_dfe_events_document_id_fkey', 'public.nfe_dfe_documents'::regclass, 'id', 'cascade');
select pg_temp.cont_hub_ensure_fk('public.nfe_dfe_events'::regclass, 'created_by', 'nfe_dfe_events_created_by_fkey', 'auth.users'::regclass, 'id', 'set null');

select pg_temp.cont_hub_ensure_fk('public.nfe_dfe_sync_logs'::regclass, 'organization_id', 'nfe_dfe_sync_logs_organization_id_fkey', 'public.organizations'::regclass, 'id', 'cascade');
select pg_temp.cont_hub_ensure_fk('public.nfe_dfe_sync_logs'::regclass, 'client_id', 'nfe_dfe_sync_logs_client_id_fkey', 'public.clients'::regclass, 'id', 'cascade');
select pg_temp.cont_hub_ensure_fk('public.nfe_dfe_sync_logs'::regclass, 'certificate_id', 'nfe_dfe_sync_logs_certificate_id_fkey', 'public.digital_certificates'::regclass, 'id', 'set null');
select pg_temp.cont_hub_ensure_fk('public.nfe_dfe_sync_logs'::regclass, 'triggered_by', 'nfe_dfe_sync_logs_triggered_by_fkey', 'auth.users'::regclass, 'id', 'set null');

select pg_temp.cont_hub_ensure_fk('public.nfe_dfe_access_logs'::regclass, 'organization_id', 'nfe_dfe_access_logs_organization_id_fkey', 'public.organizations'::regclass, 'id', 'cascade');
select pg_temp.cont_hub_ensure_fk('public.nfe_dfe_access_logs'::regclass, 'client_id', 'nfe_dfe_access_logs_client_id_fkey', 'public.clients'::regclass, 'id', 'cascade');
select pg_temp.cont_hub_ensure_fk('public.nfe_dfe_access_logs'::regclass, 'document_id', 'nfe_dfe_access_logs_document_id_fkey', 'public.nfe_dfe_documents'::regclass, 'id', 'cascade');
select pg_temp.cont_hub_ensure_fk('public.nfe_dfe_access_logs'::regclass, 'created_by', 'nfe_dfe_access_logs_created_by_fkey', 'auth.users'::regclass, 'id', 'set null');

alter table public.nfe_dfe_sync_states drop constraint if exists nfe_dfe_sync_states_environment_check;
alter table public.nfe_dfe_sync_states
  add constraint nfe_dfe_sync_states_environment_check
  check (environment in ('homologacao', 'producao'));

alter table public.nfe_dfe_sync_states drop constraint if exists nfe_dfe_sync_states_status_check;
alter table public.nfe_dfe_sync_states
  add constraint nfe_dfe_sync_states_status_check
  check (status in ('idle', 'running', 'success', 'blocked', 'error'));

alter table public.nfe_dfe_documents drop constraint if exists nfe_dfe_documents_direction_check;
alter table public.nfe_dfe_documents
  add constraint nfe_dfe_documents_direction_check
  check (direction in ('recebida', 'emitida', 'transporte', 'citada', 'evento'));

do $$
begin
  if not pg_temp.cont_hub_has_index('public', 'nfe_dfe_sync_states', array['organization_id', 'client_id', 'certificate_id', 'environment'], true) then
    create unique index if not exists nfe_dfe_sync_states_unique_scope_idx
      on public.nfe_dfe_sync_states (organization_id, client_id, certificate_id, environment);
  end if;

  if not pg_temp.cont_hub_has_index('public', 'nfe_dfe_sync_states', array['organization_id', 'client_id', 'certificate_id'], false) then
    create index if not exists nfe_dfe_sync_states_org_client_idx
      on public.nfe_dfe_sync_states (organization_id, client_id, certificate_id);
  end if;

  if not pg_temp.cont_hub_has_index('public', 'nfe_dfe_documents', array['organization_id', 'client_id', 'access_key', 'schema_name'], true) then
    create unique index if not exists nfe_dfe_documents_unique_access_schema_idx
      on public.nfe_dfe_documents (organization_id, client_id, access_key, schema_name)
      where access_key <> '';
  end if;

  if not pg_temp.cont_hub_has_index('public', 'nfe_dfe_documents', array['organization_id', 'client_id', 'certificate_id', 'nsu', 'schema_name'], true) then
    create unique index if not exists nfe_dfe_documents_unique_nsu_schema_idx
      on public.nfe_dfe_documents (organization_id, client_id, certificate_id, nsu, schema_name)
      where nsu <> '';
  end if;

  if not pg_temp.cont_hub_has_index('public', 'nfe_dfe_documents', array['organization_id', 'client_id', 'xml_hash'], true) then
    create unique index if not exists nfe_dfe_documents_xml_hash_idx
      on public.nfe_dfe_documents (organization_id, client_id, xml_hash)
      where xml_hash <> '';
  end if;

  if not pg_temp.cont_hub_has_index('public', 'nfe_dfe_documents', array['organization_id', 'client_id', 'direction', 'issue_date'], false) then
    create index if not exists nfe_dfe_documents_filters_idx
      on public.nfe_dfe_documents (organization_id, client_id, direction, issue_date desc);
  end if;

  if not pg_temp.cont_hub_has_index('public', 'nfe_dfe_documents', array['organization_id', 'client_id', 'manifestation_status'], false) then
    create index if not exists nfe_dfe_documents_manifestation_idx
      on public.nfe_dfe_documents (organization_id, client_id, manifestation_status);
  end if;

  if not pg_temp.cont_hub_has_index('public', 'nfe_dfe_events', array['organization_id', 'client_id', 'access_key', 'event_type', 'sequence'], true) then
    create unique index if not exists nfe_dfe_events_unique_idx
      on public.nfe_dfe_events (organization_id, client_id, access_key, event_type, sequence);
  end if;

  if not pg_temp.cont_hub_has_index('public', 'nfe_dfe_sync_logs', array['organization_id', 'client_id', 'started_at'], false) then
    create index if not exists nfe_dfe_sync_logs_org_client_idx
      on public.nfe_dfe_sync_logs (organization_id, client_id, started_at desc);
  end if;
end $$;

alter table public.nfe_dfe_sync_states enable row level security;
alter table public.nfe_dfe_documents enable row level security;
alter table public.nfe_dfe_events enable row level security;
alter table public.nfe_dfe_sync_logs enable row level security;
alter table public.nfe_dfe_access_logs enable row level security;

drop policy if exists "nfe_dfe_sync_states select org members" on public.nfe_dfe_sync_states;
create policy "nfe_dfe_sync_states select org members"
  on public.nfe_dfe_sync_states for select
  using (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "nfe_dfe_sync_states insert org members" on public.nfe_dfe_sync_states;
create policy "nfe_dfe_sync_states insert org members"
  on public.nfe_dfe_sync_states for insert
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "nfe_dfe_sync_states update org members" on public.nfe_dfe_sync_states;
create policy "nfe_dfe_sync_states update org members"
  on public.nfe_dfe_sync_states for update
  using (public.is_platform_admin() or public.is_org_member(organization_id))
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "nfe_dfe_documents select org members" on public.nfe_dfe_documents;
create policy "nfe_dfe_documents select org members"
  on public.nfe_dfe_documents for select
  using (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "nfe_dfe_documents insert org members" on public.nfe_dfe_documents;
create policy "nfe_dfe_documents insert org members"
  on public.nfe_dfe_documents for insert
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "nfe_dfe_documents update org members" on public.nfe_dfe_documents;
create policy "nfe_dfe_documents update org members"
  on public.nfe_dfe_documents for update
  using (public.is_platform_admin() or public.is_org_member(organization_id))
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "nfe_dfe_events select org members" on public.nfe_dfe_events;
create policy "nfe_dfe_events select org members"
  on public.nfe_dfe_events for select
  using (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "nfe_dfe_events insert org members" on public.nfe_dfe_events;
create policy "nfe_dfe_events insert org members"
  on public.nfe_dfe_events for insert
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "nfe_dfe_sync_logs select org members" on public.nfe_dfe_sync_logs;
create policy "nfe_dfe_sync_logs select org members"
  on public.nfe_dfe_sync_logs for select
  using (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "nfe_dfe_sync_logs insert org members" on public.nfe_dfe_sync_logs;
create policy "nfe_dfe_sync_logs insert org members"
  on public.nfe_dfe_sync_logs for insert
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "nfe_dfe_access_logs select org members" on public.nfe_dfe_access_logs;
create policy "nfe_dfe_access_logs select org members"
  on public.nfe_dfe_access_logs for select
  using (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "nfe_dfe_access_logs insert org members" on public.nfe_dfe_access_logs;
create policy "nfe_dfe_access_logs insert org members"
  on public.nfe_dfe_access_logs for insert
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'nfe-dfe-xml',
      'nfe-dfe-xml',
      false,
      10485760,
      array['application/xml', 'text/xml']
    )
    on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

create or replace function public.touch_nfe_dfe_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_nfe_dfe_sync_states_updated_at on public.nfe_dfe_sync_states;
create trigger touch_nfe_dfe_sync_states_updated_at
before update on public.nfe_dfe_sync_states
for each row execute function public.touch_nfe_dfe_updated_at();

drop trigger if exists touch_nfe_dfe_documents_updated_at on public.nfe_dfe_documents;
create trigger touch_nfe_dfe_documents_updated_at
before update on public.nfe_dfe_documents
for each row execute function public.touch_nfe_dfe_updated_at();

notify pgrst, 'reload schema';
