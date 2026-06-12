-- CONT HUB - modulo fiscal, importacao universal e motor de regras.
-- Fase 2: banco de dados. Script incremental e nao destrutivo.
-- Rode no SQL Editor do Supabase antes de habilitar as telas fiscais.

create extension if not exists pgcrypto;

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

create table if not exists public.fiscal_company_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  cnpj text not null default '',
  state_registration text not null default '',
  municipal_registration text not null default '',
  state_uf text not null default '',
  city text not null default '',
  city_ibge_code text not null default '',
  main_cnae text not null default '',
  secondary_cnaes jsonb not null default '[]'::jsonb,
  tax_regime text not null default 'Nao informado',
  crt text not null default '',
  icms_taxpayer_indicator text not null default 'Nao informado',
  default_final_consumer boolean not null default true,
  default_nfe_series text not null default '1',
  default_environment text not null default 'homologacao',
  pis_cofins_regime text not null default 'Nao informado',
  fiscal_notes text not null default '',
  approval_status text not null default 'Incompleto'
    check (approval_status in ('Incompleto', 'Aguardando revisao', 'Aprovado', 'Bloqueado')),
  approved_at timestamptz,
  approved_by uuid references auth.users (id),
  active boolean not null default true,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, client_id)
);

create table if not exists public.fiscal_product_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  code text not null,
  name text not null,
  description text not null default '',
  active boolean not null default true,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, client_id, code)
);

create table if not exists public.fiscal_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  product_code text not null,
  description text not null,
  gtin text not null default '',
  commercial_unit text not null default 'UN',
  group_id uuid references public.fiscal_product_groups (id) on delete set null,
  ncm text not null default '',
  cest text not null default '',
  merchandise_origin text not null default '0',
  item_type text not null default 'Mercadoria',
  default_cfop_in text not null default '',
  default_cfop_out text not null default '',
  icms_cst text not null default '',
  icms_csosn text not null default '',
  pis_cst text not null default '',
  pis_rate numeric(9,4) not null default 0,
  cofins_cst text not null default '',
  cofins_rate numeric(9,4) not null default 0,
  ipi_cst text not null default '',
  ipi_rate numeric(9,4) not null default 0,
  icms_rate numeric(9,4) not null default 0,
  icms_base_reduction numeric(9,4) not null default 0,
  has_icms_st boolean not null default false,
  mva_rate numeric(9,4) not null default 0,
  fcp_rate numeric(9,4) not null default 0,
  fiscal_benefit_code text not null default '',
  fiscal_status text not null default 'Pendente'
    check (fiscal_status in ('Pendente', 'Completo', 'Bloqueado')),
  notes text not null default '',
  active boolean not null default true,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, client_id, product_code)
);

create table if not exists public.fiscal_product_group_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  group_id uuid not null references public.fiscal_product_groups (id) on delete cascade,
  product_id uuid not null references public.fiscal_products (id) on delete cascade,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (group_id, product_id)
);

create table if not exists public.fiscal_operation_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  code text not null,
  name text not null,
  direction text not null default 'saida' check (direction in ('entrada', 'saida')),
  nfe_purpose text not null default 'normal',
  description text not null default '',
  active boolean not null default true,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, client_id, code)
);

create table if not exists public.fiscal_benefits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  code text not null,
  name text not null,
  description text not null default '',
  legal_basis text not null default '',
  state_uf text not null default '',
  start_date date,
  end_date date,
  active boolean not null default true,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, client_id, code)
);

create table if not exists public.custom_cfops (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  code text not null,
  direction text not null default 'saida' check (direction in ('entrada', 'saida')),
  description text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, client_id, code, direction)
);

