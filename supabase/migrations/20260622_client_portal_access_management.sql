-- CONT HUB - Gerenciamento de acessos do Portal do Cliente.
-- Migration incremental, idempotente e nao destrutiva.
-- Nao apaga usuarios do Supabase Auth; gerencia somente o vinculo client_portal_users.

alter table public.client_portal_users
  add column if not exists disabled_at timestamptz,
  add column if not exists disabled_by uuid references auth.users (id),
  add column if not exists disabled_reason text not null default '',
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid references auth.users (id),
  add column if not exists removal_reason text not null default '';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.client_portal_users'::regclass
      and conname = 'client_portal_users_role_check'
  ) then
    alter table public.client_portal_users
      drop constraint client_portal_users_role_check;
  end if;

  alter table public.client_portal_users
    add constraint client_portal_users_role_check
    check (role in ('viewer', 'collaborator', 'manager', 'owner'));
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.client_portal_invites'::regclass
      and conname = 'client_portal_invites_role_check'
  ) then
    alter table public.client_portal_invites
      drop constraint client_portal_invites_role_check;
  end if;

  alter table public.client_portal_invites
    add constraint client_portal_invites_role_check
    check (role in ('viewer', 'collaborator', 'manager', 'owner'));
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.client_portal_users'::regclass
      and conname = 'client_portal_users_status_check'
  ) then
    alter table public.client_portal_users
      drop constraint client_portal_users_status_check;
  end if;

  alter table public.client_portal_users
    add constraint client_portal_users_status_check
    check (status in ('invited', 'active', 'disabled', 'removed'));
end $$;

create index if not exists client_portal_users_management_idx
  on public.client_portal_users (organization_id, client_id, status, created_at desc);

create or replace function public.client_portal_role_is_valid(candidate_role text)
returns boolean
language sql
immutable
as $$
  select candidate_role in ('viewer', 'collaborator', 'manager', 'owner');
$$;

create or replace function public.client_portal_status_is_valid(candidate_status text)
returns boolean
language sql
immutable
as $$
  select candidate_status in ('active', 'disabled');
$$;

