create table if not exists public.platform_app_pricing (
  application_id text primary key,
  name text not null,
  description text not null default '',
  monthly_price numeric(12,2) not null default 0,
  discount_percent numeric(5,2) not null default 0,
  active boolean not null default true,
  is_bundle boolean not null default false,
  included_application_ids text[] not null default '{}',
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.mini_crm_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_name text not null default '',
  company_name text not null default '',
  cnpj text not null default '',
  email text not null default '',
  phone text not null default '',
  source text not null default '',
  stage text not null default 'Lead'
    check (stage in ('Lead', 'Qualificado', 'Proposta', 'Cliente', 'Perdido')),
  estimated_value numeric(12,2) not null default 0,
  next_action_date date,
  notes text not null default '',
  converted_client_id uuid references public.clients (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.website_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  preview_image text not null default '',
  layout_key text not null default 'classic',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.website_sites (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  template_id uuid references public.website_templates (id) on delete set null,
  site_name text not null default '',
  domain text not null default '',
  headline text not null default '',
  subtitle text not null default '',
  about_text text not null default '',
  services_text text not null default '',
  primary_color text not null default '#4f46e5',
  logo_data text,
  hero_image_data text,
  published boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists mini_crm_leads_org_stage_idx on public.mini_crm_leads (organization_id, stage);
create index if not exists website_templates_active_idx on public.website_templates (active, sort_order);

alter table public.platform_app_pricing enable row level security;
alter table public.mini_crm_leads enable row level security;
alter table public.website_templates enable row level security;
alter table public.website_sites enable row level security;

drop policy if exists "Authenticated read app pricing" on public.platform_app_pricing;
create policy "Authenticated read app pricing" on public.platform_app_pricing
  for select to authenticated using (true);

drop policy if exists "Admins manage app pricing" on public.platform_app_pricing;
create policy "Admins manage app pricing" on public.platform_app_pricing
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Organization access mini crm leads" on public.mini_crm_leads;
create policy "Organization access mini crm leads" on public.mini_crm_leads
  for all using (public.is_admin() or public.is_org_member(organization_id))
  with check (public.is_admin() or public.is_org_member(organization_id));

drop policy if exists "Authenticated read website templates" on public.website_templates;
create policy "Authenticated read website templates" on public.website_templates
  for select to authenticated using (active or public.is_admin());

drop policy if exists "Admins manage website templates" on public.website_templates;
create policy "Admins manage website templates" on public.website_templates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Organization access website site" on public.website_sites;
create policy "Organization access website site" on public.website_sites
  for all using (public.is_admin() or public.is_org_member(organization_id))
  with check (public.is_admin() or public.is_org_member(organization_id));

insert into public.platform_app_pricing (
  application_id,
  name,
  description,
  monthly_price,
  discount_percent,
  active,
  is_bundle,
  included_application_ids,
  sort_order
)
values
  ('gestao-contabil', 'Sistema Gestao Contabil', 'Painel financeiro e acompanhamento de indicadores.', 99.90, 0, true, false, '{}', 1),
  ('mini-crm', 'Mini CRM', 'Pipeline simples de leads, oportunidades e clientes.', 49.90, 0, true, false, '{}', 2),
  ('omnichannel', 'Apps de Chats', 'Omnichannel para Telegram, WhatsApp, Instagram e Facebook.', 149.90, 0, true, false, '{}', 3),
  ('crie-seu-site', 'Crie seu site', 'Construa a presenca digital do escritorio.', 49.90, 0, true, false, '{}', 4),
  ('cont-hub-completo', 'Pacote CONT HUB completo', 'Todos os apps principais com desconto.', 249.90, 28.57, true, true, array['gestao-contabil', 'mini-crm', 'omnichannel', 'crie-seu-site'], 5)
on conflict (application_id) do update
set name = excluded.name,
    description = excluded.description,
    monthly_price = excluded.monthly_price,
    discount_percent = excluded.discount_percent,
    active = excluded.active,
    is_bundle = excluded.is_bundle,
    included_application_ids = excluded.included_application_ids,
    sort_order = excluded.sort_order,
    updated_at = now();

insert into public.website_templates (name, description, layout_key, sort_order, active)
select 'Contabil moderno', 'Modelo limpo para escritorio contabil com foco em autoridade e atendimento.', 'modern-accounting', 1, true
where not exists (select 1 from public.website_templates where layout_key = 'modern-accounting');

insert into public.website_templates (name, description, layout_key, sort_order, active)
select 'Consultivo premium', 'Modelo com visual mais institucional para consultoria e BPO financeiro.', 'premium-consulting', 2, true
where not exists (select 1 from public.website_templates where layout_key = 'premium-consulting');

notify pgrst, 'reload schema';
