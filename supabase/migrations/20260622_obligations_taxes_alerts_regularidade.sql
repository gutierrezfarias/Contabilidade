-- CONT HUB - Obrigações, impostos/guias, alertas e regularidade.
-- Migration incremental, idempotente e nao destrutiva.
-- Complementa tabelas criadas em 20260616_accounting_integrations.sql e 20260622_client_portal_and_accounting_documents.sql.

create extension if not exists pgcrypto;

alter table public.accounting_obligations
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists recurrence_type text not null default 'none',
  add column if not exists recurrence_until date,
  add column if not exists notes text not null default '',
  add column if not exists guide_document_id uuid references public.accounting_documents (id) on delete set null,
  add column if not exists receipt_document_id uuid references public.accounting_documents (id) on delete set null,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists deleted_by uuid references auth.users (id),
  add column if not exists alert_days_before integer not null default 7;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.accounting_obligations'::regclass
      and conname = 'accounting_obligations_status_check'
  ) then
    alter table public.accounting_obligations
      drop constraint accounting_obligations_status_check;
  end if;

  alter table public.accounting_obligations
    add constraint accounting_obligations_status_check
    check (status in ('pending', 'in_progress', 'processing', 'delivered', 'late', 'overdue', 'exempt', 'cancelled'));
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.accounting_obligations'::regclass
      and conname = 'accounting_obligations_recurrence_check'
  ) then
    alter table public.accounting_obligations
      add constraint accounting_obligations_recurrence_check
      check (recurrence_type in ('none', 'monthly', 'quarterly', 'semiannual', 'annual'));
  end if;
end $$;

create unique index if not exists accounting_obligations_natural_unique_idx
  on public.accounting_obligations (organization_id, client_id, lower(obligation_type), competence)
  where deleted_at is null;
create index if not exists accounting_obligations_calendar_idx
  on public.accounting_obligations (organization_id, due_date, client_id, status)
  where deleted_at is null;
create index if not exists accounting_obligations_docs_idx
  on public.accounting_obligations (organization_id, guide_document_id, receipt_document_id)
  where deleted_at is null;

alter table public.accounting_tax_records
  add column if not exists principal_amount numeric(14,2) not null default 0,
  add column if not exists penalty_amount numeric(14,2) not null default 0,
  add column if not exists interest_amount numeric(14,2) not null default 0,
  add column if not exists total_amount numeric(14,2) not null default 0,
  add column if not exists paid_at date,
  add column if not exists installment_number integer,
  add column if not exists installment_total integer,
  add column if not exists guide_document_id uuid references public.accounting_documents (id) on delete set null,
  add column if not exists receipt_document_id uuid references public.accounting_documents (id) on delete set null,
  add column if not exists notes text not null default '',
  add column if not exists deleted_by uuid references auth.users (id),
  add column if not exists alert_days_before integer not null default 7;

update public.accounting_tax_records
   set principal_amount = amount,
       total_amount = case
         when coalesce(total_amount, 0) = 0 then amount
         else total_amount
       end
 where coalesce(principal_amount, 0) = 0
   and coalesce(amount, 0) <> 0;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.accounting_tax_records'::regclass
      and conname = 'accounting_tax_records_status_check'
  ) then
    alter table public.accounting_tax_records
      drop constraint accounting_tax_records_status_check;
  end if;

  alter table public.accounting_tax_records
    add constraint accounting_tax_records_status_check
    check (status in ('pending', 'available', 'sent', 'viewed', 'paid', 'overdue', 'installment', 'parcelled', 'cancelled', 'ignored'));
end $$;

create index if not exists accounting_tax_records_calendar_idx
  on public.accounting_tax_records (organization_id, due_date, client_id, status)
  where deleted_at is null;
create index if not exists accounting_tax_records_docs_idx
  on public.accounting_tax_records (organization_id, guide_document_id, receipt_document_id)
  where deleted_at is null;

