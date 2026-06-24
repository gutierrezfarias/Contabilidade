-- CONT HUB - auditoria fiscal completa por empresa emissora.
-- Incremental, idempotente e nao destrutivo.
-- Reutiliza public.fiscal_audit_logs criada em 20260610_fiscal_module_foundation.sql.

create extension if not exists pgcrypto;

alter table public.fiscal_audit_logs
  add column if not exists changed_fields jsonb not null default '[]'::jsonb,
  add column if not exists correlation_id text not null default '';

comment on table public.fiscal_audit_logs is
  'Auditoria fiscal por organizacao e empresa emissora. Nao armazenar segredos, PFX/P12, senhas, tokens ou XML completo.';

comment on column public.fiscal_audit_logs.old_data is
  'Snapshot anterior saneado. Segredos e XML completo devem ser mascarados.';

comment on column public.fiscal_audit_logs.new_data is
  'Snapshot novo saneado. Segredos e XML completo devem ser mascarados.';

comment on column public.fiscal_audit_logs.changed_fields is
  'Lista JSON com nomes dos campos alterados entre old_data e new_data.';

comment on column public.fiscal_audit_logs.correlation_id is
  'Identificador tecnico opcional para correlacionar frontend, backend, RPC e trigger.';

create index if not exists fiscal_audit_logs_action_idx
  on public.fiscal_audit_logs (organization_id, client_id, action, created_at desc);

create index if not exists fiscal_audit_logs_correlation_idx
  on public.fiscal_audit_logs (correlation_id)
  where correlation_id <> '';