create table if not exists public.fiscal_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  rule_code text not null,
  name text not null,
  priority integer not null default 100,
  active boolean not null default false,
  start_date date not null default current_date,
  end_date date,
  tax_regime text not null default '',
  operation_type_id uuid references public.fiscal_operation_types (id) on delete set null,
  direction text not null default 'saida' check (direction in ('entrada', 'saida')),
  origin_uf text not null default '',
  destination_uf text not null default '',
  internal_operation boolean,
  interstate_operation boolean,
  foreign_operation boolean,
  recipient_taxpayer_indicator text not null default '',
  final_consumer boolean,
  nfe_purpose text not null default '',
  ncm text not null default '',
  cest text not null default '',
  product_id uuid references public.fiscal_products (id) on delete set null,
  group_id uuid references public.fiscal_product_groups (id) on delete set null,
  merchandise_origin text not null default '',
  cfop text not null default '',
  icms_cst text not null default '',
  icms_csosn text not null default '',
  icms_base_mode text not null default '',
  icms_rate numeric(9,4) not null default 0,
  icms_base_reduction numeric(9,4) not null default 0,
  pis_cst text not null default '',
  pis_rate numeric(9,4) not null default 0,
  cofins_cst text not null default '',
  cofins_rate numeric(9,4) not null default 0,
  ipi_cst text not null default '',
  ipi_rate numeric(9,4) not null default 0,
  has_icms_st boolean not null default false,
  mva_rate numeric(9,4) not null default 0,
  fcp_rate numeric(9,4) not null default 0,
  fiscal_benefit_code text not null default '',
  approval_status text not null default 'Aguardando revisao'
    check (approval_status in ('Aguardando revisao', 'Aprovada', 'Bloqueada')),
  version integer not null default 1,
  notes text not null default '',
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, client_id, rule_code, version)
);

create table if not exists public.fiscal_rule_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  rule_id uuid not null references public.fiscal_rules (id) on delete cascade,
  version integer not null,
  change_reason text not null default '',
  previous_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (rule_id, version)
);

create table if not exists public.fiscal_rule_conflicts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  rule_id uuid references public.fiscal_rules (id) on delete cascade,
  conflicting_rule_id uuid references public.fiscal_rules (id) on delete cascade,
  severity text not null default 'Alerta' check (severity in ('Alerta', 'Bloqueio')),
  reason text not null default '',
  resolved boolean not null default false,
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.fiscal_simulations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  input_data jsonb not null default '{}'::jsonb,
  result_data jsonb not null default '{}'::jsonb,
  status text not null default 'Concluida' check (status in ('Concluida', 'Falha')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table if not exists public.fiscal_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  old_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  reason text not null default '',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table if not exists public.fiscal_import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  module text not null,
  file_name text not null default '',
  file_type text not null default '',
  file_size integer not null default 0,
  file_hash text not null default '',
  template_version text not null default '',
  import_mode text not null default 'validar_sem_salvar',
  status text not null default 'Pendente'
    check (status in ('Pendente', 'Validando', 'Aguardando confirmacao', 'Concluido', 'Cancelado', 'Falha')),
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  inserted_rows integer not null default 0,
  updated_rows integer not null default 0,
  unchanged_rows integer not null default 0,
  ignored_rows integer not null default 0,
  warning_rows integer not null default 0,
  error_rows integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid references auth.users (id),
  error_message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.fiscal_import_job_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  import_job_id uuid not null references public.fiscal_import_jobs (id) on delete cascade,
  row_number integer not null,
  external_key text not null default '',
  status text not null default 'Valido'
    check (status in ('Novo', 'Atualizar', 'Sem alteracao', 'Duplicado arquivo', 'Duplicado banco', 'Alerta', 'Erro', 'Ignorado', 'Valido')),
  action text not null default '',
  original_data jsonb not null default '{}'::jsonb,
  normalized_data jsonb not null default '{}'::jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  validation_warnings jsonb not null default '[]'::jsonb,
  created_record_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.fiscal_import_mapping_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  module text not null,
  source_system text not null default '',
  template_name text not null,
  header_row integer not null default 1,
  sheet_name text not null default '',
  column_mapping jsonb not null default '{}'::jsonb,
  transformations jsonb not null default '{}'::jsonb,
  default_values jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, client_id, module, source_system, template_name)
);

create table if not exists public.ncm_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  formatted_code text not null default '',
  description text not null default '',
  start_date date,
  end_date date,
  is_active boolean not null default true,
  source text not null default 'Siscomex',
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code)
);

