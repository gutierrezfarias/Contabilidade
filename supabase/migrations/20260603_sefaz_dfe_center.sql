-- CONT HUB - central SEFAZ/DF-e.
-- Rode este script no SQL Editor do Supabase para habilitar listagem, XML, NSU e status.

alter table public.nfe_documents
  add column if not exists document_model text not null default 'NFe',
  add column if not exists document_direction text not null default 'recebida',
  add column if not exists nsu text not null default '',
  add column if not exists emitter_name text not null default '',
  add column if not exists emitter_document text not null default '',
  add column if not exists destination_name text not null default '',
  add column if not exists destination_document text not null default '',
  add column if not exists protocol_number text not null default '',
  add column if not exists manifestation_status text not null default 'Pendente',
  add column if not exists manifestation_deadline date,
  add column if not exists raw_xml text,
  add column if not exists raw_summary jsonb not null default '{}'::jsonb,
  add column if not exists sefaz_status_code text not null default '',
  add column if not exists last_consulted_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'nfe_documents_document_direction_check'
      and conrelid = 'public.nfe_documents'::regclass
  ) then
    alter table public.nfe_documents
      add constraint nfe_documents_document_direction_check
      check (document_direction in ('recebida', 'emitida', 'transporte', 'citada'));
  end if;
end $$;

create table if not exists public.sefaz_sync_state (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  certificate_id uuid not null references public.digital_certificates (id) on delete cascade,
  document_direction text not null default 'recebida'
    check (document_direction in ('recebida', 'emitida', 'transporte', 'citada')),
  environment text not null default 'homologacao',
  state_uf text not null default '',
  last_nsu text not null default '000000000000000',
  max_nsu text not null default '000000000000000',
  last_status_code text not null default '',
  last_status_message text not null default '',
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, client_id, certificate_id, document_direction)
);

create index if not exists nfe_documents_org_client_idx
  on public.nfe_documents (organization_id, client_id, document_direction, issue_date desc);

create index if not exists nfe_documents_access_key_idx
  on public.nfe_documents (organization_id, access_key);

create index if not exists sefaz_sync_state_client_idx
  on public.sefaz_sync_state (organization_id, client_id, certificate_id);

alter table public.sefaz_sync_state enable row level security;

drop policy if exists "sefaz_sync_state select org members" on public.sefaz_sync_state;
create policy "sefaz_sync_state select org members"
  on public.sefaz_sync_state
  for select
  using (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "sefaz_sync_state insert org members" on public.sefaz_sync_state;
create policy "sefaz_sync_state insert org members"
  on public.sefaz_sync_state
  for insert
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "sefaz_sync_state update org members" on public.sefaz_sync_state;
create policy "sefaz_sync_state update org members"
  on public.sefaz_sync_state
  for update
  using (public.is_platform_admin() or public.is_org_member(organization_id))
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

notify pgrst, 'reload schema';
