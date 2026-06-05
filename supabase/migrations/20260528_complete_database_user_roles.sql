-- CONT HUB - estrutura completa para o Supabase.
-- Rode este script inteiro no SQL Editor do Supabase.
-- Ele usa public.user_roles como fonte de permissao Admin.

create extension if not exists pgcrypto;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'client',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_roles add column if not exists created_at timestamptz not null default now();
alter table public.user_roles add column if not exists updated_at timestamptz not null default now();
create unique index if not exists user_roles_user_id_idx on public.user_roles (user_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_roles_role_check'
      and conrelid = 'public.user_roles'::regclass
  ) then
    alter table public.user_roles
      add constraint user_roles_role_check check (role in ('admin', 'client'));
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  role text not null default 'client' check (role in ('admin', 'client')),
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text not null default '';

create or replace function public.auth_email_exists(candidate_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where lower(email) = lower(trim(candidate_email))
  );
$$;

grant execute on function public.auth_email_exists(text) to anon, authenticated;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cnpj text not null default '',
  active boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

alter table public.organizations add column if not exists cnpj text not null default '';
alter table public.organizations add column if not exists active boolean not null default true;
alter table public.organizations add column if not exists created_by uuid references auth.users (id);
alter table public.organizations add column if not exists created_at timestamptz not null default now();

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  member_role text not null default 'owner' check (member_role in ('owner', 'member')),
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

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin();
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

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_name text not null,
  cnpj text not null default '',
  phone text not null default '',
  email text not null default '',
  cep text not null default '',
  address text not null default '',
  neighborhood text not null default '',
  city text not null default '',
  state text not null default '',
  tax_regime text not null default 'Nao informado',
  company_size text not null default 'Nao informado',
  main_cnae text not null default '',
  legal_nature text not null default '',
  photo_url text,
  photo_data text,
  is_monthly boolean not null default true,
  monthly_fee numeric(12,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients add column if not exists photo_data text;
alter table public.clients add column if not exists neighborhood text not null default '';
alter table public.clients add column if not exists city text not null default '';
alter table public.clients add column if not exists state text not null default '';
alter table public.clients add column if not exists tax_regime text not null default 'Nao informado';
alter table public.clients add column if not exists company_size text not null default 'Nao informado';
alter table public.clients add column if not exists main_cnae text not null default '';
alter table public.clients add column if not exists legal_nature text not null default '';
alter table public.clients add column if not exists is_monthly boolean not null default true;
alter table public.clients add column if not exists monthly_fee numeric(12,2) not null default 0;

comment on column public.clients.photo_data is
  'Imagem do cliente/logotipo em data URL. Para arquivos maiores, migrar para Supabase Storage.';

create or replace function public.format_br_cnpj(input_value text)
returns text
language plpgsql
immutable
as $$
declare
  digits text;
begin
  digits := regexp_replace(coalesce(input_value, ''), '\D', '', 'g');

  if length(digits) = 14 then
    return regexp_replace(digits, '^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$', '\1.\2.\3/\4-\5');
  end if;

  return coalesce(input_value, '');
end;
$$;

create or replace function public.format_br_phone(input_value text)
returns text
language plpgsql
immutable
as $$
declare
  digits text;
begin
  digits := regexp_replace(coalesce(input_value, ''), '\D', '', 'g');

  if length(digits) = 11 then
    return regexp_replace(digits, '^(\d{2})(\d{5})(\d{4})$', '(\1) \2-\3');
  end if;

  if length(digits) = 10 then
    return regexp_replace(digits, '^(\d{2})(\d{4})(\d{4})$', '(\1) \2-\3');
  end if;

  return coalesce(input_value, '');
end;
$$;

create or replace function public.format_br_cep(input_value text)
returns text
language plpgsql
immutable
as $$
declare
  digits text;
begin
  digits := regexp_replace(coalesce(input_value, ''), '\D', '', 'g');

  if length(digits) = 8 then
    return regexp_replace(digits, '^(\d{5})(\d{3})$', '\1-\2');
  end if;

  return coalesce(input_value, '');
end;
$$;

create or replace function public.normalize_client_fields()
returns trigger
language plpgsql
as $$
begin
  new.cnpj := public.format_br_cnpj(new.cnpj);
  new.phone := public.format_br_phone(new.phone);
  new.cep := public.format_br_cep(new.cep);
  new.tax_regime := coalesce(nullif(new.tax_regime, ''), 'Nao informado');
  new.company_size := coalesce(nullif(new.company_size, ''), 'Nao informado');
  new.main_cnae := coalesce(new.main_cnae, '');
  new.legal_nature := coalesce(new.legal_nature, '');
  new.photo_data := nullif(new.photo_data, '');
  new.monthly_fee := coalesce(new.monthly_fee, 0);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists normalize_client_fields_trigger on public.clients;
create trigger normalize_client_fields_trigger
before insert or update on public.clients
for each row execute function public.normalize_client_fields();

create table if not exists public.client_payments (
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

create table if not exists public.fiscal_obligations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  client_count integer not null default 0,
  due_date date not null,
  status text not null default 'Pendente' check (status in ('Concluido', 'Pendente', 'Vencido')),
  created_at timestamptz not null default now()
);

create table if not exists public.digital_certificates (
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
  serial_number text not null default '',
  issuer text not null default '',
  environment text not null default 'homologacao' check (environment in ('homologacao', 'producao')),
  state_uf text not null default '',
  municipal_code text not null default '',
  created_at timestamptz not null default now()
);

alter table public.digital_certificates add column if not exists serial_number text not null default '';
alter table public.digital_certificates add column if not exists issuer text not null default '';
alter table public.digital_certificates add column if not exists environment text not null default 'homologacao';
alter table public.digital_certificates add column if not exists state_uf text not null default '';
alter table public.digital_certificates add column if not exists municipal_code text not null default '';

comment on column public.digital_certificates.secure_reference is
  'Referencia para cofre/backend criptografado. Nao armazene PFX ou senha no frontend.';

create table if not exists public.certificate_services (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references public.digital_certificates (id) on delete cascade,
  service_code text not null check (service_code in ('nfe', 'nfce', 'cte', 'nfse', 'ecac')),
  enabled boolean not null default false,
  integration_status text not null default 'Nao configurado'
    check (integration_status in ('Nao configurado', 'Configurando', 'Ativo', 'Falha')),
  unique (certificate_id, service_code)
);

create table if not exists public.integration_connections (
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
  partner_rg text not null default '',
  partner_cnh text not null default '',
  partner_cpf text not null default '',
  residence_proof text not null default '',
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

alter table public.company_settings add column if not exists logo_data text;
alter table public.company_settings add column if not exists address_complement text not null default '';
alter table public.company_settings add column if not exists cnpj_document_data text;
alter table public.company_settings add column if not exists cnpj_document_name text not null default '';
alter table public.company_settings add column if not exists cnpj_document_text text not null default '';

comment on column public.company_settings.logo_data is
  'Logo em data URL. Para arquivos maiores, migrar para Supabase Storage.';

comment on column public.company_settings.cnpj_document_data is
  'Documento CNPJ em data URL. Para arquivos maiores, migrar para Supabase Storage.';

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

create table if not exists public.home_settings (
  id boolean primary key default true check (id),
  hero_title text not null default '',
  hero_description text not null default '',
  footer_description text not null default '',
  footer_email text not null default '',
  footer_phone text not null default '',
  footer_address text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.home_slides (
  id uuid primary key default gen_random_uuid(),
  eyebrow text not null default '',
  title text not null default '',
  description text not null default '',
  theme text not null default 'focus' check (theme in ('focus', 'balance', 'growth')),
  button_label text not null default 'Comecar agora',
  button_url text not null default '/cadastro',
  image_url text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.home_banners (
  id uuid primary key default gen_random_uuid(),
  category text not null default '',
  title text not null default '',
  description text not null default '',
  image_url text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.home_footer_groups (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.home_footer_links (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.home_footer_groups (id) on delete cascade,
  label text not null default '',
  url text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_company_settings (
  id boolean primary key default true check (id),
  country_code text not null default 'BR',
  fields jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
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
  subscription_exempt boolean not null default false,
  notes text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.admin_client_profiles add column if not exists cep text not null default '';
alter table public.admin_client_profiles add column if not exists address_complement text not null default '';
alter table public.admin_client_profiles add column if not exists neighborhood text not null default '';

create table if not exists public.organization_app_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  application_id text not null,
  application_name text not null,
  status text not null default 'inativo' check (status in ('ativo', 'inativo', 'teste', 'cancelado')),
  monthly_price numeric(12,2) not null default 0,
  discount_percent numeric(5,2) not null default 0,
  subscription_exempt boolean not null default false,
  started_at date,
  next_billing_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, application_id)
);

create table if not exists public.financial_api_integrations (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  name text not null,
  status text not null default 'teste' check (status in ('ativo', 'inativo', 'teste')),
  active boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create unique index if not exists organization_app_subscriptions_org_app_idx
  on public.organization_app_subscriptions (organization_id, application_id);

create table if not exists public.support_sessions (
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
declare
  new_org_id uuid;
begin
  insert into public.user_roles (user_id, role)
  values (new.id, 'client')
  on conflict (user_id) do nothing;

  insert into public.profiles (id, full_name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''), lower(coalesce(new.email, '')), 'client')
  on conflict (id) do nothing;

  select id into new_org_id
  from public.organizations
  where created_by = new.id
  order by created_at
  limit 1;

  if new_org_id is null then
    insert into public.organizations (name, cnpj, active, created_by)
    values (
      coalesce(
        nullif(new.raw_user_meta_data ->> 'organization_name', ''),
        nullif(new.raw_user_meta_data ->> 'name', ''),
        split_part(new.email, '@', 1),
        'Escritorio'
      ),
      '',
      true,
      new.id
    )
    returning id into new_org_id;
  end if;

  insert into public.organization_members (organization_id, user_id, member_role)
  values (new_org_id, new.id, 'owner')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.user_roles enable row level security;
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
alter table public.company_partners enable row level security;
alter table public.employees enable row level security;
alter table public.home_settings enable row level security;
alter table public.home_slides enable row level security;
alter table public.home_banners enable row level security;
alter table public.home_footer_groups enable row level security;
alter table public.home_footer_links enable row level security;
alter table public.platform_company_settings enable row level security;
alter table public.admin_client_profiles enable row level security;
alter table public.organization_app_subscriptions enable row level security;
alter table public.financial_api_integrations enable row level security;
alter table public.nfe_documents enable row level security;
alter table public.support_sessions enable row level security;

drop policy if exists "Users read own role or admins read roles" on public.user_roles;
create policy "Users read own role or admins read roles" on public.user_roles
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Admins manage roles" on public.user_roles;
create policy "Admins manage roles" on public.user_roles
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Profile owner can read" on public.profiles;
create policy "Profile owner can read" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "Admins manage profiles" on public.profiles;
create policy "Admins manage profiles" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Members or admins read organizations" on public.organizations;
create policy "Members or admins read organizations" on public.organizations
  for select using (public.is_admin() or public.is_org_member(id));

drop policy if exists "Authenticated users create organization" on public.organizations;
create policy "Authenticated users create organization" on public.organizations
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "Admins manage organizations" on public.organizations;
create policy "Admins manage organizations" on public.organizations
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Members update own organization" on public.organizations;
create policy "Members update own organization" on public.organizations
  for update using (public.is_org_member(id)) with check (public.is_org_member(id));

drop policy if exists "Members read memberships" on public.organization_members;
create policy "Members read memberships" on public.organization_members
  for select using (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Creator enrolls self" on public.organization_members;
create policy "Creator enrolls self" on public.organization_members
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.organizations
      where id = organization_id
        and created_by = auth.uid()
    )
  );

drop policy if exists "Admins manage memberships" on public.organization_members;
create policy "Admins manage memberships" on public.organization_members
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Organization access clients" on public.clients;
create policy "Organization access clients" on public.clients
  for all using (public.is_admin() or public.is_org_member(organization_id))
  with check (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access payments" on public.client_payments;
create policy "Organization access payments" on public.client_payments
  for all using (public.is_admin() or public.is_org_member(organization_id))
  with check (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access obligations" on public.fiscal_obligations;
create policy "Organization access obligations" on public.fiscal_obligations
  for all using (public.is_admin() or public.is_org_member(organization_id))
  with check (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access certificates" on public.digital_certificates;
create policy "Organization access certificates" on public.digital_certificates
  for all using (public.is_admin() or public.is_org_member(organization_id))
  with check (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access certificate services" on public.certificate_services;
create policy "Organization access certificate services" on public.certificate_services
  for all using (
    exists (
      select 1
      from public.digital_certificates dc
      where dc.id = certificate_id
        and (public.is_admin() or public.is_org_member(dc.organization_id))
    )
  )
  with check (
    exists (
      select 1
      from public.digital_certificates dc
      where dc.id = certificate_id
        and (public.is_admin() or public.is_org_member(dc.organization_id))
    )
  );

drop policy if exists "Organization access integrations" on public.integration_connections;
create policy "Organization access integrations" on public.integration_connections
  for all using (public.is_admin() or public.is_org_member(organization_id))
  with check (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access company settings" on public.company_settings;
create policy "Organization access company settings" on public.company_settings
  for all using (public.is_admin() or public.is_org_member(organization_id))
  with check (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access company partners" on public.company_partners;
create policy "Organization access company partners" on public.company_partners
  for all using (public.is_admin() or public.is_org_member(organization_id))
  with check (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access employees" on public.employees;
create policy "Organization access employees" on public.employees
  for all using (public.is_admin() or public.is_org_member(organization_id))
  with check (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Public can read home settings" on public.home_settings;
create policy "Public can read home settings" on public.home_settings
  for select to anon, authenticated using (true);

drop policy if exists "Admins manage home settings" on public.home_settings;
create policy "Admins manage home settings" on public.home_settings
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Public read active home slides" on public.home_slides;
create policy "Public read active home slides" on public.home_slides
  for select to anon, authenticated using (active);

drop policy if exists "Admins manage home slides" on public.home_slides;
create policy "Admins manage home slides" on public.home_slides
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Public read active home banners" on public.home_banners;
create policy "Public read active home banners" on public.home_banners
  for select to anon, authenticated using (active);

drop policy if exists "Admins manage home banners" on public.home_banners;
create policy "Admins manage home banners" on public.home_banners
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Public read footer groups" on public.home_footer_groups;
create policy "Public read footer groups" on public.home_footer_groups
  for select to anon, authenticated using (true);

drop policy if exists "Admins manage footer groups" on public.home_footer_groups;
create policy "Admins manage footer groups" on public.home_footer_groups
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Public read active footer links" on public.home_footer_links;
create policy "Public read active footer links" on public.home_footer_links
  for select to anon, authenticated using (active);

drop policy if exists "Admins manage footer links" on public.home_footer_links;
create policy "Admins manage footer links" on public.home_footer_links
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins read platform company settings" on public.platform_company_settings;
create policy "Admins read platform company settings" on public.platform_company_settings
  for select to authenticated using (public.is_admin());

drop policy if exists "Admins manage platform company settings" on public.platform_company_settings;
create policy "Admins manage platform company settings" on public.platform_company_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage admin client profiles" on public.admin_client_profiles;
create policy "Admins manage admin client profiles" on public.admin_client_profiles
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Members read own admin client profile" on public.admin_client_profiles;
create policy "Members read own admin client profile" on public.admin_client_profiles
  for select using (public.is_org_member(organization_id));

drop policy if exists "Members insert own admin client profile" on public.admin_client_profiles;
create policy "Members insert own admin client profile" on public.admin_client_profiles
  for insert to authenticated with check (public.is_org_member(organization_id));

drop policy if exists "Members update own admin client profile" on public.admin_client_profiles;
create policy "Members update own admin client profile" on public.admin_client_profiles
  for update to authenticated using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "Admins manage organization app subscriptions" on public.organization_app_subscriptions;
create policy "Admins manage organization app subscriptions" on public.organization_app_subscriptions
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Members read own organization app subscriptions" on public.organization_app_subscriptions;
create policy "Members read own organization app subscriptions" on public.organization_app_subscriptions
  for select using (public.is_org_member(organization_id));

drop policy if exists "Admins manage financial api integrations" on public.financial_api_integrations;
create policy "Admins manage financial api integrations" on public.financial_api_integrations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Organization access nfe documents" on public.nfe_documents;
create policy "Organization access nfe documents" on public.nfe_documents
  for all using (public.is_admin() or public.is_org_member(organization_id))
  with check (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Admins create support sessions" on public.support_sessions;
create policy "Admins create support sessions" on public.support_sessions
  for insert with check (public.is_admin() and admin_user_id = auth.uid());

drop policy if exists "Admins read support sessions" on public.support_sessions;
create policy "Admins read support sessions" on public.support_sessions
  for select using (public.is_admin());

drop policy if exists "Admins close support sessions" on public.support_sessions;
create policy "Admins close support sessions" on public.support_sessions
  for update using (public.is_admin() and admin_user_id = auth.uid())
  with check (public.is_admin() and admin_user_id = auth.uid());

insert into public.home_settings (id)
values (true)
on conflict (id) do nothing;

insert into public.platform_company_settings (id, country_code, fields)
values (true, 'BR', '{}'::jsonb)
on conflict (id) do nothing;

insert into public.user_roles (user_id, role)
select u.id, 'client'
from auth.users u
where not exists (
  select 1 from public.user_roles ur where ur.user_id = u.id
);

insert into public.profiles (id, full_name, email, role)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1), ''),
  lower(coalesce(u.email, '')),
  case
    when lower(u.email) in ('gutierrezfarias1@hotmail.com', 'gutierrezfarias7@gmail.com')
      then 'admin'
    else 'client'
  end
from auth.users u
on conflict (id) do nothing;

insert into public.user_roles (user_id, role)
select u.id, 'admin'
from auth.users u
where lower(u.email) in ('gutierrezfarias1@hotmail.com', 'gutierrezfarias7@gmail.com')
on conflict (user_id) do update
set role = 'admin',
    updated_at = now();

update public.profiles p
set role = 'admin',
    email = lower(coalesce(u.email, p.email))
from auth.users u
where p.id = u.id
  and lower(u.email) in ('gutierrezfarias1@hotmail.com', 'gutierrezfarias7@gmail.com');

update public.profiles p
set email = lower(coalesce(u.email, p.email))
from auth.users u
where p.id = u.id;

insert into public.organizations (name, cnpj, active, created_by)
select
  coalesce(
    nullif(u.raw_user_meta_data ->> 'organization_name', ''),
    nullif(u.raw_user_meta_data ->> 'name', ''),
    split_part(u.email, '@', 1),
    'Escritorio'
  ),
  '',
  true,
  u.id
from auth.users u
where not exists (
  select 1
  from public.organizations o
  where o.created_by = u.id
);

insert into public.organization_members (organization_id, user_id, member_role)
select o.id, o.created_by, 'owner'
from public.organizations o
where o.created_by is not null
  and not exists (
    select 1
    from public.organization_members om
    where om.organization_id = o.id
      and om.user_id = o.created_by
  );

insert into public.home_slides (
  eyebrow,
  title,
  description,
  theme,
  button_label,
  button_url,
  sort_order,
  active
)
select
  'Controle pessoal',
  'Planeje hoje. Avance todos os dias.',
  'Centralize compromissos, objetivos e indicadores em uma experiencia simples e elegante.',
  'focus',
  'Comecar agora',
  '/cadastro',
  1,
  true
where not exists (select 1 from public.home_slides);

insert into public.home_banners (category, title, description, sort_order, active)
select
  'Agenda',
  'Semana organizada',
  'Visualize tarefas e prioridades em um so lugar.',
  1,
  true
where not exists (select 1 from public.home_banners);

insert into public.home_footer_groups (title, sort_order)
select 'Plataforma', 1
where not exists (select 1 from public.home_footer_groups);

insert into public.home_footer_links (group_id, label, url, sort_order, active)
select g.id, 'Dashboard', '/dashboard', 1, true
from public.home_footer_groups g
where g.title = 'Plataforma'
  and not exists (
    select 1
    from public.home_footer_links l
    where l.group_id = g.id
      and l.label = 'Dashboard'
  )
limit 1;

notify pgrst, 'reload schema';
