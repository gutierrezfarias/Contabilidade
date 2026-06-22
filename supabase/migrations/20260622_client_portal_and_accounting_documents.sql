-- CONT HUB - Portal do Cliente e Documentos Contabeis.
-- Migration incremental, idempotente e nao destrutiva.
-- Complementa accounting_documents e cria acesso isolado por organization_id/client_id.

create extension if not exists pgcrypto;

create table if not exists public.client_portal_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  email_normalized text not null,
  full_name text not null default '',
  role text not null default 'viewer',
  status text not null default 'invited',
  invited_at timestamptz not null default now(),
  activated_at timestamptz,
  recovery_requested_at timestamptz,
  last_access_at timestamptz,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint client_portal_users_role_check
    check (role in ('owner', 'viewer')),
  constraint client_portal_users_status_check
    check (status in ('invited', 'active', 'disabled'))
);

create unique index if not exists client_portal_users_email_idx
  on public.client_portal_users (organization_id, client_id, email_normalized)
  where deleted_at is null;
create index if not exists client_portal_users_user_idx
  on public.client_portal_users (user_id)
  where deleted_at is null;
create index if not exists client_portal_users_client_idx
  on public.client_portal_users (organization_id, client_id, status)
  where deleted_at is null;

create table if not exists public.client_portal_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  portal_user_id uuid references public.client_portal_users (id) on delete set null,
  email text not null,
  email_normalized text not null,
  role text not null default 'viewer',
  token_hash text not null default '',
  status text not null default 'pending',
  expires_at timestamptz,
  accepted_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_portal_invites_role_check
    check (role in ('owner', 'viewer')),
  constraint client_portal_invites_status_check
    check (status in ('pending', 'accepted', 'cancelled', 'expired'))
);

create index if not exists client_portal_invites_lookup_idx
  on public.client_portal_invites (organization_id, client_id, email_normalized, status);

create table if not exists public.client_portal_access_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  portal_user_id uuid references public.client_portal_users (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  action text not null,
  resource_type text not null default '',
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text not null default '',
  user_agent text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists client_portal_access_logs_client_idx
  on public.client_portal_access_logs (organization_id, client_id, created_at desc);
create index if not exists client_portal_access_logs_user_idx
  on public.client_portal_access_logs (portal_user_id, created_at desc);

alter table public.accounting_documents
  add column if not exists category text not null default 'Documento contabil',
  add column if not exists description text not null default '',
  add column if not exists approval_status text not null default 'pending',
  add column if not exists version_number integer not null default 1,
  add column if not exists responsible_user_id uuid references auth.users (id),
  add column if not exists approved_by uuid references auth.users (id),
  add column if not exists approved_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists replaced_by_document_id uuid references public.accounting_documents (id) on delete set null,
  add column if not exists deleted_by uuid references auth.users (id),
  add column if not exists checksum_sha256 text not null default '',
  add column if not exists original_file_name text not null default '',
  add column if not exists storage_bucket text not null default 'accounting-documents';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.accounting_documents'::regclass
      and conname = 'accounting_documents_status_check'
  ) then
    alter table public.accounting_documents
      drop constraint accounting_documents_status_check;
  end if;

  alter table public.accounting_documents
    add constraint accounting_documents_status_check
    check (status in ('available', 'sent', 'viewed', 'downloaded', 'archived', 'rejected', 'replaced'));
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.accounting_documents'::regclass
      and conname = 'accounting_documents_approval_status_check'
  ) then
    alter table public.accounting_documents
      add constraint accounting_documents_approval_status_check
      check (approval_status in ('pending', 'approved', 'rejected', 'delivered'));
  end if;
end $$;

create index if not exists accounting_documents_portal_lookup_idx
  on public.accounting_documents (organization_id, client_id, deleted_at, created_at desc);
create index if not exists accounting_documents_checksum_idx
  on public.accounting_documents (organization_id, client_id, checksum_sha256)
  where checksum_sha256 <> '' and deleted_at is null;

create or replace function public.client_portal_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.email is not null then
    new.email_normalized := lower(trim(new.email));
  end if;
  return new;
end;
$$;

drop trigger if exists client_portal_users_updated_at_trigger on public.client_portal_users;
create trigger client_portal_users_updated_at_trigger
before insert or update on public.client_portal_users
for each row execute function public.client_portal_touch_updated_at();

drop trigger if exists client_portal_invites_updated_at_trigger on public.client_portal_invites;
create trigger client_portal_invites_updated_at_trigger
before insert or update on public.client_portal_invites
for each row execute function public.client_portal_touch_updated_at();

