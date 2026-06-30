-- CONT HUB - experiencia guiada de planos Receita Federal / SERPRO.
-- Incremental, idempotente e nao destrutiva.
-- Nao armazena Consumer Secret, certificado, senha ou chave de pareamento em texto puro.

create extension if not exists pgcrypto;

create table if not exists public.serpro_contract_plans (
  code text primary key,
  commercial_name text not null,
  monthly_price numeric(14,2) not null default 0 check (monthly_price >= 0),
  description text not null default '',
  active boolean not null default true,
  allowed_service_ids text[] not null default '{}'::text[],
  default_daily_limit integer not null default 0 check (default_daily_limit >= 0),
  allows_fallback boolean not null default false,
  allows_homologation boolean not null default true,
  allows_production boolean not null default false,
  display_order integer not null default 0,
  installer_url text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.serpro_organization_settings
  add column if not exists plan_code text references public.serpro_contract_plans (code) on delete restrict;

alter table public.serpro_service_catalog
  add column if not exists supports_local_agent boolean not null default false,
  add column if not exists supports_manual_import boolean not null default true,
  add column if not exists consumes_credit boolean not null default true;

alter table public.serpro_client_authorizations
  add column if not exists certificate_id uuid references public.digital_certificates (id) on delete set null,
  add column if not exists last_validated_at timestamptz,
  add column if not exists pending_reason text not null default '';

create table if not exists public.serpro_local_agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  status text not null default 'disconnected'
    check (status in ('disconnected', 'pairing_pending', 'connected', 'outdated', 'blocked')),
  pairing_key_hash text not null default '',
  pairing_key_prefix text not null default '',
  pairing_key_created_at timestamptz,
  pairing_key_expires_at timestamptz,
  installed_version text not null default '',
  last_seen_at timestamptz,
  last_sync_at timestamptz,
  last_error text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists serpro_contract_plans_touch_updated_at on public.serpro_contract_plans;
create trigger serpro_contract_plans_touch_updated_at
before update on public.serpro_contract_plans
for each row execute function public.serpro_touch_updated_at();

drop trigger if exists serpro_local_agents_touch_updated_at on public.serpro_local_agents;
create trigger serpro_local_agents_touch_updated_at
before update on public.serpro_local_agents
for each row execute function public.serpro_touch_updated_at();

insert into public.serpro_service_catalog
  (id, name, category, description, official_product, requires_certificate, requires_authorization,
   supports_managed_mode, supports_direct_mode, supports_local_agent, supports_manual_import,
   consumes_credit, status, metadata)
values
  ('receita-ecac', 'e-CAC', 'receita_federal', 'Acesso assistido aos servicos do e-CAC conforme autorizacao e canal disponivel.', 'ecac', true, true, false, false, true, true, false, 'draft', '{"document_type":"portal"}'),
  ('receita-darf', 'DARF', 'receita_federal', 'Consulta e organizacao de DARFs obtidos por canal oficial ou importacao manual.', 'receita_federal', true, true, false, false, true, true, false, 'draft', '{"document_type":"guia"}'),
  ('receita-das', 'DAS', 'receita_federal', 'Consulta e organizacao de DAS obtidos por canal oficial ou importacao manual.', 'receita_federal', true, true, false, false, true, true, false, 'draft', '{"document_type":"guia"}'),
  ('receita-documentos-fiscais', 'Documentos fiscais', 'receita_federal', 'Centralizacao de documentos fiscais recebidos por integracao ou importacao segura.', 'receita_federal', true, true, true, true, true, true, true, 'active', '{"document_type":"documento"}'),
  ('receita-parcelamentos', 'Parcelamentos', 'receita_federal', 'Acompanhamento de parcelamentos quando suportado pelo canal contratado.', 'receita_federal', true, true, false, false, true, true, false, 'draft', '{"document_type":"parcelamento"}'),
  ('receita-pendencias', 'Pendencias', 'receita_federal', 'Organizacao de pendencias fiscais retornadas por canal oficial ou importacao.', 'receita_federal', true, true, true, true, true, true, true, 'active', '{"document_type":"pendencia"}')
on conflict (id) do nothing;

update public.serpro_service_catalog
set supports_local_agent = true,
    supports_manual_import = true
where id in (
  'integra-contador-cnd-cpend',
  'integra-contador-situacao-fiscal',
  'integra-contador-caixa-postal',
  'integra-contador-procuracoes',
  'integra-contador-dctfweb',
  'integra-contador-perdcomp'
);

insert into public.serpro_contract_plans
  (code, commercial_name, monthly_price, description, active, allowed_service_ids,
   default_daily_limit, allows_fallback, allows_homologation, allows_production, display_order)
values
  (
    'cont_hub_full',
    'Contrato CONT HUB - Completo',
    500,
    'A CONT HUB gerencia integracao, consumo, configuracoes e manutencao para o escritorio.',
    true,
    array(select id from public.serpro_service_catalog),
    1000,
    false,
    true,
    true,
    10
  ),
  (
    'cont_hub_local_agent',
    'Robo CONT HUB no servidor do contador',
    350,
    'Aplicacao local pareada ao escritorio para operacoes assistidas no ambiente do contador.',
    true,
    array(select id from public.serpro_service_catalog where supports_local_agent),
    500,
    false,
    true,
    true,
    20
  ),
  (
    'serpro_direct',
    'Meu contrato direto SERPRO',
    250,
    'O escritorio usa o proprio contrato SERPRO e cadastra suas credenciais na plataforma.',
    true,
    array(select id from public.serpro_service_catalog where supports_direct_mode),
    1000,
    true,
    true,
    true,
    30
  )
on conflict (code) do nothing;

update public.serpro_organization_settings
set plan_code = case
  when access_mode = 'direct_serpro' then 'serpro_direct'
  else 'cont_hub_full'
end
where plan_code is null;

alter table public.serpro_organization_settings
  alter column plan_code set default 'cont_hub_full';

alter table public.serpro_organization_settings
  alter column plan_code set not null;

alter table public.serpro_organization_settings
  drop constraint if exists serpro_organization_settings_access_mode_check;

alter table public.serpro_organization_settings
  add constraint serpro_organization_settings_access_mode_check
  check (access_mode in ('cont_hub_managed', 'direct_serpro', 'manual_free', 'local_agent'));

alter table public.serpro_documents
  drop constraint if exists serpro_documents_access_mode_check;

alter table public.serpro_documents
  add constraint serpro_documents_access_mode_check
  check (access_mode in ('cont_hub_managed', 'direct_serpro', 'manual_free', 'local_agent'));

alter table public.serpro_contract_plans enable row level security;
alter table public.serpro_local_agents enable row level security;

drop policy if exists serpro_contract_plans_authenticated_read on public.serpro_contract_plans;
create policy serpro_contract_plans_authenticated_read on public.serpro_contract_plans
  for select to authenticated using (active or public.serpro_is_admin());

drop policy if exists serpro_contract_plans_admin_all on public.serpro_contract_plans;
create policy serpro_contract_plans_admin_all on public.serpro_contract_plans
  for all to authenticated using (public.serpro_is_admin()) with check (public.serpro_is_admin());

drop policy if exists serpro_local_agents_org_read on public.serpro_local_agents;
create policy serpro_local_agents_org_read on public.serpro_local_agents
  for select to authenticated using (public.serpro_can_access_org(organization_id));

drop policy if exists serpro_local_agents_admin_all on public.serpro_local_agents;
create policy serpro_local_agents_admin_all on public.serpro_local_agents
  for all to authenticated using (public.serpro_is_admin()) with check (public.serpro_is_admin());

revoke all privileges on table public.serpro_contract_plans from anon;
revoke all privileges on table public.serpro_local_agents from anon;
revoke all privileges on table public.serpro_contract_plans from authenticated;
revoke all privileges on table public.serpro_local_agents from authenticated;
grant select on table public.serpro_contract_plans to authenticated;
grant select on table public.serpro_local_agents to authenticated;
grant all privileges on table public.serpro_contract_plans to service_role, postgres;
grant all privileges on table public.serpro_local_agents to service_role, postgres;

create index if not exists serpro_contract_plans_active_order_idx
  on public.serpro_contract_plans (active, display_order, commercial_name);

create index if not exists serpro_local_agents_status_idx
  on public.serpro_local_agents (organization_id, status, last_seen_at desc);

notify pgrst, 'reload schema';
