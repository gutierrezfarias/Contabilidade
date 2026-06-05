alter table public.profiles
  add column if not exists email text not null default '';

update public.profiles p
set email = lower(coalesce(u.email, p.email))
from auth.users u
where p.id = u.id;

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
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    lower(coalesce(new.email, '')),
    'client'
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name);

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

notify pgrst, 'reload schema';
