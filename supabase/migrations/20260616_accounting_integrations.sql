-- CONT HUB - Central de Integracoes Contabeis.
-- Migration incremental e nao destrutiva.
-- Cria a fundacao multiempresa para provedores contabeis, importacao manual,
-- historico, auditoria e registros padronizados recebidos de sistemas externos.

create extension if not exists pgcrypto;

create or replace function public.accounting_can_access_org(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
  or exists (
    select 1
    from public.organization_members
    where organization_id = target_org
      and user_id = auth.uid()
  );
$$;

create or replace function public.accounting_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.accounting_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  provider text not null default 'manual',
  connection_type text not null default 'manual',
  environment text not null default 'production',
  status text not null default 'draft',
  base_url text not null default '',
  credentials_reference text not null default '',
  settings jsonb not null default '{}'::jsonb,
  sync_frequency text not null default 'manual',
  last_sync_at timestamptz,
  next_sync_at timestamptz,
  automatic_sync boolean not null default false,
  active boolean not null default true,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint accounting_integrations_provider_check
    check (provider in ('netspeed', 'dominio', 'alterdata', 'sci', 'questor', 'contmatic', 'manual', 'generic')),
  constraint accounting_integrations_connection_type_check
    check (connection_type in ('api', 'webservice', 'file_import', 'local_connector', 'manual')),
  constraint accounting_integrations_environment_check
    check (environment in ('sandbox', 'homologation', 'production')),
  constraint accounting_integrations_status_check
    check (status in ('draft', 'active', 'disconnected', 'error', 'paused'))
);

create unique index if not exists accounting_integrations_org_name_idx
  on public.accounting_integrations (organization_id, lower(name))
  where deleted_at is null;
create index if not exists accounting_integrations_org_provider_idx
  on public.accounting_integrations (organization_id, provider, status, active);
create index if not exists accounting_integrations_next_sync_idx
  on public.accounting_integrations (organization_id, next_sync_at)
  where active = true and deleted_at is null;

create table if not exists public.accounting_integration_clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  integration_id uuid not null references public.accounting_integrations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  external_company_id text not null default '',
  external_company_name text not null default '',
  external_cnpj text not null default '',
  external_code text not null default '',
  status text not null default 'linked',
  linked_by uuid references auth.users (id),
  linked_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint accounting_integration_clients_status_check
    check (status in ('linked', 'pending', 'error', 'inactive'))
);

create unique index if not exists accounting_integration_clients_unique_client_idx
  on public.accounting_integration_clients (organization_id, integration_id, client_id)
  where deleted_at is null;
create unique index if not exists accounting_integration_clients_external_idx
  on public.accounting_integration_clients (organization_id, integration_id, external_company_id)
  where deleted_at is null and external_company_id <> '';
create index if not exists accounting_integration_clients_org_client_idx
  on public.accounting_integration_clients (organization_id, client_id, status);

