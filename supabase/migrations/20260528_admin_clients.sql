create table if not exists public.admin_client_profiles (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  contact_name text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  city text not null default '',
  state text not null default '',
  discount_percent numeric(5,2) not null default 0,
  subscription_exempt boolean not null default false,
  notes text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_app_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  application_id text not null,
  application_name text not null,
  status text not null default 'inativo' check (status in ('ativo', 'inativo', 'teste', 'cancelado')),
  monthly_price numeric(12,2) not null default 0,
  discount_percent numeric(5,2) not null default 0,
  subscription_exempt boolean not null default false,
  started_at date,
  next_billing_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, application_id)
);

alter table public.admin_client_profiles enable row level security;
alter table public.organization_app_subscriptions enable row level security;

drop policy if exists "Admins manage admin client profiles" on public.admin_client_profiles;
create policy "Admins manage admin client profiles" on public.admin_client_profiles
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Members read own admin client profile" on public.admin_client_profiles;
create policy "Members read own admin client profile" on public.admin_client_profiles
  for select using (public.is_org_member(organization_id));

drop policy if exists "Admins manage organization app subscriptions" on public.organization_app_subscriptions;
create policy "Admins manage organization app subscriptions" on public.organization_app_subscriptions
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Members read own organization app subscriptions" on public.organization_app_subscriptions;
create policy "Members read own organization app subscriptions" on public.organization_app_subscriptions
  for select using (public.is_org_member(organization_id));
