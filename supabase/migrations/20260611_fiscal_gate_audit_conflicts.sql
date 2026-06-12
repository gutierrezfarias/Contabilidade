-- CONT HUB - Fase 1/2 fiscal: gate de emissao, auditoria, conflitos e aprovacao formal.
-- Migration incremental e nao destrutiva. Pode rodar depois de 20260610_fiscal_module_foundation.sql.

create extension if not exists pgcrypto;

alter table public.fiscal_rule_conflicts
  add column if not exists product_id uuid references public.fiscal_products (id) on delete set null,
  add column if not exists product_code text not null default '',
  add column if not exists ncm text not null default '',
  add column if not exists cest text not null default '',
  add column if not exists conflict_key text not null default '',
  add column if not exists resolution_status text not null default 'pendente',
  add column if not exists ignored_reason text not null default '',
  add column if not exists created_by uuid references auth.users (id),
  add column if not exists updated_at timestamptz not null default now();

update public.fiscal_rule_conflicts
set resolution_status = case when resolved then 'resolvido' else 'pendente' end
where resolution_status = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fiscal_rule_conflicts_resolution_status_check'
      and conrelid = 'public.fiscal_rule_conflicts'::regclass
  ) then
    alter table public.fiscal_rule_conflicts
      add constraint fiscal_rule_conflicts_resolution_status_check
      check (resolution_status in ('pendente', 'resolvido', 'ignorado'));
  end if;
end $$;

create unique index if not exists fiscal_rule_conflicts_pending_key_idx
  on public.fiscal_rule_conflicts (organization_id, client_id, conflict_key)
  where resolution_status = 'pendente' and conflict_key <> '';

create index if not exists fiscal_rule_conflicts_status_idx
  on public.fiscal_rule_conflicts (organization_id, client_id, resolution_status, created_at desc);

alter table public.fiscal_audit_logs
  add column if not exists origin text not null default 'sistema',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists fiscal_audit_logs_entity_idx
  on public.fiscal_audit_logs (organization_id, client_id, entity_type, entity_id, created_at desc);

alter table public.nfe_documents
  add column if not exists fiscal_validation_status text not null default 'Pendente',
  add column if not exists fiscal_block_reason text not null default '',
  add column if not exists tax_preview_result jsonb not null default '{}'::jsonb,
  add column if not exists fiscal_rule_ids jsonb not null default '[]'::jsonb;

create or replace function public.fiscal_can_manage_org(target_org uuid)
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
  or exists (
    select 1
    from public.organization_members
    where organization_id = target_org
      and user_id = auth.uid()
  );
$$;

create or replace function public.fiscal_profile_requires_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_relevant jsonb;
  new_relevant jsonb;
begin
  old_relevant := to_jsonb(old) - array[
    'id', 'created_at', 'updated_at', 'updated_by', 'approved_at', 'approved_by',
    'approval_status', 'fiscal_notes'
  ];
  new_relevant := to_jsonb(new) - array[
    'id', 'created_at', 'updated_at', 'updated_by', 'approved_at', 'approved_by',
    'approval_status', 'fiscal_notes'
  ];

  if old.approval_status = 'Aprovado'
     and new.approval_status = 'Aprovado'
     and old_relevant is distinct from new_relevant then
    new.approval_status := 'Aguardando revisao';
    new.approved_at := null;
    new.approved_by := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists fiscal_profile_requires_review_trigger on public.fiscal_company_profiles;
create trigger fiscal_profile_requires_review_trigger
before update on public.fiscal_company_profiles
for each row execute function public.fiscal_profile_requires_review();

create or replace function public.fiscal_rule_requires_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_relevant jsonb;
  new_relevant jsonb;
