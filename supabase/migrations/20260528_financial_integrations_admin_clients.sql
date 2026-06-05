alter table public.admin_client_profiles
  add column if not exists cep text not null default '';

create table if not exists public.financial_api_integrations (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  name text not null,
  status text not null default 'teste' check (status in ('ativo', 'inativo', 'teste')),
  active boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.financial_api_integrations enable row level security;

drop policy if exists "Admins manage financial api integrations" on public.financial_api_integrations;
create policy "Admins manage financial api integrations"
on public.financial_api_integrations
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

notify pgrst, 'reload schema';
