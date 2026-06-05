create extension if not exists pgcrypto;

alter table public.company_settings
  add column if not exists phone text not null default '',
  add column if not exists whatsapp text not null default '',
  add column if not exists website text not null default '',
  add column if not exists opening_hours text not null default '',
  add column if not exists business_description text not null default '';

create table if not exists public.accountant_google_connections (
  id uuid primary key default gen_random_uuid(),
  accountant_id uuid not null references public.organizations (id) on delete cascade,
  google_account_id text not null default '',
  access_token text not null default '',
  refresh_token text not null default '',
  token_expires_at timestamptz,
  connected_email text not null default '',
  oauth_state text not null default '',
  status text not null default 'Nao conectado'
    check (status in ('Nao conectado', 'Pendente', 'Conectado', 'Erro', 'Desconectado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (accountant_id)
);

create table if not exists public.accountant_google_locations (
  id uuid primary key default gen_random_uuid(),
  accountant_id uuid not null references public.organizations (id) on delete cascade,
  google_connection_id uuid not null references public.accountant_google_connections (id) on delete cascade,
  google_location_name text not null,
  google_location_id text not null default '',
  business_name text not null default '',
  address text not null default '',
  phone text not null default '',
  website text not null default '',
  sync_status text not null default 'Nao vinculado'
    check (
      sync_status in (
        'Atualizado',
        'Google desatualizado',
        'Pendente',
        'Erro',
        'Nao vinculado',
        'Enviado',
        'Pendente de analise',
        'Rejeitado'
      )
    ),
  selected boolean not null default false,
  google_payload jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (accountant_id, google_location_name)
);

create table if not exists public.google_sync_logs (
  id uuid primary key default gen_random_uuid(),
  accountant_id uuid not null references public.organizations (id) on delete cascade,
  google_location_id uuid references public.accountant_google_locations (id) on delete set null,
  action text not null default '',
  user_id uuid references auth.users (id) on delete set null,
  user_email text not null default '',
  fields_sent text[] not null default '{}',
  old_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  status text not null default 'Pendente',
  error_message text not null default '',
  created_at timestamptz not null default now()
);

alter table public.google_sync_logs
  add column if not exists user_id uuid references auth.users (id) on delete set null,
  add column if not exists user_email text not null default '';

create index if not exists accountant_google_locations_accountant_idx
  on public.accountant_google_locations (accountant_id);

create index if not exists google_sync_logs_accountant_idx
  on public.google_sync_logs (accountant_id, created_at desc);

alter table public.accountant_google_connections enable row level security;
alter table public.accountant_google_locations enable row level security;
alter table public.google_sync_logs enable row level security;

drop policy if exists "Organization access google connections" on public.accountant_google_connections;
create policy "Organization access google connections" on public.accountant_google_connections
  for all using (public.is_admin() or public.is_org_member(accountant_id))
  with check (public.is_admin() or public.is_org_member(accountant_id));

drop policy if exists "Organization access google locations" on public.accountant_google_locations;
create policy "Organization access google locations" on public.accountant_google_locations
  for all using (public.is_admin() or public.is_org_member(accountant_id))
  with check (public.is_admin() or public.is_org_member(accountant_id));

drop policy if exists "Organization access google sync logs" on public.google_sync_logs;
create policy "Organization access google sync logs" on public.google_sync_logs
  for all using (public.is_admin() or public.is_org_member(accountant_id))
  with check (public.is_admin() or public.is_org_member(accountant_id));

comment on table public.accountant_google_connections is
  'Conexoes OAuth do Google Business Profile por escritorio/contador. Tokens nao devem ser expostos ao frontend.';

comment on column public.accountant_google_connections.access_token is
  'Token salvo apenas para uso server-side. Em producao, aplicar criptografia ou cofre.';

comment on column public.accountant_google_connections.refresh_token is
  'Refresh token salvo apenas para uso server-side. Em producao, aplicar criptografia ou cofre.';

notify pgrst, 'reload schema';