create table if not exists public.accounting_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  integration_id uuid references public.accounting_integrations (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  provider text not null default 'manual',
  sync_type text not null default 'manual',
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  received_count integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  ignored_count integer not null default 0,
  duplicate_count integer not null default 0,
  error_count integer not null default 0,
  message text not null default '',
  correlation_id text not null default '',
  initiated_by uuid references auth.users (id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint accounting_sync_runs_status_check
    check (status in ('running', 'completed', 'completed_with_errors', 'failed', 'cancelled'))
);

create index if not exists accounting_sync_runs_org_idx
  on public.accounting_sync_runs (organization_id, started_at desc);
create index if not exists accounting_sync_runs_integration_idx
  on public.accounting_sync_runs (organization_id, integration_id, started_at desc);
create index if not exists accounting_sync_runs_client_idx
  on public.accounting_sync_runs (organization_id, client_id, started_at desc);
create index if not exists accounting_sync_runs_correlation_idx
  on public.accounting_sync_runs (correlation_id)
  where correlation_id <> '';

create table if not exists public.accounting_sync_errors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  integration_id uuid references public.accounting_integrations (id) on delete set null,
  sync_run_id uuid references public.accounting_sync_runs (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  operation text not null default '',
  endpoint text not null default '',
  http_status integer,
  attempt integer not null default 1,
  retry_reason text not null default '',
  error_code text not null default '',
  message text not null,
  correlation_id text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists accounting_sync_errors_org_idx
  on public.accounting_sync_errors (organization_id, created_at desc);
create index if not exists accounting_sync_errors_run_idx
  on public.accounting_sync_errors (sync_run_id, created_at desc);

create table if not exists public.accounting_tax_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  integration_id uuid references public.accounting_integrations (id) on delete set null,
  provider text not null default 'manual',
  external_id text not null default '',
  idempotency_key text not null,
  competence date not null,
  tax_type text not null,
  description text not null default '',
  amount numeric(14,2) not null default 0,
  due_date date,
  calculation_date date,
  status text not null default 'pending',
  barcode text not null default '',
  pix_code text not null default '',
  document_url text not null default '',
  source text not null default 'manual',
  imported_at timestamptz not null default now(),
  external_updated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint accounting_tax_records_status_check
    check (status in ('pending', 'available', 'sent', 'viewed', 'paid', 'overdue', 'cancelled', 'ignored'))
);

create unique index if not exists accounting_tax_records_idempotency_idx
  on public.accounting_tax_records (organization_id, idempotency_key)
  where deleted_at is null;
create index if not exists accounting_tax_records_lookup_idx
  on public.accounting_tax_records (organization_id, client_id, competence, tax_type, status);
create index if not exists accounting_tax_records_due_idx
  on public.accounting_tax_records (organization_id, due_date, status);
create index if not exists accounting_tax_records_external_idx
  on public.accounting_tax_records (organization_id, provider, external_id)
  where external_id <> '';

create table if not exists public.accounting_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  integration_id uuid references public.accounting_integrations (id) on delete set null,
  provider text not null default 'manual',
  external_id text not null default '',
  idempotency_key text not null,
  document_type text not null,
  competence date,
  filename text not null,
  storage_path text not null default '',
  mime_type text not null default '',
  document_date date,
  due_date date,
  status text not null default 'available',
  imported_at timestamptz not null default now(),
  viewed_at timestamptz,
  downloaded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint accounting_documents_status_check
    check (status in ('available', 'sent', 'viewed', 'downloaded', 'archived', 'rejected'))
);

create unique index if not exists accounting_documents_idempotency_idx
  on public.accounting_documents (organization_id, idempotency_key)
  where deleted_at is null;
create index if not exists accounting_documents_lookup_idx
  on public.accounting_documents (organization_id, client_id, competence, document_type, status);
create index if not exists accounting_documents_external_idx
  on public.accounting_documents (organization_id, provider, external_id)
  where external_id <> '';

create table if not exists public.accounting_obligations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  integration_id uuid references public.accounting_integrations (id) on delete set null,
  provider text not null default 'manual',
  external_id text not null default '',
  idempotency_key text not null,
  obligation_type text not null,
  competence date not null,
  due_date date,
  delivery_date date,
  status text not null default 'pending',
  responsible_user_id uuid references auth.users (id),
  protocol text not null default '',
  document_id uuid references public.accounting_documents (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint accounting_obligations_status_check
    check (status in ('pending', 'in_progress', 'delivered', 'late', 'cancelled'))
);

create unique index if not exists accounting_obligations_idempotency_idx
  on public.accounting_obligations (organization_id, idempotency_key)
  where deleted_at is null;
create index if not exists accounting_obligations_lookup_idx
  on public.accounting_obligations (organization_id, client_id, competence, obligation_type, status);
create index if not exists accounting_obligations_due_idx
  on public.accounting_obligations (organization_id, due_date, status);