create table if not exists public.accounting_alert_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  alert_type text not null,
  days_before integer not null default 7,
  active boolean not null default true,
  channels jsonb not null default '["system"]'::jsonb,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint accounting_alert_settings_type_check
    check (alert_type in ('obligation_due', 'tax_due', 'missing_guide', 'missing_receipt', 'document_requested'))
);

create unique index if not exists accounting_alert_settings_unique_idx
  on public.accounting_alert_settings (
    organization_id,
    coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid),
    alert_type
  )
  where deleted_at is null;

create table if not exists public.accounting_alert_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  alert_type text not null,
  idempotency_key text not null,
  severity text not null default 'warning',
  title text not null,
  message text not null default '',
  due_date date,
  status text not null default 'open',
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users (id),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint accounting_alert_events_entity_check
    check (entity_type in ('obligation', 'tax', 'document', 'client')),
  constraint accounting_alert_events_type_check
    check (alert_type in ('obligation_due', 'tax_due', 'missing_guide', 'missing_receipt', 'document_requested')),
  constraint accounting_alert_events_severity_check
    check (severity in ('info', 'warning', 'critical')),
  constraint accounting_alert_events_status_check
    check (status in ('open', 'acknowledged', 'resolved', 'dismissed'))
);

create unique index if not exists accounting_alert_events_idempotency_idx
  on public.accounting_alert_events (organization_id, idempotency_key)
  where deleted_at is null;
create index if not exists accounting_alert_events_client_idx
  on public.accounting_alert_events (organization_id, client_id, status, due_date)
  where deleted_at is null;

create or replace function public.upsert_accounting_alert_event(
  p_organization_id uuid,
  p_client_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_alert_type text,
  p_idempotency_key text,
  p_severity text,
  p_title text,
  p_message text,
  p_due_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  alert_id uuid;
begin
  if not public.accounting_can_access_org(p_organization_id) then
    raise exception 'Sem permissao para registrar alerta contabil.';
  end if;

  insert into public.accounting_alert_events (
    organization_id,
    client_id,
    entity_type,
    entity_id,
    alert_type,
    idempotency_key,
    severity,
    title,
    message,
    due_date,
    created_by
  )
  values (
    p_organization_id,
    p_client_id,
    p_entity_type,
    p_entity_id,
    p_alert_type,
    p_idempotency_key,
    p_severity,
    p_title,
    p_message,
    p_due_date,
    auth.uid()
  )
  on conflict (organization_id, idempotency_key) where deleted_at is null
  do update set
    severity = excluded.severity,
    title = excluded.title,
    message = excluded.message,
    due_date = excluded.due_date,
    status = case
      when public.accounting_alert_events.status in ('resolved', 'dismissed') then public.accounting_alert_events.status
      else 'open'
    end,
    updated_at = now()
  returning id into alert_id;

  return alert_id;
end;
$$;

do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'accounting_alert_settings',
    'accounting_alert_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
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
declare
  table_name text;
begin
  foreach table_name in array array[
    'accounting_alert_settings',
    'accounting_alert_events'
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
    'accounting_alert_settings',
    'accounting_alert_events'
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

grant select, insert, update on public.accounting_obligations to authenticated;
grant select, insert, update on public.accounting_tax_records to authenticated;
grant select, insert, update on public.accounting_alert_settings to authenticated;
grant select, insert, update on public.accounting_alert_events to authenticated;
grant execute on function public.upsert_accounting_alert_event(uuid, uuid, text, uuid, text, text, text, text, text, date) to authenticated;

grant all privileges on public.accounting_obligations to service_role, postgres;
grant all privileges on public.accounting_tax_records to service_role, postgres;
grant all privileges on public.accounting_alert_settings to service_role, postgres;
grant all privileges on public.accounting_alert_events to service_role, postgres;
grant execute on function public.upsert_accounting_alert_event(uuid, uuid, text, uuid, text, text, text, text, text, date) to service_role, postgres;

notify pgrst, 'reload schema';