begin
  old_relevant := to_jsonb(old) - array[
    'id', 'created_at', 'updated_at', 'updated_by', 'approved_at', 'approved_by',
    'approval_status', 'notes'
  ];
  new_relevant := to_jsonb(new) - array[
    'id', 'created_at', 'updated_at', 'updated_by', 'approved_at', 'approved_by',
    'approval_status', 'notes'
  ];

  if old.approval_status = 'Aprovada'
     and new.approval_status = 'Aprovada'
     and old_relevant is distinct from new_relevant then
    new.approval_status := 'Aguardando revisao';
    new.approved_at := null;
    new.approved_by := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists fiscal_rule_requires_review_trigger on public.fiscal_rules;
create trigger fiscal_rule_requires_review_trigger
before update on public.fiscal_rules
for each row execute function public.fiscal_rule_requires_review();

create or replace function public.log_fiscal_table_change()
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
  target_entity_id uuid;
  actor uuid := auth.uid();
begin
  if tg_op in ('UPDATE', 'DELETE') then
    payload_old := to_jsonb(old);
    target_org := old.organization_id;
    target_client := old.client_id;
    target_entity_id := old.id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    payload_new := to_jsonb(new);
    target_org := new.organization_id;
    target_client := new.client_id;
    target_entity_id := new.id;
  end if;

  insert into public.fiscal_audit_logs (
    organization_id,
    client_id,
    entity_type,
    entity_id,
    action,
    old_data,
    new_data,
    reason,
    created_by,
    origin,
    metadata
  )
  values (
    target_org,
    target_client,
    tg_table_name,
    target_entity_id,
    lower(tg_op),
    payload_old,
    payload_new,
    '',
    actor,
    'database_trigger',
    jsonb_build_object('table', tg_table_name)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists fiscal_profile_audit_trigger on public.fiscal_company_profiles;
create trigger fiscal_profile_audit_trigger
after insert or update or delete on public.fiscal_company_profiles
for each row execute function public.log_fiscal_table_change();

drop trigger if exists fiscal_product_audit_trigger on public.fiscal_products;
create trigger fiscal_product_audit_trigger
after insert or update or delete on public.fiscal_products
for each row execute function public.log_fiscal_table_change();

drop trigger if exists fiscal_rule_audit_trigger on public.fiscal_rules;
create trigger fiscal_rule_audit_trigger
after insert or update or delete on public.fiscal_rules
for each row execute function public.log_fiscal_table_change();

drop trigger if exists fiscal_conflict_audit_trigger on public.fiscal_rule_conflicts;
create trigger fiscal_conflict_audit_trigger
after insert or update or delete on public.fiscal_rule_conflicts
for each row execute function public.log_fiscal_table_change();

create or replace function public.approve_fiscal_profile(target_profile_id uuid, approval_reason text default '')
returns public.fiscal_company_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.fiscal_company_profiles;
begin
  select *
  into profile
  from public.fiscal_company_profiles
  where id = target_profile_id;

  if not found then
    raise exception 'Perfil fiscal nao encontrado.';
  end if;

  if not public.fiscal_can_manage_org(profile.organization_id) then
    raise exception 'Usuario sem permissao para aprovar este perfil fiscal.';
  end if;

  update public.fiscal_company_profiles
  set approval_status = 'Aprovado',
      approved_at = now(),
      approved_by = auth.uid(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = target_profile_id
  returning * into profile;

  insert into public.fiscal_audit_logs (
    organization_id, client_id, entity_type, entity_id, action, old_data, new_data,
    reason, created_by, origin, metadata
  )
  values (
    profile.organization_id, profile.client_id, 'fiscal_company_profiles', profile.id,
    'approve', '{}'::jsonb, to_jsonb(profile), coalesce(approval_reason, ''),
    auth.uid(), 'rpc:approve_fiscal_profile', '{}'::jsonb
  );

  return profile;
end;
$$;

create or replace function public.reject_fiscal_profile(target_profile_id uuid, rejection_reason text)
returns public.fiscal_company_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.fiscal_company_profiles;
begin
  if length(trim(coalesce(rejection_reason, ''))) < 5 then
    raise exception 'Informe o motivo da rejeicao do perfil fiscal.';
  end if;

  select *
  into profile
  from public.fiscal_company_profiles
  where id = target_profile_id;

  if not found then
    raise exception 'Perfil fiscal nao encontrado.';
  end if;

  if not public.fiscal_can_manage_org(profile.organization_id) then
    raise exception 'Usuario sem permissao para rejeitar este perfil fiscal.';
  end if;

  update public.fiscal_company_profiles
  set approval_status = 'Bloqueado',
      approved_at = null,
      approved_by = null,
      updated_by = auth.uid(),
      updated_at = now()
  where id = target_profile_id
  returning * into profile;

  insert into public.fiscal_audit_logs (
    organization_id, client_id, entity_type, entity_id, action, old_data, new_data,
    reason, created_by, origin, metadata
  )
  values (
    profile.organization_id, profile.client_id, 'fiscal_company_profiles', profile.id,
    'reject', '{}'::jsonb, to_jsonb(profile), rejection_reason,
    auth.uid(), 'rpc:reject_fiscal_profile', '{}'::jsonb
  );

  return profile;
end;
$$;

create or replace function public.approve_fiscal_rule(target_rule_id uuid, approval_reason text default '')
returns public.fiscal_rules
language plpgsql
security definer
set search_path = public
as $$
declare
  rule_row public.fiscal_rules;
begin
  select *
  into rule_row
  from public.fiscal_rules
  where id = target_rule_id;

  if not found then
    raise exception 'Regra fiscal nao encontrada.';
  end if;

  if not public.fiscal_can_manage_org(rule_row.organization_id) then
    raise exception 'Usuario sem permissao para aprovar esta regra fiscal.';
  end if;

  update public.fiscal_rules
  set approval_status = 'Aprovada',
      approved_at = now(),
      approved_by = auth.uid(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = target_rule_id
  returning * into rule_row;

  insert into public.fiscal_audit_logs (
    organization_id, client_id, entity_type, entity_id, action, old_data, new_data,
    reason, created_by, origin, metadata
  )
  values (
    rule_row.organization_id, rule_row.client_id, 'fiscal_rules', rule_row.id,
    'approve', '{}'::jsonb, to_jsonb(rule_row), coalesce(approval_reason, ''),
    auth.uid(), 'rpc:approve_fiscal_rule', '{}'::jsonb
  );

  return rule_row;
end;
$$;

create or replace function public.reject_fiscal_rule(target_rule_id uuid, rejection_reason text)
returns public.fiscal_rules
language plpgsql
security definer
set search_path = public
as $$
declare
  rule_row public.fiscal_rules;
begin
  if length(trim(coalesce(rejection_reason, ''))) < 5 then
    raise exception 'Informe o motivo da rejeicao da regra fiscal.';
  end if;

  select *
  into rule_row
  from public.fiscal_rules
  where id = target_rule_id;

  if not found then
    raise exception 'Regra fiscal nao encontrada.';
  end if;

  if not public.fiscal_can_manage_org(rule_row.organization_id) then
    raise exception 'Usuario sem permissao para rejeitar esta regra fiscal.';
  end if;

  update public.fiscal_rules
  set approval_status = 'Bloqueada',
      approved_at = null,
      approved_by = null,
      updated_by = auth.uid(),
      updated_at = now()
  where id = target_rule_id
  returning * into rule_row;

  insert into public.fiscal_audit_logs (
    organization_id, client_id, entity_type, entity_id, action, old_data, new_data,
    reason, created_by, origin, metadata
  )
  values (
    rule_row.organization_id, rule_row.client_id, 'fiscal_rules', rule_row.id,
    'reject', '{}'::jsonb, to_jsonb(rule_row), rejection_reason,
    auth.uid(), 'rpc:reject_fiscal_rule', '{}'::jsonb
  );

  return rule_row;
end;
$$;

notify pgrst, 'reload schema';
