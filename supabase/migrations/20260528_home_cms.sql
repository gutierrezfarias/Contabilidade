create table if not exists public.home_settings (
  id boolean primary key default true check (id),
  hero_title text not null default '',
  hero_description text not null default '',
  footer_description text not null default '',
  footer_email text not null default '',
  footer_phone text not null default '',
  footer_address text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.home_slides (
  id uuid primary key default gen_random_uuid(),
  eyebrow text not null default '',
  title text not null default '',
  description text not null default '',
  theme text not null default 'focus' check (theme in ('focus', 'balance', 'growth')),
  button_label text not null default 'Comecar agora',
  button_url text not null default '/cadastro',
  image_url text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.home_banners (
  id uuid primary key default gen_random_uuid(),
  category text not null default '',
  title text not null default '',
  description text not null default '',
  image_url text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.home_footer_groups (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.home_footer_links (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.home_footer_groups (id) on delete cascade,
  label text not null default '',
  url text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.home_slides enable row level security;
alter table public.home_banners enable row level security;
alter table public.home_footer_groups enable row level security;
alter table public.home_footer_links enable row level security;
alter table public.home_settings enable row level security;

drop policy if exists "Public can read home settings" on public.home_settings;
create policy "Public can read home settings" on public.home_settings
  for select to anon, authenticated using (true);

drop policy if exists "Admins manage home settings" on public.home_settings;
create policy "Admins manage home settings" on public.home_settings
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.home_settings (id) values (true) on conflict (id) do nothing;

drop policy if exists "Public read active home slides" on public.home_slides;
create policy "Public read active home slides" on public.home_slides
  for select to anon, authenticated using (active);

drop policy if exists "Admins manage home slides" on public.home_slides;
create policy "Admins manage home slides" on public.home_slides
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Public read active home banners" on public.home_banners;
create policy "Public read active home banners" on public.home_banners
  for select to anon, authenticated using (active);

drop policy if exists "Admins manage home banners" on public.home_banners;
create policy "Admins manage home banners" on public.home_banners
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Public read footer groups" on public.home_footer_groups;
create policy "Public read footer groups" on public.home_footer_groups
  for select to anon, authenticated using (true);

drop policy if exists "Admins manage footer groups" on public.home_footer_groups;
create policy "Admins manage footer groups" on public.home_footer_groups
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Public read active footer links" on public.home_footer_links;
create policy "Public read active footer links" on public.home_footer_links
  for select to anon, authenticated using (active);

drop policy if exists "Admins manage footer links" on public.home_footer_links;
create policy "Admins manage footer links" on public.home_footer_links
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.home_slides (eyebrow, title, description, theme, sort_order)
select 'Controle pessoal', 'Planeje hoje. Avance todos os dias.', 'Centralize compromissos, objetivos e indicadores em uma experiencia simples e elegante.', 'focus', 1
where not exists (select 1 from public.home_slides);

insert into public.home_banners (category, title, description, sort_order)
select 'Agenda', 'Semana organizada', 'Visualize tarefas e prioridades em um so lugar.', 1
where not exists (select 1 from public.home_banners);

insert into public.home_footer_groups (title, sort_order)
select 'Plataforma', 1
where not exists (select 1 from public.home_footer_groups);
