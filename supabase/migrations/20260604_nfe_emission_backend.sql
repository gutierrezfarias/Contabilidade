-- CONT HUB - backend fiscal real NF-e modelo 55.
-- Rode no SQL Editor do Supabase. Script incremental e nao destrutivo.

create extension if not exists pgcrypto;

create table if not exists public.nfe_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  certificate_id uuid references public.digital_certificates (id) on delete set null,
  access_key text not null default '',
  number text not null default '',
  series text not null default '',
  issue_date date not null default current_date,
  amount numeric(14,2) not null default 0,
  status text not null default 'Rascunho',
  operation_type text not null default '',
  recipient_name text not null default '',
  recipient_document text not null default '',
  description text not null default '',
  xml_url text,
  danfe_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients
  add column if not exists state_registration text not null default '',
  add column if not exists municipal_registration text not null default '',
  add column if not exists city_ibge_code text not null default '',
  add column if not exists address_number text not null default '',
  add column if not exists address_complement text not null default '',
  add column if not exists tax_regime text not null default '';

alter table public.digital_certificates
  add column if not exists certificate_file_data text,
  add column if not exists certificate_file_name text not null default '',
  add column if not exists certificate_password text not null default '',
  add column if not exists environment text not null default 'homologacao',
  add column if not exists state_uf text not null default '',
  add column if not exists tax_id text not null default '',
  add column if not exists holder_name text not null default '',
  add column if not exists status text not null default 'Pendente';

alter table public.nfe_documents
  add column if not exists document_model text not null default 'NFe',
  add column if not exists document_direction text not null default 'emitida',
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
  add column if not exists last_xmotivo text not null default '',
  add column if not exists last_consulted_at timestamptz,
  add column if not exists generated_xml text,
  add column if not exists signed_xml text,
  add column if not exists authorized_xml text,
  add column if not exists danfe_pdf_data text,
  add column if not exists receipt_number text not null default '',
  add column if not exists request_xml_path text not null default '',
  add column if not exists response_xml_path text not null default '',
  add column if not exists webservice_endpoint text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'nfe_documents_status_check'
      and conrelid = 'public.nfe_documents'::regclass
  ) then
    alter table public.nfe_documents
      add constraint nfe_documents_status_check
      check (status in ('Rascunho', 'Pendente', 'Consultada', 'Autorizada', 'Rejeitada', 'Cancelada'));
  end if;

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

  if not exists (
    select 1
    from pg_constraint
    where conname = 'digital_certificates_environment_check'
      and conrelid = 'public.digital_certificates'::regclass
  ) then
    alter table public.digital_certificates
      add constraint digital_certificates_environment_check
      check (environment in ('homologacao', 'producao'));
  end if;
end $$;

create table if not exists public.nfe_sefaz_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_id uuid references public.clients (id) on delete set null,
  nota_id uuid references public.nfe_documents (id) on delete set null,
  chave_acesso text not null default '',
  tipo_evento text not null default '',
  ambiente text not null default '',
  uf text not null default '',
  endpoint text not null default '',
  correlation_id text not null default '',
  cstat text not null default '',
  xmotivo text not null default '',
  sucesso boolean not null default false,
  erro_tecnico text not null default '',
  created_at timestamptz not null default now()
);

alter table public.nfe_sefaz_logs
  add column if not exists correlation_id text not null default '';

create index if not exists nfe_documents_org_client_idx
  on public.nfe_documents (organization_id, client_id, document_direction, issue_date desc);

create index if not exists nfe_documents_access_key_idx
  on public.nfe_documents (organization_id, access_key);

create index if not exists nfe_sefaz_logs_org_created_idx
  on public.nfe_sefaz_logs (organization_id, created_at desc);

alter table public.nfe_documents enable row level security;
alter table public.nfe_sefaz_logs enable row level security;

drop policy if exists "Organization access nfe documents" on public.nfe_documents;
create policy "Organization access nfe documents"
  on public.nfe_documents
  for all
  using (public.is_platform_admin() or public.is_org_member(organization_id))
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access nfe sefaz logs" on public.nfe_sefaz_logs;
create policy "Organization access nfe sefaz logs"
  on public.nfe_sefaz_logs
  for select
  using (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization insert nfe sefaz logs" on public.nfe_sefaz_logs;
create policy "Organization insert nfe sefaz logs"
  on public.nfe_sefaz_logs
  for insert
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

notify pgrst, 'reload schema';
