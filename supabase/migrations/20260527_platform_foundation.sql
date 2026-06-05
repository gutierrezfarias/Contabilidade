create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role text not null default 'client' check (role in ('admin', 'client')),
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cnpj text not null default '',
  active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
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
    select 1 from public.organization_members
    where organization_id = target_org and user_id = auth.uid()
  );
$$;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_name text not null,
  cnpj text not null,
  phone text not null default '',
  email text not null default '',
  cep text not null default '',
  address text not null default '',
  photo_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.client_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  competence_month integer not null check (competence_month between 1 and 12),
  competence_year integer not null check (competence_year >= 2000),
  amount numeric(14,2) not null default 0,
  due_date date not null,
  status text not null default 'Pendente' check (status in ('Pago', 'Pendente', 'Vencido')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.fiscal_obligations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  client_count integer not null default 0,
  due_date date not null,
  status text not null default 'Pendente' check (status in ('Concluido', 'Pendente', 'Vencido')),
  created_at timestamptz not null default now()
);

create table public.digital_certificates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  certificate_type text not null check (certificate_type in ('A1', 'A3', 'e-CNPJ', 'e-CPF')),
  holder_name text not null,
  tax_id text not null,
  valid_from date,
  valid_until date,
  status text not null default 'Pendente' check (status in ('Pendente', 'Ativo', 'Expirado', 'Revogado')),
  secure_reference text,
  created_at timestamptz not null default now()
);

comment on column public.digital_certificates.secure_reference is
  'Referencia a cofre/backend criptografado. Nunca armazene PFX ou senha no frontend.';

create table public.certificate_services (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references public.digital_certificates (id) on delete cascade,
  service_code text not null check (service_code in ('nfe', 'nfce', 'cte', 'nfse', 'ecac')),
  enabled boolean not null default false,
  integration_status text not null default 'Nao configurado'
    check (integration_status in ('Nao configurado', 'Configurando', 'Ativo', 'Falha')),
  unique (certificate_id, service_code)
);

create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null,
  status text not null default 'Nao configurado'
    check (status in ('Nao configurado', 'Configurando', 'Ativo', 'Falha')),
  configuration jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

comment on column public.integration_connections.configuration is
  'Somente configuracao nao sensivel. Tokens e certificados devem ficar em backend/cofre.';

create table public.company_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  company_name text not null default '',
  logo_url text not null default '',
  cep text not null default '',
  address text not null default '',
  neighborhood text not null default '',
  city text not null default '',
  state text not null default '',
  partner_rg text not null default '',
  partner_cnh text not null default '',
  partner_cpf text not null default '',
  residence_proof text not null default '',
  cnpj text not null default '',
  municipal_registration text not null default '',
  state_registration text not null default '',
  articles_of_association text not null default '',
  commercial_address_proof text not null default '',
  updated_at timestamptz not null default now()
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  role text not null default '',
  email text not null default '',
  created_at timestamptz not null default now()
);

create table public.home_settings (
  id boolean primary key default true check (id),
  hero_title text not null default '',
  hero_description text not null default '',
  footer_description text not null default '',
  footer_email text not null default '',
  footer_phone text not null default '',
  footer_address text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.home_settings (id) values (true) on conflict (id) do nothing;

create table public.support_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null default auth.uid() references auth.users (id),
  organization_id uuid not null references public.organizations (id),
  reason text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;

  insert into public.organizations (name, cnpj, created_by)
  values (
    coalesce(
      nullif(new.raw_user_meta_data ->> 'organization_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(new.email, '@', 1),
      'Escritorio'
    ),
    '',
    new.id
  )
  on conflict do nothing;

  insert into public.organization_members (organization_id, user_id, member_role)
  select id, new.id, 'owner'
  from public.organizations
  where created_by = new.id
  order by created_at
  limit 1
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.clients enable row level security;
alter table public.client_payments enable row level security;
alter table public.fiscal_obligations enable row level security;
alter table public.digital_certificates enable row level security;
alter table public.certificate_services enable row level security;
alter table public.integration_connections enable row level security;
alter table public.company_settings enable row level security;
alter table public.employees enable row level security;
alter table public.home_settings enable row level security;
alter table public.support_sessions enable row level security;

create policy "Profile owner can read" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "Admins manage profiles" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Members or admins read organizations" on public.organizations
  for select using (public.is_admin() or public.is_org_member(id));
create policy "Authenticated users create organization" on public.organizations
  for insert to authenticated with check (created_by = auth.uid());
create policy "Admins manage organizations" on public.organizations
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Members read memberships" on public.organization_members
  for select using (public.is_admin() or public.is_org_member(organization_id));
create policy "Creator enrolls self" on public.organization_members
  for insert to authenticated with check (
    user_id = auth.uid() and exists (
      select 1 from public.organizations
      where id = organization_id and created_by = auth.uid()
    )
  );
create policy "Admins manage memberships" on public.organization_members
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Organization access clients" on public.clients
  for all using (public.is_admin() or public.is_org_member(organization_id))
  with check (public.is_admin() or public.is_org_member(organization_id));
create policy "Organization access payments" on public.client_payments
  for all using (public.is_admin() or public.is_org_member(organization_id))
  with check (public.is_admin() or public.is_org_member(organization_id));
create policy "Organization access obligations" on public.fiscal_obligations
  for all using (public.is_admin() or public.is_org_member(organization_id))
  with check (public.is_admin() or public.is_org_member(organization_id));
create policy "Organization access certificates" on public.digital_certificates
  for all using (public.is_admin() or public.is_org_member(organization_id))
  with check (public.is_admin() or public.is_org_member(organization_id));
create policy "Organization access certificate services" on public.certificate_services
  for all using (
    exists (
      select 1 from public.digital_certificates dc
      where dc.id = certificate_id
        and (public.is_admin() or public.is_org_member(dc.organization_id))
    )
  ) with check (
    exists (
      select 1 from public.digital_certificates dc
      where dc.id = certificate_id
        and (public.is_admin() or public.is_org_member(dc.organization_id))
    )
  );
create policy "Organization access integrations" on public.integration_connections
  for all using (public.is_admin() or public.is_org_member(organization_id))
  with check (public.is_admin() or public.is_org_member(organization_id));
create policy "Organization access company settings" on public.company_settings
  for all using (public.is_admin() or public.is_org_member(organization_id))
  with check (public.is_admin() or public.is_org_member(organization_id));
create policy "Organization access employees" on public.employees
  for all using (public.is_admin() or public.is_org_member(organization_id))
  with check (public.is_admin() or public.is_org_member(organization_id));

create policy "Public can read home settings" on public.home_settings
  for select to anon, authenticated using (true);
create policy "Admins manage home settings" on public.home_settings
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Admins create support sessions" on public.support_sessions
  for insert with check (public.is_admin() and admin_user_id = auth.uid());
create policy "Admins read support sessions" on public.support_sessions
  for select using (public.is_admin());
create policy "Admins close support sessions" on public.support_sessions
  for update using (public.is_admin() and admin_user_id = auth.uid())
  with check (public.is_admin() and admin_user_id = auth.uid());

-- Execute once for the authenticated account that must be administrator:
-- update public.profiles set role = 'admin' where id = '<AUTH_USER_UUID>';
