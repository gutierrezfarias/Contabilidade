-- CONT HUB - Importacao manual gratuita Receita/e-CAC.
-- Complementa o modulo Serpro sem consumir API, carteira ou creditos.

create extension if not exists pgcrypto;

alter table public.serpro_organization_settings
  add column if not exists access_mode text not null default 'cont_hub_managed';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'serpro_organization_settings_access_mode_check'
      and conrelid = 'public.serpro_organization_settings'::regclass
  ) then
    alter table public.serpro_organization_settings
      add constraint serpro_organization_settings_access_mode_check
      check (access_mode in ('cont_hub_managed', 'direct_serpro', 'manual_free'));
  end if;
end $$;

alter table public.serpro_documents
  add column if not exists provider text not null default '',
  add column if not exists source text not null default '',
  add column if not exists access_mode text not null default 'cont_hub_managed',
  add column if not exists file_hash text not null default '',
  add column if not exists storage_bucket text not null default '',
  add column if not exists storage_path text not null default '',
  add column if not exists original_file_name text not null default '',
  add column if not exists safe_file_name text not null default '',
  add column if not exists tax_id text not null default '',
  add column if not exists company_name text not null default '',
  add column if not exists competency text not null default '',
  add column if not exists period_label text not null default '',
  add column if not exists issued_at date,
  add column if not exists due_date date,
  add column if not exists amount numeric(14,2),
  add column if not exists revenue_code text not null default '',
  add column if not exists receipt_number text not null default '',
  add column if not exists protocol_number text not null default '',
  add column if not exists document_status text not null default '',
  add column if not exists certificate_valid_until date,
  add column if not exists uploaded_by uuid references auth.users (id) on delete set null,
  add column if not exists import_batch_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'serpro_documents_access_mode_check'
      and conrelid = 'public.serpro_documents'::regclass
  ) then
    alter table public.serpro_documents
      add constraint serpro_documents_access_mode_check
      check (access_mode in ('cont_hub_managed', 'direct_serpro', 'manual_free'));
  end if;
end $$;

create unique index if not exists serpro_documents_org_hash_unique
  on public.serpro_documents (organization_id, file_hash)
  where file_hash <> '';

create table if not exists public.manual_revenue_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  status text not null default 'preview',
  access_mode text not null default 'manual_free',
  provider text not null default 'manual_ecac',
  source text not null default 'ecac_manual_download',
  original_file_count integer not null default 0,
  extracted_file_count integer not null default 0,
  duplicate_count integer not null default 0,
  error_count integer not null default 0,
  imported_count integer not null default 0,
  ignored_count integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (access_mode = 'manual_free')
);

create table if not exists public.manual_revenue_import_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.manual_revenue_import_batches (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  document_id uuid references public.serpro_documents (id) on delete set null,
  original_file_name text not null default '',
  safe_file_name text not null default '',
  mime_type text not null default '',
  file_size bigint not null default 0,
  file_hash text not null default '',
  tax_id text not null default '',
  company_name text not null default '',
  document_type text not null default 'documento_nao_identificado',
  service_name text not null default '',
  competency text not null default '',
  period_label text not null default '',
  issued_at date,
  due_date date,
  amount numeric(14,2),
  revenue_code text not null default '',
  receipt_number text not null default '',
  protocol_number text not null default '',
  document_status text not null default '',
  certificate_valid_until date,
  match_status text not null default 'pending',
  import_status text not null default 'preview',
  error_message text not null default '',
  action_required text not null default '',
  duplicate_of_document_id uuid references public.serpro_documents (id) on delete set null,
  storage_bucket text not null default '',
  storage_path text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.serpro_document_access_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  document_id uuid not null references public.serpro_documents (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.serpro_documents
  drop constraint if exists serpro_documents_import_batch_fk;

alter table public.serpro_documents
  add constraint serpro_documents_import_batch_fk
  foreign key (import_batch_id) references public.manual_revenue_import_batches (id) on delete set null;

create or replace function public.manual_revenue_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists manual_revenue_import_batches_touch_updated_at on public.manual_revenue_import_batches;
create trigger manual_revenue_import_batches_touch_updated_at
before update on public.manual_revenue_import_batches
for each row execute function public.manual_revenue_touch_updated_at();

drop trigger if exists manual_revenue_import_items_touch_updated_at on public.manual_revenue_import_items;
create trigger manual_revenue_import_items_touch_updated_at
before update on public.manual_revenue_import_items
for each row execute function public.manual_revenue_touch_updated_at();

alter table public.manual_revenue_import_batches enable row level security;
alter table public.manual_revenue_import_items enable row level security;
alter table public.serpro_document_access_events enable row level security;

drop policy if exists manual_revenue_batches_access on public.manual_revenue_import_batches;
create policy manual_revenue_batches_access on public.manual_revenue_import_batches
  for all using (public.serpro_can_access_org(organization_id)) with check (public.serpro_can_access_org(organization_id));

drop policy if exists manual_revenue_items_access on public.manual_revenue_import_items;
create policy manual_revenue_items_access on public.manual_revenue_import_items
  for all using (public.serpro_can_access_org(organization_id)) with check (public.serpro_can_access_org(organization_id));

drop policy if exists serpro_document_access_events_access on public.serpro_document_access_events;
create policy serpro_document_access_events_access on public.serpro_document_access_events
  for all using (public.serpro_can_access_org(organization_id)) with check (public.serpro_can_access_org(organization_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'revenue-documents',
  'revenue-documents',
  false,
  52428800,
  array[
    'application/pdf',
    'application/xml',
    'text/xml',
    'application/json',
    'text/csv',
    'application/zip',
    'application/x-zip-compressed',
    'text/plain'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists revenue_documents_storage_read on storage.objects;
create policy revenue_documents_storage_read on storage.objects
  for select using (
    bucket_id = 'revenue-documents'
    and auth.uid() is not null
    and exists (
      select 1
      from public.serpro_documents d
      where d.storage_bucket = bucket_id
        and d.storage_path = name
        and public.serpro_can_access_org(d.organization_id)
    )
  );

notify pgrst, 'reload schema';
