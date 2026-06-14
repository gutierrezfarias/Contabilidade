-- CONT HUB - Distribuicao DF-e oficial (NFeDistribuicaoDFe).
-- Rode este script no SQL Editor do Supabase.
-- Incremental, sem apagar ou alterar dados existentes de forma destrutiva.

create extension if not exists pgcrypto;

create table if not exists public.nfe_dfe_sync_states (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  certificate_id uuid not null references public.digital_certificates (id) on delete cascade,
  cnpj text not null default '',
  environment text not null default 'homologacao'
    check (environment in ('homologacao', 'producao')),
  last_nsu text not null default '000000000000000',
  max_nsu text not null default '000000000000000',
  last_sync_at timestamptz,
  next_allowed_sync_at timestamptz,
  last_status_code text not null default '',
  last_status_message text not null default '',
  status text not null default 'idle'
    check (status in ('idle', 'running', 'success', 'blocked', 'error')),
  consecutive_errors integer not null default 0,
  lock_token text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists nfe_dfe_sync_states_unique_scope_idx
  on public.nfe_dfe_sync_states (organization_id, client_id, certificate_id, environment);

create index if not exists nfe_dfe_sync_states_org_client_idx
  on public.nfe_dfe_sync_states (organization_id, client_id, certificate_id);

create table if not exists public.nfe_dfe_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  certificate_id uuid references public.digital_certificates (id) on delete set null,
  nsu text not null default '',
  access_key text not null default '',
  schema_name text not null default '',
  document_type text not null default '',
  direction text not null default 'citada'
    check (direction in ('recebida', 'emitida', 'transporte', 'citada', 'evento')),
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

create unique index if not exists nfe_dfe_documents_unique_access_schema_idx
  on public.nfe_dfe_documents (organization_id, client_id, access_key, schema_name)
  where access_key <> '';

create unique index if not exists nfe_dfe_documents_unique_nsu_schema_idx
  on public.nfe_dfe_documents (organization_id, client_id, certificate_id, nsu, schema_name)
  where nsu <> '';

create unique index if not exists nfe_dfe_documents_xml_hash_idx
  on public.nfe_dfe_documents (organization_id, client_id, xml_hash)
  where xml_hash <> '';

create index if not exists nfe_dfe_documents_filters_idx
  on public.nfe_dfe_documents (organization_id, client_id, direction, issue_date desc);

create index if not exists nfe_dfe_documents_manifestation_idx
  on public.nfe_dfe_documents (organization_id, client_id, manifestation_status);

create table if not exists public.nfe_dfe_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  document_id uuid references public.nfe_dfe_documents (id) on delete cascade,
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
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create unique index if not exists nfe_dfe_events_unique_idx
  on public.nfe_dfe_events (organization_id, client_id, access_key, event_type, sequence);

create table if not exists public.nfe_dfe_sync_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  certificate_id uuid references public.digital_certificates (id) on delete set null,
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
  triggered_by uuid references auth.users (id)
);

create index if not exists nfe_dfe_sync_logs_org_client_idx
  on public.nfe_dfe_sync_logs (organization_id, client_id, started_at desc);

create table if not exists public.nfe_dfe_access_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  document_id uuid references public.nfe_dfe_documents (id) on delete cascade,
  action text not null default '',
  access_key text not null default '',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

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
  if exists (select 1 from pg_namespace where nspname = 'storage') then
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
