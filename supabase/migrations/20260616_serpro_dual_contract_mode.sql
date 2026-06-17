-- CONT HUB - Serpro dual contract mode.
-- Run in Supabase SQL Editor. Idempotent and non-destructive.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'serpro_billing_mode') then
    create type public.serpro_billing_mode as enum ('cont_hub_managed', 'direct_serpro');
  end if;
  if not exists (select 1 from pg_type where typname = 'serpro_environment') then
    create type public.serpro_environment as enum ('homologacao', 'producao');
  end if;
  if not exists (select 1 from pg_type where typname = 'serpro_status') then
    create type public.serpro_status as enum ('draft', 'active', 'paused', 'blocked', 'disabled');
  end if;
  if not exists (select 1 from pg_type where typname = 'serpro_request_status') then
    create type public.serpro_request_status as enum ('created', 'blocked', 'reserved', 'sent', 'completed', 'failed', 'refunded');
  end if;
  if not exists (select 1 from pg_type where typname = 'serpro_wallet_transaction_type') then
    create type public.serpro_wallet_transaction_type as enum ('credit', 'debit', 'reserve', 'capture', 'release', 'refund', 'adjustment');
  end if;
end $$;

create table if not exists public.serpro_platform_contracts (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Contrato Serpro CONT HUB',
  contract_cnpj text not null default '',
  environment public.serpro_environment not null default 'homologacao',
  status public.serpro_status not null default 'draft',
  allow_managed_mode boolean not null default false,
  notes text not null default '',
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.serpro_platform_credentials (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references public.serpro_platform_contracts (id) on delete cascade,
  consumer_key text not null default '',
  consumer_secret_reference text not null default '',
  consumer_secret_configured boolean not null default false,
  consumer_secret_fingerprint text not null default '',
  certificate_id uuid references public.digital_certificates (id) on delete set null,
  environment public.serpro_environment not null default 'homologacao',
  status public.serpro_status not null default 'draft',
  last_tested_at timestamptz,
  last_test_status text not null default '',
  last_test_message text not null default '',
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists serpro_platform_credentials_unique_contract_env
  on public.serpro_platform_credentials (contract_id, environment);

create table if not exists public.serpro_organization_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  billing_mode public.serpro_billing_mode not null default 'cont_hub_managed',
  environment public.serpro_environment not null default 'homologacao',
  status public.serpro_status not null default 'draft',
  managed_mode_enabled boolean not null default false,
  direct_mode_enabled boolean not null default false,
  allow_managed_fallback boolean not null default false,
  monthly_credit_limit numeric(14,2) not null default 0,
  daily_request_limit integer not null default 0,
  notification_email text not null default '',
  notes text not null default '',
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.serpro_organization_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contract_cnpj text not null default '',
  consumer_key text not null default '',
  consumer_secret_reference text not null default '',
  consumer_secret_configured boolean not null default false,
  consumer_secret_fingerprint text not null default '',
  certificate_id uuid references public.digital_certificates (id) on delete set null,
  environment public.serpro_environment not null default 'homologacao',
  status public.serpro_status not null default 'draft',
  last_tested_at timestamptz,
  last_test_status text not null default '',
  last_test_message text not null default '',
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists serpro_org_credentials_unique_env
  on public.serpro_organization_credentials (organization_id, environment);

create table if not exists public.serpro_service_catalog (
  id text primary key,
  name text not null,
  category text not null default 'receita_federal',
  description text not null default '',
  official_product text not null default 'integra_contador',
  requires_certificate boolean not null default true,
  requires_authorization boolean not null default true,
  supports_managed_mode boolean not null default true,
  supports_direct_mode boolean not null default true,
  status public.serpro_status not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.serpro_service_pricing (
  id uuid primary key default gen_random_uuid(),
  service_id text not null references public.serpro_service_catalog (id) on delete cascade,
  environment public.serpro_environment not null default 'producao',
  currency text not null default 'BRL',
  provider_cost numeric(14,4) not null default 0,
  sale_price numeric(14,4) not null default 0,
  margin_amount numeric(14,4) generated always as (sale_price - provider_cost) stored,
  active boolean not null default true,
  effective_from date not null default current_date,
  effective_to date,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists serpro_service_pricing_unique_active
  on public.serpro_service_pricing (service_id, environment, effective_from);

create table if not exists public.serpro_organization_services (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  service_id text not null references public.serpro_service_catalog (id) on delete cascade,
  enabled boolean not null default false,
  billing_mode_override public.serpro_billing_mode,
  custom_sale_price numeric(14,4),
  exempt boolean not null default false,
  monthly_limit integer not null default 0,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, service_id)
);

create table if not exists public.serpro_client_authorizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  service_id text references public.serpro_service_catalog (id) on delete set null,
  authorization_type text not null default 'procuracao_digital',
  status public.serpro_status not null default 'draft',
  valid_from date,
  valid_until date,
  reference_number text not null default '',
  evidence_document_id uuid references public.client_documents (id) on delete set null,
  notes text not null default '',
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.serpro_wallets (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  balance numeric(14,4) not null default 0,
  reserved_balance numeric(14,4) not null default 0,
  currency text not null default 'BRL',
  auto_recharge_enabled boolean not null default false,
  auto_recharge_threshold numeric(14,2) not null default 0,
  auto_recharge_amount numeric(14,2) not null default 0,
  status public.serpro_status not null default 'active',
  updated_at timestamptz not null default now(),
  check (balance >= 0),
  check (reserved_balance >= 0)
);

create table if not exists public.serpro_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  request_id uuid,
  transaction_type public.serpro_wallet_transaction_type not null,
  amount numeric(14,4) not null,
  balance_after numeric(14,4),
  description text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table if not exists public.serpro_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  service_id text not null references public.serpro_service_catalog (id) on delete restrict,
  billing_mode public.serpro_billing_mode not null,
  environment public.serpro_environment not null default 'homologacao',
  status public.serpro_request_status not null default 'created',
  endpoint text not null default '',
  method text not null default 'POST',
  request_reference text not null default '',
  cost_amount numeric(14,4) not null default 0,
  sale_amount numeric(14,4) not null default 0,
  margin_amount numeric(14,4) not null default 0,
  cnpj text not null default '',
  certificate_id uuid references public.digital_certificates (id) on delete set null,
  authorization_id uuid references public.serpro_client_authorizations (id) on delete set null,
  http_status integer,
  provider_status text not null default '',
  provider_message text not null default '',
  correlation_id text not null default gen_random_uuid()::text,
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'serpro_wallet_transactions_request_fk'
      and conrelid = 'public.serpro_wallet_transactions'::regclass
  ) then
    alter table public.serpro_wallet_transactions
      add constraint serpro_wallet_transactions_request_fk
      foreign key (request_id) references public.serpro_requests (id) on delete set null;
  end if;
end $$;

create table if not exists public.serpro_request_attempts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.serpro_requests (id) on delete cascade,
  attempt_number integer not null default 1,
  endpoint text not null default '',
  http_status integer,
  provider_status text not null default '',
  provider_message text not null default '',
  duration_ms integer,
  created_at timestamptz not null default now()
);

create table if not exists public.serpro_usage_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  service_id text not null references public.serpro_service_catalog (id) on delete restrict,
  request_id uuid references public.serpro_requests (id) on delete set null,
  billing_mode public.serpro_billing_mode not null,
  environment public.serpro_environment not null,
  quantity integer not null default 1,
  provider_cost numeric(14,4) not null default 0,
  sale_amount numeric(14,4) not null default 0,
  margin_amount numeric(14,4) not null default 0,
  usage_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.serpro_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  service_id text references public.serpro_service_catalog (id) on delete set null,
  request_id uuid references public.serpro_requests (id) on delete set null,
  document_type text not null default '',
  document_key text not null default '',
  file_name text not null default '',
  file_data text,
  mime_type text not null default 'application/pdf',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.serpro_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  actor_user_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  entity_type text not null default '',
  entity_id text not null default '',
  billing_mode public.serpro_billing_mode,
  service_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.serpro_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  item text;
begin
  foreach item in array array[
    'serpro_platform_contracts',
    'serpro_platform_credentials',
    'serpro_organization_settings',
    'serpro_organization_credentials',
    'serpro_service_catalog',
    'serpro_service_pricing',
    'serpro_organization_services',
    'serpro_client_authorizations'
  ]
  loop
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', item, item);
    execute format(
      'create trigger %I_touch_updated_at before update on public.%I for each row execute function public.serpro_touch_updated_at()',
      item,
      item
    );
  end loop;
end $$;

create or replace function public.serpro_can_access_org(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or exists (
      select 1
      from public.organization_members om
      where om.organization_id = target_org
        and om.user_id = auth.uid()
    );
$$;

create or replace function public.serpro_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin();
$$;

do $$
declare
  item text;
begin
  foreach item in array array[
    'serpro_platform_contracts',
    'serpro_platform_credentials',
    'serpro_organization_settings',
    'serpro_organization_credentials',
    'serpro_service_catalog',
    'serpro_service_pricing',
    'serpro_organization_services',
    'serpro_client_authorizations',
    'serpro_wallets',
    'serpro_wallet_transactions',
    'serpro_requests',
    'serpro_request_attempts',
    'serpro_usage_records',
    'serpro_documents',
    'serpro_audit_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', item);
  end loop;
end $$;

drop policy if exists serpro_platform_contracts_admin_all on public.serpro_platform_contracts;
create policy serpro_platform_contracts_admin_all on public.serpro_platform_contracts
  for all using (public.serpro_is_admin()) with check (public.serpro_is_admin());

drop policy if exists serpro_platform_credentials_admin_all on public.serpro_platform_credentials;
create policy serpro_platform_credentials_admin_all on public.serpro_platform_credentials
  for all using (public.serpro_is_admin()) with check (public.serpro_is_admin());

drop policy if exists serpro_service_catalog_read_authenticated on public.serpro_service_catalog;
create policy serpro_service_catalog_read_authenticated on public.serpro_service_catalog
  for select using (auth.uid() is not null);
drop policy if exists serpro_service_catalog_admin_write on public.serpro_service_catalog;
create policy serpro_service_catalog_admin_write on public.serpro_service_catalog
  for all using (public.serpro_is_admin()) with check (public.serpro_is_admin());

drop policy if exists serpro_service_pricing_read_authenticated on public.serpro_service_pricing;
create policy serpro_service_pricing_read_authenticated on public.serpro_service_pricing
  for select using (auth.uid() is not null);
drop policy if exists serpro_service_pricing_admin_write on public.serpro_service_pricing;
create policy serpro_service_pricing_admin_write on public.serpro_service_pricing
  for all using (public.serpro_is_admin()) with check (public.serpro_is_admin());

drop policy if exists serpro_org_settings_access on public.serpro_organization_settings;
create policy serpro_org_settings_access on public.serpro_organization_settings
  for select using (public.serpro_can_access_org(organization_id));
drop policy if exists serpro_org_settings_admin_write on public.serpro_organization_settings;
create policy serpro_org_settings_admin_write on public.serpro_organization_settings
  for all using (public.serpro_can_access_org(organization_id)) with check (public.serpro_can_access_org(organization_id));

drop policy if exists serpro_org_credentials_access on public.serpro_organization_credentials;
create policy serpro_org_credentials_access on public.serpro_organization_credentials
  for all using (public.serpro_can_access_org(organization_id)) with check (public.serpro_can_access_org(organization_id));

drop policy if exists serpro_org_services_access on public.serpro_organization_services;
create policy serpro_org_services_access on public.serpro_organization_services
  for all using (public.serpro_can_access_org(organization_id)) with check (public.serpro_can_access_org(organization_id));

drop policy if exists serpro_client_authorizations_access on public.serpro_client_authorizations;
create policy serpro_client_authorizations_access on public.serpro_client_authorizations
  for all using (public.serpro_can_access_org(organization_id)) with check (public.serpro_can_access_org(organization_id));

drop policy if exists serpro_wallets_access on public.serpro_wallets;
create policy serpro_wallets_access on public.serpro_wallets
  for select using (public.serpro_can_access_org(organization_id));
drop policy if exists serpro_wallets_admin_write on public.serpro_wallets;
create policy serpro_wallets_admin_write on public.serpro_wallets
  for all using (public.serpro_is_admin()) with check (public.serpro_is_admin());

drop policy if exists serpro_wallet_transactions_access on public.serpro_wallet_transactions;
create policy serpro_wallet_transactions_access on public.serpro_wallet_transactions
  for select using (public.serpro_can_access_org(organization_id));
drop policy if exists serpro_wallet_transactions_admin_write on public.serpro_wallet_transactions;
create policy serpro_wallet_transactions_admin_write on public.serpro_wallet_transactions
  for insert with check (public.serpro_is_admin() or public.serpro_can_access_org(organization_id));

drop policy if exists serpro_requests_access on public.serpro_requests;
create policy serpro_requests_access on public.serpro_requests
  for all using (public.serpro_can_access_org(organization_id)) with check (public.serpro_can_access_org(organization_id));

drop policy if exists serpro_request_attempts_access on public.serpro_request_attempts;
create policy serpro_request_attempts_access on public.serpro_request_attempts
  for select using (
    exists (
      select 1 from public.serpro_requests r
      where r.id = request_id
        and public.serpro_can_access_org(r.organization_id)
    )
  );

drop policy if exists serpro_usage_records_access on public.serpro_usage_records;
create policy serpro_usage_records_access on public.serpro_usage_records
  for select using (public.serpro_can_access_org(organization_id));

drop policy if exists serpro_documents_access on public.serpro_documents;
create policy serpro_documents_access on public.serpro_documents
  for all using (public.serpro_can_access_org(organization_id)) with check (public.serpro_can_access_org(organization_id));

drop policy if exists serpro_audit_logs_access on public.serpro_audit_logs;
create policy serpro_audit_logs_access on public.serpro_audit_logs
  for select using (organization_id is null and public.serpro_is_admin() or public.serpro_can_access_org(organization_id));
drop policy if exists serpro_audit_logs_insert on public.serpro_audit_logs;
create policy serpro_audit_logs_insert on public.serpro_audit_logs
  for insert with check (public.serpro_is_admin() or organization_id is null or public.serpro_can_access_org(organization_id));

insert into public.serpro_platform_contracts (id, name, status, allow_managed_mode)
values ('00000000-0000-0000-0000-00000000f001', 'Contrato Serpro CONT HUB', 'draft', false)
on conflict (id) do nothing;

insert into public.serpro_service_catalog
  (id, name, category, description, official_product, requires_certificate, requires_authorization, supports_managed_mode, supports_direct_mode, status, metadata)
values
  ('integra-contador-cnd-cpend', 'CND / CPEND', 'receita_federal', 'Emissao e consulta de certidao negativa ou positiva com efeitos de negativa quando disponivel por API oficial.', 'integra_contador', true, true, true, true, 'active', '{"document_type":"certidao"}'),
  ('integra-contador-situacao-fiscal', 'Situacao fiscal', 'receita_federal', 'Consulta de pendencias e situacao fiscal quando disponivel por API oficial.', 'integra_contador', true, true, true, true, 'active', '{"document_type":"relatorio"}'),
  ('integra-contador-caixa-postal', 'Caixa postal / DTE', 'receita_federal', 'Mensagens, comunicacoes e intimacoes disponiveis por canal oficial.', 'integra_contador', true, true, true, true, 'draft', '{"document_type":"mensagem"}'),
  ('integra-contador-procuracoes', 'Procuracoes digitais', 'receita_federal', 'Controle de autorizacoes e procuracoes necessarias para operar servicos do cliente.', 'integra_contador', true, true, true, true, 'active', '{"document_type":"autorizacao"}'),
  ('integra-contador-dctfweb', 'DCTFWeb', 'receita_federal', 'Consulta e acompanhamento de declaracoes, guias e debitos quando disponivel por API oficial.', 'integra_contador', true, true, true, true, 'draft', '{"document_type":"declaracao"}'),
  ('integra-contador-perdcomp', 'PER/DCOMP', 'receita_federal', 'Acompanhamento de restituicao, ressarcimento, reembolso e compensacao quando disponivel por API oficial.', 'integra_contador', true, true, true, true, 'draft', '{"document_type":"processo"}')
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  official_product = excluded.official_product,
  requires_certificate = excluded.requires_certificate,
  requires_authorization = excluded.requires_authorization,
  supports_managed_mode = excluded.supports_managed_mode,
  supports_direct_mode = excluded.supports_direct_mode,
  status = excluded.status,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.serpro_service_pricing
  (service_id, environment, provider_cost, sale_price, active, effective_from)
select id, 'producao', 0, 0, true, current_date
from public.serpro_service_catalog
on conflict do nothing;

notify pgrst, 'reload schema';
