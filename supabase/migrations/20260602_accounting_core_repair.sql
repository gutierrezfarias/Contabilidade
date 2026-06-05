-- CONT HUB - reparo das tabelas contabeis principais.
-- Rode este script no SQL Editor do Supabase se a tela Gestao de Clientes
-- mostrar "Banco contabil incompleto".

create extension if not exists pgcrypto;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'client',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_name text not null,
  cnpj text not null default '',
  phone text not null default '',
  email text not null default '',
  cep text not null default '',
  address text not null default '',
  photo_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients add column if not exists cnpj text not null default '';
alter table public.clients add column if not exists phone text not null default '';
alter table public.clients add column if not exists email text not null default '';
alter table public.clients add column if not exists cep text not null default '';
alter table public.clients add column if not exists address text not null default '';
alter table public.clients add column if not exists photo_url text;
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
alter table public.clients add column if not exists active boolean not null default true;
alter table public.clients add column if not exists created_at timestamptz not null default now();
alter table public.clients add column if not exists updated_at timestamptz not null default now();

create table if not exists public.client_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  competence_month integer not null check (competence_month between 1 and 12),
  competence_year integer not null check (competence_year >= 2000),
  amount numeric(14,2) not null default 0,
  due_date date not null,
  paid_at timestamptz,
  status text not null default 'Pendente' check (status in ('Pago', 'Pendente', 'Vencido')),
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
  secure_reference text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.digital_certificates add column if not exists serial_number text not null default '';
alter table public.digital_certificates add column if not exists issuer text not null default '';
alter table public.digital_certificates add column if not exists environment text not null default 'homologacao';
alter table public.digital_certificates add column if not exists state_uf text not null default '';
alter table public.digital_certificates add column if not exists municipal_code text not null default '';
alter table public.digital_certificates add column if not exists certificate_password text not null default '';
alter table public.digital_certificates add column if not exists certificate_file_name text not null default '';
alter table public.digital_certificates add column if not exists certificate_file_size integer not null default 0;
alter table public.digital_certificates add column if not exists certificate_file_data text;
alter table public.digital_certificates add column if not exists updated_at timestamptz not null default now();

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

create table if not exists public.certificate_services (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references public.digital_certificates (id) on delete cascade,
  service_code text not null,
  enabled boolean not null default false,
  integration_status text not null default 'Nao configurado'
    check (integration_status in ('Nao configurado', 'Configurando', 'Ativo', 'Falha')),
  created_at timestamptz not null default now()
);

alter table public.certificate_services
  drop constraint if exists certificate_services_service_code_check;

alter table public.certificate_services
  add constraint certificate_services_service_code_check
  check (
    service_code in (
      'nfe',
      'nfe_emissao',
      'nfe_consulta',
      'nfe_cancelamento',
      'nfe_cce',
      'nfe_inutilizacao',
      'nfce',
      'cte',
      'mdfe',
      'nfse',
      'dfe_distribuicao',
      'manifestacao_destinatario',
      'ecac',
      'ecac_caixa_postal',
      'ecac_situacao_fiscal',
      'ecac_certidoes',
      'ecac_processos_digitais',
      'ecac_dctfweb',
      'ecac_perdcomp',
      'sped_reinf',
      'simples_nacional'
    )
  );

create table if not exists public.client_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  document_type text not null default 'Documento',
  extracted_cnpj text not null default '',
  file_name text not null,
  mime_type text not null,
  file_size integer not null default 0,
  file_data text not null,
  created_at timestamptz not null default now()
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

alter table public.nfe_documents add column if not exists xml_url text;
alter table public.nfe_documents add column if not exists danfe_url text;
alter table public.nfe_documents add column if not exists updated_at timestamptz not null default now();

create index if not exists clients_organization_id_idx on public.clients (organization_id);
create index if not exists client_payments_organization_id_idx on public.client_payments (organization_id);
create index if not exists digital_certificates_client_id_idx on public.digital_certificates (client_id);
create index if not exists certificate_services_certificate_id_idx on public.certificate_services (certificate_id);
create index if not exists client_documents_client_id_idx on public.client_documents (client_id);
create index if not exists nfe_documents_organization_id_idx on public.nfe_documents (organization_id);

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

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.clients enable row level security;
alter table public.client_payments enable row level security;
alter table public.fiscal_obligations enable row level security;
alter table public.digital_certificates enable row level security;
alter table public.certificate_services enable row level security;
alter table public.client_documents enable row level security;
alter table public.nfe_documents enable row level security;

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
using (public.is_org_member(id))
with check (public.is_org_member(id));

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

drop policy if exists "Organization access clients" on public.clients;
create policy "Organization access clients"
on public.clients
for all
using (public.is_admin() or public.is_org_member(organization_id))
with check (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access payments" on public.client_payments;
create policy "Organization access payments"
on public.client_payments
for all
using (public.is_admin() or public.is_org_member(organization_id))
with check (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access obligations" on public.fiscal_obligations;
create policy "Organization access obligations"
on public.fiscal_obligations
for all
using (public.is_admin() or public.is_org_member(organization_id))
with check (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access certificates" on public.digital_certificates;
create policy "Organization access certificates"
on public.digital_certificates
for all
using (public.is_admin() or public.is_org_member(organization_id))
with check (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access certificate services" on public.certificate_services;
create policy "Organization access certificate services"
on public.certificate_services
for all
using (
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

drop policy if exists "Organization access client documents" on public.client_documents;
create policy "Organization access client documents"
on public.client_documents
for all
using (public.is_admin() or public.is_org_member(organization_id))
with check (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access nfe documents" on public.nfe_documents;
create policy "Organization access nfe documents"
on public.nfe_documents
for all
using (public.is_admin() or public.is_org_member(organization_id))
with check (public.is_admin() or public.is_org_member(organization_id));

notify pgrst, 'reload schema';
