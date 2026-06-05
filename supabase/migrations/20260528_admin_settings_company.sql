create table if not exists public.platform_company_settings (
  id boolean primary key default true check (id),
  country_code text not null default 'BR',
  fields jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.platform_company_settings enable row level security;

drop policy if exists "Admins read platform company settings" on public.platform_company_settings;
create policy "Admins read platform company settings"
on public.platform_company_settings
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins manage platform company settings" on public.platform_company_settings;
create policy "Admins manage platform company settings"
on public.platform_company_settings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.platform_company_settings (id, country_code, fields)
values (true, 'BR', '{}'::jsonb)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
