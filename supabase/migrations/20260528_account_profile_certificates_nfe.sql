alter table public.digital_certificates
  add column if not exists serial_number text not null default '',
  add column if not exists issuer text not null default '',
  add column if not exists environment text not null default 'homologacao',
  add column if not exists state_uf text not null default '',
  add column if not exists municipal_code text not null default '';

do $$
begin
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
  status text not null default 'Rascunho'
    check (status in ('Rascunho', 'Pendente', 'Consultada', 'Autorizada', 'Rejeitada', 'Cancelada')),
  operation_type text not null default '',
  recipient_name text not null default '',
  recipient_document text not null default '',
  description text not null default '',
  xml_url text,
  danfe_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nfe_documents enable row level security;

drop policy if exists "Organization access nfe documents" on public.nfe_documents;
create policy "Organization access nfe documents"
on public.nfe_documents
for all
using (public.is_admin() or public.is_org_member(organization_id))
with check (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Members update own organization" on public.organizations;
create policy "Members update own organization"
on public.organizations
for update
using (public.is_org_member(id))
with check (public.is_org_member(id));

drop policy if exists "Members insert own admin client profile" on public.admin_client_profiles;
create policy "Members insert own admin client profile"
on public.admin_client_profiles
for insert
to authenticated
with check (public.is_org_member(organization_id));

drop policy if exists "Members update own admin client profile" on public.admin_client_profiles;
create policy "Members update own admin client profile"
on public.admin_client_profiles
for update
to authenticated
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

notify pgrst, 'reload schema';