create or replace function public.cont_hub_sanitize_fiscal_audit_data(input_value jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  result jsonb;
  item jsonb;
  item_key text;
  item_value jsonb;
  normalized_key text;
begin
  if input_value is null then
    return '{}'::jsonb;
  end if;

  case jsonb_typeof(input_value)
    when 'object' then
      result := '{}'::jsonb;

      for item_key, item_value in
        select key, value
        from jsonb_each(input_value)
      loop
        normalized_key := lower(item_key);

        if normalized_key ~ '(senha|password|token|secret|private_key|service_role|access_token|refresh_token|pfx|p12|pkcs|cert_file|certificate_file|certificate_password|arquivo_certificado|xml|soap|envelope)' then
          result := result || jsonb_build_object(item_key, '[REDACTED]');
        else
          result := result || jsonb_build_object(item_key, public.cont_hub_sanitize_fiscal_audit_data(item_value));
        end if;
      end loop;

      return result;

    when 'array' then
      result := '[]'::jsonb;

      for item in
        select value
        from jsonb_array_elements(input_value)
      loop
        result := result || jsonb_build_array(public.cont_hub_sanitize_fiscal_audit_data(item));
      end loop;

      return result;

    else
      return input_value;
  end case;
end;
$$;

create or replace function public.cont_hub_jsonb_changed_fields(previous_data jsonb, next_data jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_agg(changed.key order by changed.key), '[]'::jsonb)
  from (
    select keys.key
    from jsonb_object_keys(coalesce(previous_data, '{}'::jsonb) || coalesce(next_data, '{}'::jsonb)) as keys(key)
    where coalesce(previous_data, '{}'::jsonb) -> keys.key
      is distinct from coalesce(next_data, '{}'::jsonb) -> keys.key
  ) changed;
$$;

create or replace function public.cont_hub_validate_fiscal_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organization_id is null then
    raise exception 'Auditoria fiscal exige organization_id.';
  end if;

  if length(trim(coalesce(new.entity_type, ''))) = 0 then
    raise exception 'Auditoria fiscal exige entity_type.';
  end if;

  if length(trim(coalesce(new.action, ''))) = 0 then
    raise exception 'Auditoria fiscal exige action.';
  end if;

  if new.client_id is not null and not exists (
    select 1
    from public.clients c
    where c.id = new.client_id
      and c.organization_id = new.organization_id
  ) then
    raise exception 'Empresa cliente nao pertence a organizacao da auditoria fiscal.';
  end if;

  new.old_data := public.cont_hub_sanitize_fiscal_audit_data(coalesce(new.old_data, '{}'::jsonb));
  new.new_data := public.cont_hub_sanitize_fiscal_audit_data(coalesce(new.new_data, '{}'::jsonb));
  new.metadata := public.cont_hub_sanitize_fiscal_audit_data(coalesce(new.metadata, '{}'::jsonb));
  new.changed_fields := case
    when coalesce(jsonb_array_length(coalesce(new.changed_fields, '[]'::jsonb)), 0) = 0 then
      public.cont_hub_jsonb_changed_fields(new.old_data, new.new_data)
    else
      public.cont_hub_sanitize_fiscal_audit_data(new.changed_fields)
  end;
  new.origin := coalesce(nullif(trim(new.origin), ''), 'sistema');
  new.reason := coalesce(new.reason, '');
  new.correlation_id := coalesce(nullif(trim(new.correlation_id), ''), '');
  new.created_by := coalesce(new.created_by, auth.uid());
  new.created_at := coalesce(new.created_at, now());

  return new;
end;
$$;

drop trigger if exists fiscal_audit_logs_integrity_trigger on public.fiscal_audit_logs;
create trigger fiscal_audit_logs_integrity_trigger
before insert or update on public.fiscal_audit_logs
for each row execute function public.cont_hub_validate_fiscal_audit_log();

create or replace function public.log_fiscal_table_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payload_old jsonb := '{}'::jsonb;
  payload_new jsonb := '{}'::jsonb;
  sanitized_old jsonb := '{}'::jsonb;
  sanitized_new jsonb := '{}'::jsonb;
  changed jsonb := '[]'::jsonb;
  target_org uuid;
  target_client uuid;
  target_entity_id uuid;
  actor uuid;
  audit_action text;
  audit_origin text;
  audit_reason text;
  audit_correlation_id text;
  configured_action text;
  configured_metadata text;
  metadata_override jsonb := '{}'::jsonb;
begin
  if coalesce(nullif(current_setting('cont_hub.audit.skip', true), ''), 'false') = 'true' then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    payload_old := to_jsonb(old);
    target_org := old.organization_id;
    target_client := old.client_id;
    target_entity_id := old.id;
    actor := coalesce(
      auth.uid(),
      nullif(payload_old ->> 'updated_by', '')::uuid,
      nullif(payload_old ->> 'created_by', '')::uuid
    );
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    payload_new := to_jsonb(new);
    target_org := new.organization_id;
    target_client := new.client_id;
    target_entity_id := new.id;
    actor := coalesce(
      auth.uid(),
      nullif(payload_new ->> 'updated_by', '')::uuid,
      nullif(payload_new ->> 'created_by', '')::uuid,
      actor
    );
  end if;

  sanitized_old := public.cont_hub_sanitize_fiscal_audit_data(payload_old);
  sanitized_new := public.cont_hub_sanitize_fiscal_audit_data(payload_new);
  changed := public.cont_hub_jsonb_changed_fields(sanitized_old, sanitized_new);
  configured_action := nullif(current_setting('cont_hub.audit.action', true), '');

  if configured_action is not null then
    audit_action := configured_action;
  elsif tg_op = 'INSERT' then
    audit_action := 'create';
  elsif tg_op = 'DELETE' then
    audit_action := 'delete';
  elsif sanitized_old ->> 'active' = 'true' and sanitized_new ->> 'active' = 'false' then
    audit_action := 'deactivate';
  elsif sanitized_old ->> 'active' = 'false' and sanitized_new ->> 'active' = 'true' then
    audit_action := 'reactivate';
  else
    audit_action := 'update';
  end if;

  audit_origin := coalesce(nullif(current_setting('cont_hub.audit.origin', true), ''), 'database_trigger');
  audit_reason := coalesce(nullif(current_setting('cont_hub.audit.reason', true), ''), '');
  audit_correlation_id := coalesce(nullif(current_setting('cont_hub.audit.correlation_id', true), ''), '');
  configured_metadata := nullif(current_setting('cont_hub.audit.metadata', true), '');

  if configured_metadata is not null then
    begin
      metadata_override := configured_metadata::jsonb;
    exception when others then
      metadata_override := jsonb_build_object('metadata_parse_error', true);
    end;
  end if;

  insert into public.fiscal_audit_logs (
    organization_id,
    client_id,
    entity_type,
    entity_id,
    action,
    old_data,
    new_data,
    changed_fields,
    reason,
    created_by,
    origin,
    correlation_id,
    metadata
  )
  values (
    target_org,
    target_client,
    tg_table_name,
    target_entity_id,
    audit_action,
    sanitized_old,
    sanitized_new,
    changed,
    audit_reason,
    actor,
    audit_origin,
    audit_correlation_id,
    jsonb_build_object(
      'schema', tg_table_schema,
      'table', tg_table_name,
      'operation', tg_op,
      'trigger', 'log_fiscal_table_change',
      'changed_fields_count', jsonb_array_length(changed)
    ) || public.cont_hub_sanitize_fiscal_audit_data(metadata_override)
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

drop trigger if exists fiscal_product_group_audit_trigger on public.fiscal_product_groups;
create trigger fiscal_product_group_audit_trigger
after insert or update or delete on public.fiscal_product_groups
for each row execute function public.log_fiscal_table_change();

drop trigger if exists fiscal_operation_type_audit_trigger on public.fiscal_operation_types;
create trigger fiscal_operation_type_audit_trigger
after insert or update or delete on public.fiscal_operation_types
for each row execute function public.log_fiscal_table_change();

drop trigger if exists fiscal_benefit_audit_trigger on public.fiscal_benefits;
create trigger fiscal_benefit_audit_trigger
after insert or update or delete on public.fiscal_benefits
for each row execute function public.log_fiscal_table_change();

drop trigger if exists custom_cfop_audit_trigger on public.custom_cfops;
create trigger custom_cfop_audit_trigger
after insert or update or delete on public.custom_cfops
for each row execute function public.log_fiscal_table_change();

drop trigger if exists fiscal_rule_audit_trigger on public.fiscal_rules;
create trigger fiscal_rule_audit_trigger
after insert or update or delete on public.fiscal_rules
for each row execute function public.log_fiscal_table_change();

drop trigger if exists fiscal_rule_version_audit_trigger on public.fiscal_rule_versions;
create trigger fiscal_rule_version_audit_trigger
after insert or update or delete on public.fiscal_rule_versions
for each row execute function public.log_fiscal_table_change();

drop trigger if exists fiscal_conflict_audit_trigger on public.fiscal_rule_conflicts;
create trigger fiscal_conflict_audit_trigger
after insert or update or delete on public.fiscal_rule_conflicts
for each row execute function public.log_fiscal_table_change();

drop trigger if exists fiscal_simulation_audit_trigger on public.fiscal_simulations;
create trigger fiscal_simulation_audit_trigger
after insert or update or delete on public.fiscal_simulations
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

  perform set_config('cont_hub.audit.action', 'approve', true);
  perform set_config('cont_hub.audit.origin', 'rpc:approve_fiscal_profile', true);
  perform set_config('cont_hub.audit.reason', coalesce(approval_reason, ''), true);
  perform set_config('cont_hub.audit.correlation_id', gen_random_uuid()::text, true);
  perform set_config('cont_hub.audit.metadata', jsonb_build_object('approval_status', 'Aprovado')::text, true);

  update public.fiscal_company_profiles
  set approval_status = 'Aprovado',
      approved_at = now(),
      approved_by = auth.uid(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = target_profile_id
  returning * into profile;

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

  perform set_config('cont_hub.audit.action', 'reject', true);
  perform set_config('cont_hub.audit.origin', 'rpc:reject_fiscal_profile', true);
  perform set_config('cont_hub.audit.reason', rejection_reason, true);
  perform set_config('cont_hub.audit.correlation_id', gen_random_uuid()::text, true);
  perform set_config('cont_hub.audit.metadata', jsonb_build_object('approval_status', 'Bloqueado')::text, true);

  update public.fiscal_company_profiles
  set approval_status = 'Bloqueado',
      approved_at = null,
      approved_by = null,
      updated_by = auth.uid(),
      updated_at = now()
  where id = target_profile_id
  returning * into profile;

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

  perform set_config('cont_hub.audit.action', 'approve', true);
  perform set_config('cont_hub.audit.origin', 'rpc:approve_fiscal_rule', true);
  perform set_config('cont_hub.audit.reason', coalesce(approval_reason, ''), true);
  perform set_config('cont_hub.audit.correlation_id', gen_random_uuid()::text, true);
  perform set_config('cont_hub.audit.metadata', jsonb_build_object('approval_status', 'Aprovada')::text, true);

  update public.fiscal_rules
  set approval_status = 'Aprovada',
      approved_at = now(),
      approved_by = auth.uid(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = target_rule_id
  returning * into rule_row;

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

  perform set_config('cont_hub.audit.action', 'reject', true);
  perform set_config('cont_hub.audit.origin', 'rpc:reject_fiscal_rule', true);
  perform set_config('cont_hub.audit.reason', rejection_reason, true);
  perform set_config('cont_hub.audit.correlation_id', gen_random_uuid()::text, true);
  perform set_config('cont_hub.audit.metadata', jsonb_build_object('approval_status', 'Bloqueada')::text, true);

  update public.fiscal_rules
  set approval_status = 'Bloqueada',
      approved_at = null,
      approved_by = null,
      updated_by = auth.uid(),
      updated_at = now()
  where id = target_rule_id
  returning * into rule_row;

  return rule_row;
end;
$$;

drop policy if exists "Organization insert fiscal audit logs" on public.fiscal_audit_logs;
drop policy if exists "Organization read fiscal audit logs" on public.fiscal_audit_logs;
create policy "Organization read fiscal audit logs"
  on public.fiscal_audit_logs
  for select
  to authenticated
  using (public.is_platform_admin() or public.is_org_member(organization_id));

revoke all on public.fiscal_audit_logs from anon;
revoke insert, update, delete, truncate, references, trigger on public.fiscal_audit_logs from authenticated;
grant select on public.fiscal_audit_logs to authenticated;
grant all privileges on public.fiscal_audit_logs to service_role, postgres;

grant execute on function public.approve_fiscal_profile(uuid, text) to authenticated;
grant execute on function public.reject_fiscal_profile(uuid, text) to authenticated;
grant execute on function public.approve_fiscal_rule(uuid, text) to authenticated;
grant execute on function public.reject_fiscal_rule(uuid, text) to authenticated;

grant execute on function public.approve_fiscal_profile(uuid, text) to service_role, postgres;
grant execute on function public.reject_fiscal_profile(uuid, text) to service_role, postgres;
grant execute on function public.approve_fiscal_rule(uuid, text) to service_role, postgres;
grant execute on function public.reject_fiscal_rule(uuid, text) to service_role, postgres;

notify pgrst, 'reload schema';
