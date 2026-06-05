-- CONT HUB - reparo de permissoes para Configuracoes do contador.
-- Objetivo: permitir que o contador comum salve dados do proprio escritorio
-- sem precisar ser admin da plataforma.

create extension if not exists pgcrypto;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'client',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cnpj text not null default '',
  active boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  member_role text not null default 'owner' check (member_role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.admin_client_profiles (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  contact_name text not null default '',
  email text not null default '',
  phone text not null default '',
  cep text not null default '',
  address text not null default '',
  address_complement text not null default '',
  neighborhood text not null default '',
  city text not null default '',
  state text not null default '',
  discount_percent numeric(5,2) not null default 0,
  active boolean not null default true,
  subscription_exempt boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_client_profiles add column if not exists contact_name text not null default '';
alter table public.admin_client_profiles add column if not exists email text not null default '';
alter table public.admin_client_profiles add column if not exists phone text not null default '';
alter table public.admin_client_profiles add column if not exists cep text not null default '';
alter table public.admin_client_profiles add column if not exists address text not null default '';
alter table public.admin_client_profiles add column if not exists address_complement text not null default '';
alter table public.admin_client_profiles add column if not exists neighborhood text not null default '';
alter table public.admin_client_profiles add column if not exists city text not null default '';
alter table public.admin_client_profiles add column if not exists state text not null default '';
alter table public.admin_client_profiles add column if not exists discount_percent numeric(5,2) not null default 0;
alter table public.admin_client_profiles add column if not exists active boolean not null default true;
alter table public.admin_client_profiles add column if not exists subscription_exempt boolean not null default false;
alter table public.admin_client_profiles add column if not exists notes text not null default '';
alter table public.admin_client_profiles add column if not exists updated_at timestamptz not null default now();

create table if not exists public.company_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  company_name text not null default '',
  logo_url text not null default '',
  logo_data text,
  cep text not null default '',
  address text not null default '',
  address_complement text not null default '',
  neighborhood text not null default '',
  city text not null default '',
  state text not null default '',
  phone text not null default '',
  whatsapp text not null default '',
  website text not null default '',
  opening_hours text not null default '',
  business_description text not null default '',
  cnpj text not null default '',
  municipal_registration text not null default '',
  state_registration text not null default '',
  articles_of_association text not null default '',
  commercial_address_proof text not null default '',
  cnpj_document_data text,
  cnpj_document_name text not null default '',
  cnpj_document_text text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.company_settings add column if not exists logo_url text not null default '';
alter table public.company_settings add column if not exists logo_data text;
alter table public.company_settings add column if not exists address_complement text not null default '';
alter table public.company_settings add column if not exists phone text not null default '';
alter table public.company_settings add column if not exists whatsapp text not null default '';
alter table public.company_settings add column if not exists website text not null default '';
alter table public.company_settings add column if not exists opening_hours text not null default '';
alter table public.company_settings add column if not exists business_description text not null default '';
alter table public.company_settings add column if not exists cnpj_document_data text;
alter table public.company_settings add column if not exists cnpj_document_name text not null default '';
alter table public.company_settings add column if not exists cnpj_document_text text not null default '';
alter table public.company_settings add column if not exists updated_at timestamptz not null default now();

create table if not exists public.company_partners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null default '',
  rg text not null default '',
  cnh text not null default '',
  cpf text not null default '',
  residence_proof_data text,
  residence_proof_name text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  role text not null default '',
  email text not null default '',
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = 'admin'
  )
  or lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'gutierrezfarias1@hotmail.com',
    'gutierrezfarias7@gmail.com'
  );
$$;

create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_org
      and user_id = auth.uid()
  );
$$;

-- Repara vinculos antigos quando a organizacao foi criada pelo proprio usuario.
insert into public.organization_members (organization_id, user_id, member_role)
select o.id, o.created_by, 'owner'
from public.organizations o
where o.created_by is not null
on conflict (organization_id, user_id) do nothing;

-- Repara vinculos antigos quando o e-mail do perfil do escritorio bate com o auth.users.email.
insert into public.organization_members (organization_id, user_id, member_role)
select p.organization_id, u.id, 'owner'
from public.admin_client_profiles p
join auth.users u
  on lower(u.email) = lower(p.email)
where coalesce(p.email, '') <> ''
on conflict (organization_id, user_id) do nothing;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.admin_client_profiles enable row level security;
alter table public.company_settings enable row level security;
alter table public.company_partners enable row level security;
alter table public.employees enable row level security;

drop policy if exists "Members or admins read organizations" on public.organizations;
create policy "Members or admins read organizations"
on public.organizations
for select
using (public.is_admin() or public.is_org_member(id));

drop policy if exists "Authenticated users create organization" on public.organizations;
create policy "Authenticated users create organization"
on public.organizations
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "Members update own organization" on public.organizations;
create policy "Members update own organization"
on public.organizations
for update
using (public.is_admin() or public.is_org_member(id))
with check (public.is_admin() or public.is_org_member(id));

drop policy if exists "Members read memberships" on public.organization_members;
create policy "Members read memberships"
on public.organization_members
for select
using (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Creator enrolls self" on public.organization_members;
create policy "Creator enrolls self"
on public.organization_members
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.organizations
    where id = organization_id
      and created_by = auth.uid()
  )
);

drop policy if exists "Admins manage memberships" on public.organization_members;
create policy "Admins manage memberships"
on public.organization_members
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins manage admin client profiles" on public.admin_client_profiles;
drop policy if exists "Members read own admin client profile" on public.admin_client_profiles;
drop policy if exists "Members insert own admin client profile" on public.admin_client_profiles;
drop policy if exists "Members update own admin client profile" on public.admin_client_profiles;
drop policy if exists "Organization access admin client profiles" on public.admin_client_profiles;
create policy "Organization access admin client profiles"
on public.admin_client_profiles
for all
using (public.is_admin() or public.is_org_member(organization_id))
with check (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access company settings" on public.company_settings;
create policy "Organization access company settings"
on public.company_settings
for all
using (public.is_admin() or public.is_org_member(organization_id))
with check (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access company partners" on public.company_partners;
create policy "Organization access company partners"
on public.company_partners
for all
using (public.is_admin() or public.is_org_member(organization_id))
with check (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access employees" on public.employees;
create policy "Organization access employees"
on public.employees
for all
using (public.is_admin() or public.is_org_member(organization_id))
with check (public.is_admin() or public.is_org_member(organization_id));

notify pgrst, 'reload schema';
