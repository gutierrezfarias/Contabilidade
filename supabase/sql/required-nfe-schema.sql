-- CONT HUB - schema incremental NF-e / SEFAZ.
-- Rode no SQL Editor do Supabase quando a tela avisar que faltam tabelas/campos.
-- Script nao destrutivo: usa create table if not exists e add column if not exists.

create extension if not exists pgcrypto;

alter table public.clients
  add column if not exists state_registration text not null default '',
  add column if not exists municipal_registration text not null default '',
  add column if not exists city_ibge_code text not null default '';

comment on column public.clients.state_registration is
  'Inscricao Estadual do cliente/empresa para integracoes fiscais.';
comment on column public.clients.municipal_registration is
  'Inscricao Municipal do cliente/empresa para NFS-e e dados cadastrais.';
comment on column public.clients.city_ibge_code is
  'Codigo IBGE do municipio usado em emissao fiscal.';

alter table public.digital_certificates
  add column if not exists certificate_password text not null default '',
  add column if not exists certificate_file_name text not null default '',
  add column if not exists certificate_file_size integer not null default 0,
  add column if not exists certificate_file_data text,
  add column if not exists last_validation_at timestamptz,
  add column if not exists last_validation_error text not null default '';

comment on column public.digital_certificates.certificate_password is
  'MVP: senha informada pelo contador na tela. Futuro recomendado: cofre/criptografia server-side.';
comment on column public.digital_certificates.certificate_file_data is
  'MVP: arquivo PFX/P12 em data URL. Futuro recomendado: Supabase Storage privado/cofre.';

alter table public.nfe_documents
  add column if not exists document_model text not null default 'NFe',
  add column if not exists document_direction text not null default 'recebida',
  add column if not exists nsu text not null default '',
  add column if not exists emitter_name text not null default '',
  add column if not exists emitter_document text not null default '',
  add column if not exists destination_name text not null default '',
  add column if not exists destination_document text not null default '',
  add column if not exists protocol_number text not null default '',
  add column if not exists manifestation_status text not null default 'Pendente',
  add column if not exists manifestation_deadline date,
  add column if not exists raw_xml text,
  add column if not exists raw_summary jsonb not null default '{}'::jsonb,
  add column if not exists sefaz_status_code text not null default '',
  add column if not exists last_consulted_at timestamptz,
  add column if not exists xml_url text,
  add column if not exists danfe_url text,
  add column if not exists webservice text not null default '',
  add column if not exists last_xmotivo text not null default '',
  add column if not exists request_xml_path text,
  add column if not exists response_xml_path text,
  add column if not exists origem_consulta text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'nfe_documents_document_direction_check'
      and conrelid = 'public.nfe_documents'::regclass
  ) then
    alter table public.nfe_documents
      add constraint nfe_documents_document_direction_check
      check (document_direction in ('recebida', 'emitida', 'transporte', 'citada'));
  end if;
end $$;

create table if not exists public.nfe_nsu_control (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  company_id uuid not null,
  certificate_id uuid references public.digital_certificates (id) on delete set null,
  ambiente text default 'homologacao',
  uf text,
  ultimo_nsu text default '000000000000000',
  max_nsu text,
  last_query_at timestamptz,
  last_cstat text,
  last_xmotivo text,
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.nfe_dfe_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  company_id uuid not null,
  certificate_id uuid references public.digital_certificates (id) on delete set null,
  chave_acesso text,
  nsu text,
  schema text,
  tipo_documento text,
  tipo_nota text,
  cnpj_emitente text,
  nome_emitente text,
  cnpj_destinatario text,
  nome_destinatario text,
  data_emissao timestamptz,
  valor_total numeric(15,2),
  situacao text,
  manifestacao_status text,
  xml_path text,
  resumo_json jsonb,
  documento_json jsonb,
  origem_consulta text,
  ambiente text default 'homologacao',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.nfe_sefaz_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  company_id uuid,
  nota_id uuid,
  chave_acesso text,
  tipo_evento text not null,
  ambiente text,
  uf text,
  endpoint text,
  request_xml_path text,
  response_xml_path text,
  cstat text,
  xmotivo text,
  sucesso boolean default false,
  erro_tecnico text,
  created_at timestamptz default now()
);

create unique index if not exists idx_nfe_dfe_documents_company_chave
  on public.nfe_dfe_documents(company_id, chave_acesso)
  where chave_acesso is not null;

create unique index if not exists idx_nfe_dfe_documents_company_nsu
  on public.nfe_dfe_documents(company_id, nsu)
  where nsu is not null;

create index if not exists idx_nfe_nsu_control_company
  on public.nfe_nsu_control(company_id, certificate_id, ambiente, uf);

create index if not exists idx_nfe_sefaz_logs_company
  on public.nfe_sefaz_logs(company_id, created_at desc);

create index if not exists idx_nfe_documents_org_client_direction
  on public.nfe_documents(organization_id, client_id, document_direction, issue_date desc);

create index if not exists idx_nfe_documents_org_access_key
  on public.nfe_documents(organization_id, access_key);

alter table public.nfe_nsu_control enable row level security;
alter table public.nfe_dfe_documents enable row level security;
alter table public.nfe_sefaz_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'nfe_nsu_control'
      and policyname = 'nfe_nsu_control org members'
  ) then
    create policy "nfe_nsu_control org members"
      on public.nfe_nsu_control
      for all
      using (public.is_platform_admin() or public.is_org_member(organization_id))
      with check (public.is_platform_admin() or public.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'nfe_dfe_documents'
      and policyname = 'nfe_dfe_documents org members'
  ) then
    create policy "nfe_dfe_documents org members"
      on public.nfe_dfe_documents
      for all
      using (public.is_platform_admin() or public.is_org_member(organization_id))
      with check (public.is_platform_admin() or public.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'nfe_sefaz_logs'
      and policyname = 'nfe_sefaz_logs org members'
  ) then
    create policy "nfe_sefaz_logs org members"
      on public.nfe_sefaz_logs
      for all
      using (public.is_platform_admin() or public.is_org_member(organization_id))
      with check (public.is_platform_admin() or public.is_org_member(organization_id));
  end if;
end $$;

notify pgrst, 'reload schema';