create table if not exists public.ncm_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'Pendente'
    check (status in ('Pendente', 'Executando', 'Concluido', 'Falha')),
  source_url text not null default 'https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json',
  total_codes integer not null default 0,
  inserted_codes integer not null default 0,
  updated_codes integer not null default 0,
  deactivated_codes integer not null default 0,
  error_message text not null default '',
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid references auth.users (id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.nfe_documents
  add column if not exists fiscal_profile_id uuid references public.fiscal_company_profiles (id) on delete set null,
  add column if not exists fiscal_validation_status text not null default 'Pendente',
  add column if not exists fiscal_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists tax_preview_result jsonb not null default '{}'::jsonb,
  add column if not exists fiscal_rule_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists fiscal_rule_version_ids jsonb not null default '[]'::jsonb,
  add column if not exists fiscal_approved_at timestamptz,
  add column if not exists fiscal_approved_by uuid references auth.users (id),
  add column if not exists fiscal_block_reason text not null default '';

create index if not exists fiscal_company_profiles_org_client_idx
  on public.fiscal_company_profiles (organization_id, client_id);

create index if not exists fiscal_products_org_client_idx
  on public.fiscal_products (organization_id, client_id, active);

create index if not exists fiscal_products_ncm_idx
  on public.fiscal_products (organization_id, client_id, ncm);

create index if not exists fiscal_products_gtin_idx
  on public.fiscal_products (organization_id, client_id, gtin)
  where gtin <> '';

create index if not exists fiscal_product_groups_org_client_idx
  on public.fiscal_product_groups (organization_id, client_id, active);

create index if not exists fiscal_operation_types_org_client_idx
  on public.fiscal_operation_types (organization_id, client_id, active);

create index if not exists fiscal_rules_match_idx
  on public.fiscal_rules (
    organization_id,
    client_id,
    active,
    priority,
    tax_regime,
    direction,
    origin_uf,
    destination_uf,
    ncm,
    cest
  );

create index if not exists fiscal_rules_product_idx
  on public.fiscal_rules (organization_id, client_id, product_id)
  where product_id is not null;

create index if not exists fiscal_rules_group_idx
  on public.fiscal_rules (organization_id, client_id, group_id)
  where group_id is not null;

create index if not exists fiscal_import_jobs_org_client_idx
  on public.fiscal_import_jobs (organization_id, client_id, created_at desc);

create index if not exists fiscal_import_job_rows_job_idx
  on public.fiscal_import_job_rows (import_job_id, row_number);

create unique index if not exists fiscal_import_mapping_templates_org_unique_idx
  on public.fiscal_import_mapping_templates (organization_id, module, source_system, template_name)
  where client_id is null;

create unique index if not exists fiscal_import_mapping_templates_client_unique_idx
  on public.fiscal_import_mapping_templates (organization_id, client_id, module, source_system, template_name)
  where client_id is not null;

create index if not exists fiscal_audit_logs_org_client_idx
  on public.fiscal_audit_logs (organization_id, client_id, created_at desc);

create index if not exists ncm_catalog_search_idx
  on public.ncm_catalog (is_active, code);

alter table public.fiscal_company_profiles enable row level security;
alter table public.fiscal_products enable row level security;
alter table public.fiscal_product_groups enable row level security;
alter table public.fiscal_product_group_items enable row level security;
alter table public.fiscal_operation_types enable row level security;
alter table public.fiscal_benefits enable row level security;
alter table public.custom_cfops enable row level security;
alter table public.fiscal_rules enable row level security;
alter table public.fiscal_rule_versions enable row level security;
alter table public.fiscal_rule_conflicts enable row level security;
alter table public.fiscal_simulations enable row level security;
alter table public.fiscal_audit_logs enable row level security;
alter table public.fiscal_import_jobs enable row level security;
alter table public.fiscal_import_job_rows enable row level security;
alter table public.fiscal_import_mapping_templates enable row level security;
alter table public.ncm_catalog enable row level security;
alter table public.ncm_sync_jobs enable row level security;

drop policy if exists "Organization access fiscal company profiles" on public.fiscal_company_profiles;
create policy "Organization access fiscal company profiles"
  on public.fiscal_company_profiles
  for all
  using (public.is_platform_admin() or public.is_org_member(organization_id))
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access fiscal products" on public.fiscal_products;
create policy "Organization access fiscal products"
  on public.fiscal_products
  for all
  using (public.is_platform_admin() or public.is_org_member(organization_id))
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access fiscal product groups" on public.fiscal_product_groups;
create policy "Organization access fiscal product groups"
  on public.fiscal_product_groups
  for all
  using (public.is_platform_admin() or public.is_org_member(organization_id))
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access fiscal product group items" on public.fiscal_product_group_items;
create policy "Organization access fiscal product group items"
  on public.fiscal_product_group_items
  for all
  using (public.is_platform_admin() or public.is_org_member(organization_id))
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access fiscal operation types" on public.fiscal_operation_types;
create policy "Organization access fiscal operation types"
  on public.fiscal_operation_types
  for all
  using (public.is_platform_admin() or public.is_org_member(organization_id))
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access fiscal benefits" on public.fiscal_benefits;
create policy "Organization access fiscal benefits"
  on public.fiscal_benefits
  for all
  using (public.is_platform_admin() or public.is_org_member(organization_id))
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access custom cfops" on public.custom_cfops;
create policy "Organization access custom cfops"
  on public.custom_cfops
  for all
  using (public.is_platform_admin() or public.is_org_member(organization_id))
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access fiscal rules" on public.fiscal_rules;
create policy "Organization access fiscal rules"
  on public.fiscal_rules
  for all
  using (public.is_platform_admin() or public.is_org_member(organization_id))
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access fiscal rule versions" on public.fiscal_rule_versions;
create policy "Organization access fiscal rule versions"
  on public.fiscal_rule_versions
  for all
  using (public.is_platform_admin() or public.is_org_member(organization_id))
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access fiscal rule conflicts" on public.fiscal_rule_conflicts;
create policy "Organization access fiscal rule conflicts"
  on public.fiscal_rule_conflicts
  for all
  using (public.is_platform_admin() or public.is_org_member(organization_id))
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access fiscal simulations" on public.fiscal_simulations;
create policy "Organization access fiscal simulations"
  on public.fiscal_simulations
  for all
  using (public.is_platform_admin() or public.is_org_member(organization_id))
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization read fiscal audit logs" on public.fiscal_audit_logs;
create policy "Organization read fiscal audit logs"
  on public.fiscal_audit_logs
  for select
  using (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization insert fiscal audit logs" on public.fiscal_audit_logs;
create policy "Organization insert fiscal audit logs"
  on public.fiscal_audit_logs
  for insert
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access fiscal import jobs" on public.fiscal_import_jobs;
create policy "Organization access fiscal import jobs"
  on public.fiscal_import_jobs
  for all
  using (public.is_platform_admin() or public.is_org_member(organization_id))
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access fiscal import job rows" on public.fiscal_import_job_rows;
create policy "Organization access fiscal import job rows"
  on public.fiscal_import_job_rows
  for all
  using (public.is_platform_admin() or public.is_org_member(organization_id))
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization access fiscal import mapping templates" on public.fiscal_import_mapping_templates;
create policy "Organization access fiscal import mapping templates"
  on public.fiscal_import_mapping_templates
  for all
  using (public.is_platform_admin() or public.is_org_member(organization_id))
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "Authenticated read ncm catalog" on public.ncm_catalog;
create policy "Authenticated read ncm catalog"
  on public.ncm_catalog
  for select
  to authenticated
  using (true);

drop policy if exists "Admins manage ncm catalog" on public.ncm_catalog;
create policy "Admins manage ncm catalog"
  on public.ncm_catalog
  for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "Authenticated read ncm sync jobs" on public.ncm_sync_jobs;
create policy "Authenticated read ncm sync jobs"
  on public.ncm_sync_jobs
  for select
  to authenticated
  using (true);

drop policy if exists "Admins manage ncm sync jobs" on public.ncm_sync_jobs;
create policy "Admins manage ncm sync jobs"
  on public.ncm_sync_jobs
  for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

notify pgrst, 'reload schema';