create table if not exists public.accounting_payroll_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  integration_id uuid references public.accounting_integrations (id) on delete set null,
  provider text not null default 'manual',
  external_id text not null default '',
  idempotency_key text not null,
  competence date not null,
  gross_amount numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null default 0,
  taxes_amount numeric(14,2) not null default 0,
  employee_count integer not null default 0,
  status text not null default 'available',
  document_id uuid references public.accounting_documents (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists accounting_payroll_records_idempotency_idx
  on public.accounting_payroll_records (organization_id, idempotency_key)
  where deleted_at is null;
create index if not exists accounting_payroll_records_lookup_idx
  on public.accounting_payroll_records (organization_id, client_id, competence, status);

create table if not exists public.accounting_statements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  integration_id uuid references public.accounting_integrations (id) on delete set null,
  provider text not null default 'manual',
  external_id text not null default '',
  idempotency_key text not null,
  statement_type text not null,
  start_date date,
  end_date date,
  competence date,
  data jsonb not null default '{}'::jsonb,
  document_id uuid references public.accounting_documents (id) on delete set null,
  imported_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists accounting_statements_idempotency_idx
  on public.accounting_statements (organization_id, idempotency_key)
  where deleted_at is null;
create index if not exists accounting_statements_lookup_idx
  on public.accounting_statements (organization_id, client_id, competence, statement_type);

create table if not exists public.accounting_import_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  provider text not null default 'manual',
  name text not null,
  record_type text not null,
  file_format text not null default 'csv',
  delimiter text not null default ',',
  column_mapping jsonb not null default '{}'::jsonb,
  required_fields jsonb not null default '[]'::jsonb,
  sample_file_path text not null default '',
  active boolean not null default true,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounting_import_templates_format_check
    check (file_format in ('csv', 'json', 'xlsx')),
  constraint accounting_import_templates_record_type_check
    check (record_type in ('tax', 'document', 'obligation', 'payroll', 'statement'))
);

create unique index if not exists accounting_import_templates_unique_idx
  on public.accounting_import_templates (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), provider, name, record_type);

create table if not exists public.accounting_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  integration_id uuid references public.accounting_integrations (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  template_id uuid references public.accounting_import_templates (id) on delete set null,
  provider text not null default 'manual',
  record_type text not null default 'tax',
  file_name text not null,
  file_hash text not null,
  file_format text not null default 'csv',
  competence date,
  status text not null default 'preview',
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  invalid_rows integer not null default 0,
  created_rows integer not null default 0,
  updated_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  skipped_rows integer not null default 0,
  preview_data jsonb not null default '[]'::jsonb,
  column_mapping jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id),
  confirmed_by uuid references auth.users (id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounting_import_batches_status_check
    check (status in ('preview', 'confirmed', 'completed', 'completed_with_errors', 'failed', 'cancelled')),
  constraint accounting_import_batches_record_type_check
    check (record_type in ('tax', 'document', 'obligation', 'payroll', 'statement'))
);

create index if not exists accounting_import_batches_org_idx
  on public.accounting_import_batches (organization_id, created_at desc);
create index if not exists accounting_import_batches_file_hash_idx
  on public.accounting_import_batches (organization_id, file_hash);

create table if not exists public.accounting_import_errors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  batch_id uuid not null references public.accounting_import_batches (id) on delete cascade,
  row_number integer not null,
  field_name text not null default '',
  field_value text not null default '',
  reason text not null,
  expected_fix text not null default '',
  severity text not null default 'error',
  created_at timestamptz not null default now(),
  constraint accounting_import_errors_severity_check
    check (severity in ('error', 'warning'))
);

create index if not exists accounting_import_errors_batch_idx
  on public.accounting_import_errors (batch_id, row_number, severity);

create table if not exists public.accounting_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  integration_id uuid references public.accounting_integrations (id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  old_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  reason text not null default '',
  correlation_id text not null default '',
  origin text not null default 'system',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists accounting_audit_logs_org_idx
  on public.accounting_audit_logs (organization_id, created_at desc);
create index if not exists accounting_audit_logs_entity_idx
  on public.accounting_audit_logs (organization_id, entity_type, entity_id, created_at desc);

create or replace function public.log_accounting_table_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payload_old jsonb := '{}'::jsonb;
  payload_new jsonb := '{}'::jsonb;
  target_org uuid;
  target_client uuid;
  target_integration uuid;
  target_entity_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    payload_old := to_jsonb(old);
    target_org := old.organization_id;
    target_entity_id := old.id;
    if payload_old ? 'client_id' then
      target_client := nullif(payload_old ->> 'client_id', '')::uuid;
    end if;
    if payload_old ? 'integration_id' then
      target_integration := nullif(payload_old ->> 'integration_id', '')::uuid;
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    payload_new := to_jsonb(new);
    target_org := new.organization_id;
    target_entity_id := new.id;
    if payload_new ? 'client_id' then
      target_client := nullif(payload_new ->> 'client_id', '')::uuid;
    end if;
    if payload_new ? 'integration_id' then
      target_integration := nullif(payload_new ->> 'integration_id', '')::uuid;
    end if;
  end if;

  insert into public.accounting_audit_logs (
    organization_id,
    client_id,
    integration_id,
    entity_type,
    entity_id,
    action,
    old_data,
    new_data,
    origin,
    created_by,
    metadata
  )
  values (
    target_org,
    target_client,
    target_integration,
    tg_table_name,
    target_entity_id,
    lower(tg_op),
    payload_old,
    payload_new,
    'database_trigger',
    auth.uid(),
    jsonb_build_object('table', tg_table_name)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'accounting_integrations',
    'accounting_integration_clients',
    'accounting_tax_records',
    'accounting_documents',
    'accounting_obligations',
    'accounting_payroll_records',
    'accounting_statements',
    'accounting_import_templates',
    'accounting_import_batches'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_updated_at_trigger', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.accounting_touch_updated_at()',
      table_name || '_updated_at_trigger',
      table_name
    );
  end loop;
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'accounting_integrations',
    'accounting_integration_clients',
    'accounting_tax_records',
    'accounting_documents',
    'accounting_obligations',
    'accounting_payroll_records',
    'accounting_statements',
    'accounting_import_batches'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_audit_trigger', table_name);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.log_accounting_table_change()',
      table_name || '_audit_trigger',
      table_name
    );
  end loop;