create or replace function public.client_portal_can_access(target_org uuid, target_client uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.accounting_can_access_org(target_org)
  or exists (
    select 1
    from public.client_portal_users cpu
    where cpu.organization_id = target_org
      and cpu.client_id = target_client
      and cpu.status = 'active'
      and cpu.deleted_at is null
      and (
        cpu.user_id = auth.uid()
        or cpu.email_normalized = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  );
$$;

create or replace function public.claim_client_portal_access()
returns table (
  id uuid,
  organization_id uuid,
  client_id uuid,
  email text,
  full_name text,
  role text,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or current_email = '' then
    return;
  end if;

  update public.client_portal_users cpu
     set user_id = coalesce(cpu.user_id, auth.uid()),
         status = case when cpu.status = 'invited' then 'active' else cpu.status end,
         activated_at = coalesce(cpu.activated_at, now()),
         last_access_at = now(),
         updated_by = auth.uid()
   where cpu.email_normalized = current_email
     and cpu.status in ('invited', 'active')
     and cpu.deleted_at is null
     and (cpu.user_id is null or cpu.user_id = auth.uid());

  return query
    select cpu.id,
           cpu.organization_id,
           cpu.client_id,
           cpu.email,
           cpu.full_name,
           cpu.role,
           cpu.status
      from public.client_portal_users cpu
     where cpu.email_normalized = current_email
       and cpu.status = 'active'
       and cpu.deleted_at is null
       and (cpu.user_id = auth.uid() or cpu.user_id is null)
     order by cpu.last_access_at desc nulls last, cpu.created_at desc;
end;
$$;

create or replace function public.upsert_client_portal_user(
  p_organization_id uuid,
  p_client_id uuid,
  p_email text,
  p_full_name text default '',
  p_role text default 'viewer'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(coalesce(p_email, '')));
  matched_user_id uuid;
  portal_id uuid;
begin
  if not public.accounting_can_access_org(p_organization_id) then
    raise exception 'Sem permissao para convidar usuario do portal.';
  end if;

  if normalized_email = '' or position('@' in normalized_email) = 0 then
    raise exception 'E-mail do portal invalido.';
  end if;

  if not exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.organization_id = p_organization_id
  ) then
    raise exception 'Cliente nao pertence a organizacao informada.';
  end if;

  select au.id
    into matched_user_id
    from auth.users au
   where lower(au.email) = normalized_email
   limit 1;

  update public.client_portal_users cpu
     set full_name = coalesce(nullif(p_full_name, ''), cpu.full_name),
         role = case when p_role in ('owner', 'viewer') then p_role else cpu.role end,
         status = case when matched_user_id is null then 'invited' else 'active' end,
         user_id = coalesce(cpu.user_id, matched_user_id),
         updated_by = auth.uid()
   where cpu.organization_id = p_organization_id
     and cpu.client_id = p_client_id
     and cpu.email_normalized = normalized_email
     and cpu.deleted_at is null
   returning cpu.id into portal_id;

  if portal_id is null then
    insert into public.client_portal_users (
      organization_id,
      client_id,
      user_id,
      email,
      email_normalized,
      full_name,
      role,
      status,
      activated_at,
      created_by,
      updated_by
    )
    values (
      p_organization_id,
      p_client_id,
      matched_user_id,
      normalized_email,
      normalized_email,
      coalesce(p_full_name, ''),
      case when p_role in ('owner', 'viewer') then p_role else 'viewer' end,
      case when matched_user_id is null then 'invited' else 'active' end,
      case when matched_user_id is null then null else now() end,
      auth.uid(),
      auth.uid()
    )
    returning id into portal_id;
  end if;

  insert into public.client_portal_invites (
    organization_id,
    client_id,
    portal_user_id,
    email,
    email_normalized,
    role,
    status,
    expires_at,
    created_by
  )
  values (
    p_organization_id,
    p_client_id,
    portal_id,
    normalized_email,
    normalized_email,
    case when p_role in ('owner', 'viewer') then p_role else 'viewer' end,
    case when matched_user_id is null then 'pending' else 'accepted' end,
    now() + interval '14 days',
    auth.uid()
  );

  return portal_id;
end;
$$;

create or replace function public.log_client_portal_access(
  p_organization_id uuid,
  p_client_id uuid,
  p_action text,
  p_resource_type text default '',
  p_resource_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  portal_id uuid;
  log_id uuid;
begin
  if not public.client_portal_can_access(p_organization_id, p_client_id) then
    raise exception 'Sem permissao para registrar acesso do portal.';
  end if;

  select cpu.id
    into portal_id
    from public.client_portal_users cpu
   where cpu.organization_id = p_organization_id
     and cpu.client_id = p_client_id
     and cpu.status = 'active'
     and cpu.deleted_at is null
     and (cpu.user_id = auth.uid() or cpu.email_normalized = lower(coalesce(auth.jwt() ->> 'email', '')))
   order by cpu.last_access_at desc nulls last
   limit 1;

  insert into public.client_portal_access_logs (
    organization_id,
    client_id,
    portal_user_id,
    user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    p_organization_id,
    p_client_id,
    portal_id,
    auth.uid(),
    p_action,
    p_resource_type,
    p_resource_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into log_id;

  return log_id;
end;
$$;

alter table public.client_portal_users enable row level security;
alter table public.client_portal_invites enable row level security;
alter table public.client_portal_access_logs enable row level security;

drop policy if exists "client portal users org members manage" on public.client_portal_users;
create policy "client portal users org members manage"
on public.client_portal_users
for all
using (public.accounting_can_access_org(organization_id))
with check (public.accounting_can_access_org(organization_id));

drop policy if exists "client portal users own read" on public.client_portal_users;
create policy "client portal users own read"
on public.client_portal_users
for select
using (
  status = 'active'
  and deleted_at is null
  and (
    user_id = auth.uid()
    or email_normalized = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

drop policy if exists "client portal invites org members manage" on public.client_portal_invites;
create policy "client portal invites org members manage"
on public.client_portal_invites
for all
using (public.accounting_can_access_org(organization_id))
with check (public.accounting_can_access_org(organization_id));

drop policy if exists "client portal access logs org members read" on public.client_portal_access_logs;
create policy "client portal access logs org members read"
on public.client_portal_access_logs
for select
using (public.accounting_can_access_org(organization_id));

drop policy if exists "client portal access logs portal insert" on public.client_portal_access_logs;
create policy "client portal access logs portal insert"
on public.client_portal_access_logs
for insert
with check (public.client_portal_can_access(organization_id, client_id));

drop policy if exists "accounting documents portal read own client" on public.accounting_documents;
create policy "accounting documents portal read own client"
on public.accounting_documents
for select
using (
  deleted_at is null
  and public.client_portal_can_access(organization_id, client_id)
);

drop policy if exists "accounting tax records portal read own client" on public.accounting_tax_records;
create policy "accounting tax records portal read own client"
on public.accounting_tax_records
for select
using (
  deleted_at is null
  and public.client_portal_can_access(organization_id, client_id)
);

drop policy if exists "accounting obligations portal read own client" on public.accounting_obligations;
create policy "accounting obligations portal read own client"
on public.accounting_obligations
for select
using (
  deleted_at is null
  and public.client_portal_can_access(organization_id, client_id)
);

drop policy if exists "nfe documents portal read own client" on public.nfe_documents;
create policy "nfe documents portal read own client"
on public.nfe_documents
for select
using (public.client_portal_can_access(organization_id, client_id));

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'accounting-documents',
      'accounting-documents',
      false,
      26214400,
      array[
        'application/pdf',
        'image/png',
        'image/jpeg',
        'text/plain',
        'text/csv',
        'application/xml',
        'text/xml',
        'application/json',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ]::text[]
    )
    on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

drop policy if exists accounting_documents_storage_read on storage.objects;
create policy accounting_documents_storage_read on storage.objects
for select
to authenticated
using (
  bucket_id = 'accounting-documents'
  and public.client_portal_can_access(
    ((storage.foldername(name))[1])::uuid,
    ((storage.foldername(name))[2])::uuid
  )
);

drop policy if exists accounting_documents_storage_insert on storage.objects;
create policy accounting_documents_storage_insert on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'accounting-documents'
  and public.accounting_can_access_org(((storage.foldername(name))[1])::uuid)
);

drop policy if exists accounting_documents_storage_update on storage.objects;
create policy accounting_documents_storage_update on storage.objects
for update
to authenticated
using (
  bucket_id = 'accounting-documents'
  and public.accounting_can_access_org(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'accounting-documents'
  and public.accounting_can_access_org(((storage.foldername(name))[1])::uuid)
);

drop policy if exists accounting_documents_storage_delete on storage.objects;
create policy accounting_documents_storage_delete on storage.objects
for delete
to authenticated
using (
  bucket_id = 'accounting-documents'
  and public.accounting_can_access_org(((storage.foldername(name))[1])::uuid)
);

grant select, insert, update on public.client_portal_users to authenticated;
grant select, insert, update on public.client_portal_invites to authenticated;
grant select, insert on public.client_portal_access_logs to authenticated;
grant select, insert, update on public.accounting_documents to authenticated;
grant select on public.accounting_tax_records to authenticated;
grant select on public.accounting_obligations to authenticated;
grant select on public.nfe_documents to authenticated;
grant execute on function public.claim_client_portal_access() to authenticated;
grant execute on function public.upsert_client_portal_user(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.log_client_portal_access(uuid, uuid, text, text, uuid, jsonb) to authenticated;

grant all privileges on public.client_portal_users to service_role, postgres;
grant all privileges on public.client_portal_invites to service_role, postgres;
grant all privileges on public.client_portal_access_logs to service_role, postgres;
grant all privileges on public.accounting_documents to service_role, postgres;
grant all privileges on public.accounting_tax_records to service_role, postgres;
grant all privileges on public.accounting_obligations to service_role, postgres;
grant all privileges on public.nfe_documents to service_role, postgres;

notify pgrst, 'reload schema';