create or replace function public.log_client_portal_management_event(
  p_portal_access_id uuid,
  p_action text,
  p_old_data jsonb default '{}'::jsonb,
  p_new_data jsonb default '{}'::jsonb,
  p_reason text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_row public.client_portal_users%rowtype;
  log_id uuid;
begin
  select *
    into target_row
    from public.client_portal_users
   where id = p_portal_access_id;

  if target_row.id is null then
    raise exception 'Acesso do portal nao encontrado.';
  end if;

  if not public.accounting_can_access_org(target_row.organization_id) then
    raise exception 'Sem permissao para auditar este acesso.';
  end if;

  insert into public.client_portal_access_logs (
    organization_id,
    client_id,
    portal_user_id,
    user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    target_row.organization_id,
    target_row.client_id,
    target_row.id,
    auth.uid(),
    p_action,
    'client_portal_users',
    target_row.id,
    jsonb_build_object(
      'old', coalesce(p_old_data, '{}'::jsonb),
      'new', coalesce(p_new_data, '{}'::jsonb),
      'reason', coalesce(p_reason, '')
    )
  )
  returning id into log_id;

  return log_id;
end;
$$;

create or replace function public.update_client_portal_user_access(
  p_portal_access_id uuid,
  p_full_name text,
  p_role text,
  p_client_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_row public.client_portal_users%rowtype;
  old_data jsonb;
  new_data jsonb;
  next_client_id uuid;
begin
  select *
    into target_row
    from public.client_portal_users
   where id = p_portal_access_id
     and deleted_at is null
   for update;

  if target_row.id is null then
    raise exception 'Acesso do portal nao encontrado ou removido.';
  end if;

  if not public.accounting_can_access_org(target_row.organization_id) then
    raise exception 'Sem permissao para editar este acesso.';
  end if;

  if not public.client_portal_role_is_valid(p_role) then
    raise exception 'Permissao do portal invalida.';
  end if;

  next_client_id := coalesce(p_client_id, target_row.client_id);

  if not exists (
    select 1
    from public.clients c
    where c.id = next_client_id
      and c.organization_id = target_row.organization_id
  ) then
    raise exception 'Cliente informado nao pertence a organizacao do acesso.';
  end if;

  if exists (
    select 1
    from public.client_portal_users cpu
    where cpu.organization_id = target_row.organization_id
      and cpu.client_id = next_client_id
      and cpu.email_normalized = target_row.email_normalized
      and cpu.deleted_at is null
      and cpu.id <> target_row.id
  ) then
    raise exception 'Ja existe um acesso ativo ou pendente para este e-mail neste cliente.';
  end if;

  old_data := jsonb_build_object(
    'full_name', target_row.full_name,
    'role', target_row.role,
    'client_id', target_row.client_id
  );

  update public.client_portal_users
     set full_name = trim(coalesce(p_full_name, '')),
         role = p_role,
         client_id = next_client_id,
         updated_by = auth.uid()
   where id = target_row.id;

  new_data := jsonb_build_object(
    'full_name', trim(coalesce(p_full_name, '')),
    'role', p_role,
    'client_id', next_client_id
  );

  perform public.log_client_portal_management_event(target_row.id, 'portal_access_updated', old_data, new_data, '');
  return target_row.id;
end;
$$;

create or replace function public.set_client_portal_user_status(
  p_portal_access_id uuid,
  p_status text,
  p_reason text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_row public.client_portal_users%rowtype;
  old_data jsonb;
  new_data jsonb;
begin
  select *
    into target_row
    from public.client_portal_users
   where id = p_portal_access_id
     and deleted_at is null
   for update;

  if target_row.id is null then
    raise exception 'Acesso do portal nao encontrado ou removido.';
  end if;

  if not public.accounting_can_access_org(target_row.organization_id) then
    raise exception 'Sem permissao para alterar este acesso.';
  end if;

  if not public.client_portal_status_is_valid(p_status) then
    raise exception 'Status permitido: active ou disabled.';
  end if;

  old_data := jsonb_build_object(
    'status', target_row.status,
    'disabled_at', target_row.disabled_at,
    'disabled_reason', target_row.disabled_reason
  );

  if p_status = 'disabled' then
    update public.client_portal_users
       set status = 'disabled',
           disabled_at = now(),
           disabled_by = auth.uid(),
           disabled_reason = coalesce(p_reason, ''),
           updated_by = auth.uid()
     where id = target_row.id;
  else
    update public.client_portal_users
       set status = case when user_id is null then 'invited' else 'active' end,
           activated_at = case when user_id is null then activated_at else coalesce(activated_at, now()) end,
           disabled_at = null,
           disabled_by = null,
           disabled_reason = '',
           updated_by = auth.uid()
     where id = target_row.id;
  end if;

  select to_jsonb(cpu)
    into new_data
    from public.client_portal_users cpu
   where cpu.id = target_row.id;

  perform public.log_client_portal_management_event(
    target_row.id,
    case when p_status = 'disabled' then 'portal_access_disabled' else 'portal_access_reactivated' end,
    old_data,
    new_data,
    coalesce(p_reason, '')
  );

  return target_row.id;
end;
$$;

create or replace function public.remove_client_portal_user_link(
  p_portal_access_id uuid,
  p_reason text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_row public.client_portal_users%rowtype;
  old_data jsonb;
begin
  select *
    into target_row
    from public.client_portal_users
   where id = p_portal_access_id
     and deleted_at is null
   for update;

  if target_row.id is null then
    raise exception 'Acesso do portal nao encontrado ou ja removido.';
  end if;

  if not public.accounting_can_access_org(target_row.organization_id) then
    raise exception 'Sem permissao para remover este vinculo.';
  end if;

  old_data := to_jsonb(target_row);

  update public.client_portal_users
     set status = 'removed',
         removed_at = now(),
         removed_by = auth.uid(),
         removal_reason = coalesce(p_reason, ''),
         deleted_at = now(),
         updated_by = auth.uid()
   where id = target_row.id;

  perform public.log_client_portal_management_event(
    target_row.id,
    'portal_access_removed',
    old_data,
    jsonb_build_object('status', 'removed', 'deleted_at', now()),
    coalesce(p_reason, '')
  );

  return target_row.id;
end;
$$;

create or replace function public.record_client_portal_password_reset_request(
  p_portal_access_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_row public.client_portal_users%rowtype;
begin
  select *
    into target_row
    from public.client_portal_users
   where id = p_portal_access_id
     and deleted_at is null;

  if target_row.id is null then
    raise exception 'Acesso do portal nao encontrado ou removido.';
  end if;

  if not public.accounting_can_access_org(target_row.organization_id) then
    raise exception 'Sem permissao para solicitar redefinicao deste acesso.';
  end if;

  update public.client_portal_users
     set recovery_requested_at = now(),
         updated_by = auth.uid()
   where id = target_row.id;

  perform public.log_client_portal_management_event(
    target_row.id,
    'portal_password_reset_requested',
    jsonb_build_object('recovery_requested_at', target_row.recovery_requested_at),
    jsonb_build_object('recovery_requested_at', now()),
    ''
  );

  return target_row.id;
end;
$$;

create or replace function public.upsert_client_portal_user(
  p_organization_id uuid,
  p_client_id uuid,
  p_email text,
  p_full_name text default '',
  p_role text default 'viewer'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(coalesce(p_email, '')));
  matched_user_id uuid;
  portal_id uuid;
  next_status text;
begin
  if not public.accounting_can_access_org(p_organization_id) then
    raise exception 'Sem permissao para convidar usuario do portal.';
  end if;

  if normalized_email = '' or position('@' in normalized_email) = 0 then
    raise exception 'E-mail do portal invalido.';
  end if;

  if not public.client_portal_role_is_valid(p_role) then
    raise exception 'Permissao do portal invalida.';
  end if;

  if not exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.organization_id = p_organization_id
  ) then
    raise exception 'Cliente nao pertence a organizacao informada.';
  end if;

  select au.id
    into matched_user_id
    from auth.users au
   where lower(au.email) = normalized_email
   limit 1;

  next_status := case when matched_user_id is null then 'invited' else 'active' end;

  update public.client_portal_users cpu
     set full_name = coalesce(nullif(p_full_name, ''), cpu.full_name),
         role = p_role,
         status = case when cpu.status = 'disabled' then cpu.status else next_status end,
         user_id = coalesce(cpu.user_id, matched_user_id),
         activated_at = case
           when coalesce(cpu.user_id, matched_user_id) is not null then coalesce(cpu.activated_at, now())
           else cpu.activated_at
         end,
         updated_by = auth.uid()
   where cpu.organization_id = p_organization_id
     and cpu.client_id = p_client_id
     and cpu.email_normalized = normalized_email
     and cpu.deleted_at is null
   returning cpu.id into portal_id;

  if portal_id is null then
    insert into public.client_portal_users (
      organization_id,
      client_id,
      user_id,
      email,
      email_normalized,
      full_name,
      role,
      status,
      activated_at,
      created_by,
      updated_by
    )
    values (
      p_organization_id,
      p_client_id,
      matched_user_id,
      normalized_email,
      normalized_email,
      coalesce(p_full_name, ''),
      p_role,
      next_status,
      case when matched_user_id is null then null else now() end,
      auth.uid(),
      auth.uid()
    )
    returning id into portal_id;
  end if;

  insert into public.client_portal_invites (
    organization_id,
    client_id,
    portal_user_id,
    email,
    email_normalized,
    role,
    status,
    expires_at,
    created_by
  )
  values (
    p_organization_id,
    p_client_id,
    portal_id,
    normalized_email,
    normalized_email,
    p_role,
    case when matched_user_id is null then 'pending' else 'accepted' end,
    now() + interval '14 days',
    auth.uid()
  );

  perform public.log_client_portal_management_event(
    portal_id,
    'portal_access_upserted',
    '{}'::jsonb,
    jsonb_build_object('email', normalized_email, 'role', p_role, 'status', next_status),
    ''
  );

  return portal_id;
end;
$$;

revoke all on public.client_portal_users from anon;
revoke all on public.client_portal_invites from anon;
revoke all on public.client_portal_access_logs from anon;

revoke insert, update, delete, truncate, references, trigger on public.client_portal_users from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.client_portal_invites from authenticated;
revoke update, delete, truncate, references, trigger on public.client_portal_access_logs from authenticated;
grant select on public.client_portal_users to authenticated;

grant execute on function public.update_client_portal_user_access(uuid, text, text, uuid) to authenticated;
grant execute on function public.set_client_portal_user_status(uuid, text, text) to authenticated;
grant execute on function public.remove_client_portal_user_link(uuid, text) to authenticated;
grant execute on function public.record_client_portal_password_reset_request(uuid) to authenticated;
grant execute on function public.log_client_portal_management_event(uuid, text, jsonb, jsonb, text) to authenticated;

grant all privileges on public.client_portal_users to service_role, postgres;
grant all privileges on public.client_portal_invites to service_role, postgres;
grant all privileges on public.client_portal_access_logs to service_role, postgres;
grant execute on function public.update_client_portal_user_access(uuid, text, text, uuid) to service_role, postgres;
grant execute on function public.set_client_portal_user_status(uuid, text, text) to service_role, postgres;
grant execute on function public.remove_client_portal_user_link(uuid, text) to service_role, postgres;
grant execute on function public.record_client_portal_password_reset_request(uuid) to service_role, postgres;
grant execute on function public.log_client_portal_management_event(uuid, text, jsonb, jsonb, text) to service_role, postgres;

notify pgrst, 'reload schema';