end $$;

insert into public.accounting_import_templates (
  provider,
  name,
  record_type,
  file_format,
  delimiter,
  column_mapping,
  required_fields,
  sample_file_path
)
values
  (
    'netspeed',
    'NetSpeed - Impostos',
    'tax',
    'csv',
    ',',
    '{"cnpj":"cnpj","competencia":"competence","tipo_imposto":"taxType","descricao":"description","valor":"amount","vencimento":"dueDate","codigo_barras":"barcode","pix":"pixCode","status":"status","external_id":"externalId"}'::jsonb,
    '["cnpj","competencia","tipo_imposto","valor","vencimento"]'::jsonb,
    '/templates/accounting-import-taxes.csv'
  ),
  (
    'manual',
    'Importacao generica - Impostos',
    'tax',
    'csv',
    ',',
    '{"cnpj":"cnpj","competencia":"competence","tipo_imposto":"taxType","descricao":"description","valor":"amount","vencimento":"dueDate","status":"status"}'::jsonb,
    '["cnpj","competencia","tipo_imposto","valor"]'::jsonb,
    '/templates/accounting-import-taxes.csv'
  ),
  (
    'manual',
    'Importacao generica - Obrigacoes',
    'obligation',
    'csv',
    ',',
    '{"cnpj":"cnpj","competencia":"competence","obrigacao":"obligationType","vencimento":"dueDate","entrega":"deliveryDate","status":"status","protocolo":"protocol"}'::jsonb,
    '["cnpj","competencia","obrigacao","vencimento"]'::jsonb,
    '/templates/accounting-import-obligations.csv'
  )
on conflict do nothing;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'accounting_integrations',
    'accounting_integration_clients',
    'accounting_sync_runs',
    'accounting_sync_errors',
    'accounting_tax_records',
    'accounting_documents',
    'accounting_obligations',
    'accounting_payroll_records',
    'accounting_statements',
    'accounting_import_templates',
    'accounting_import_batches',
    'accounting_import_errors',
    'accounting_audit_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'accounting_integrations',
    'accounting_integration_clients',
    'accounting_sync_runs',
    'accounting_sync_errors',
    'accounting_tax_records',
    'accounting_documents',
    'accounting_obligations',
    'accounting_payroll_records',
    'accounting_statements',
    'accounting_import_batches',
    'accounting_import_errors',
    'accounting_audit_logs'
  ]
  loop
    policy_name := table_name || ' org members';
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and policyname = policy_name
    ) then
      execute format(
        'create policy %I on public.%I for all using (public.accounting_can_access_org(organization_id)) with check (public.accounting_can_access_org(organization_id))',
        policy_name,
        table_name
      );
    end if;
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'accounting_import_templates'
      and policyname = 'accounting_import_templates org or global'
  ) then
    create policy "accounting_import_templates org or global"
      on public.accounting_import_templates
      for all
      using (organization_id is null or public.accounting_can_access_org(organization_id))
      with check (organization_id is null or public.accounting_can_access_org(organization_id));
  end if;
end $$;

notify pgrst, 'reload schema';
