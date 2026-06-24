-- CONT HUB - fiscal readiness, NCM search hardening and data provenance.
-- Incremental and idempotent. Does not remove existing data.

create extension if not exists unaccent with schema extensions;

create or replace function public.cont_hub_digits(input_value text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(input_value, ''), '\D', '', 'g');
$$;

create or replace function public.cont_hub_format_ncm(input_value text)
returns text
language sql
immutable
as $$
  select case
    when length(public.cont_hub_digits(input_value)) = 8 then
      substring(public.cont_hub_digits(input_value) from 1 for 4)
      || '.' ||
      substring(public.cont_hub_digits(input_value) from 5 for 2)
      || '.' ||
      substring(public.cont_hub_digits(input_value) from 7 for 2)
    else coalesce(input_value, '')
  end;
$$;

create or replace function public.cont_hub_search_text(input_value text)
returns text
language sql
stable
as $$
  select trim(regexp_replace(lower(extensions.unaccent(coalesce(input_value, ''))), '\s+', ' ', 'g'));
$$;

alter table public.ncm_catalog
  add column if not exists normalized_code text,
  add column if not exists description_search text not null default '',
  add column if not exists legal_act text not null default '',
  add column if not exists legal_act_number text not null default '',
  add column if not exists legal_act_year text not null default '',
  add column if not exists hierarchy_level integer not null default 0,
  add column if not exists source_version text not null default '',
  add column if not exists imported_at timestamptz;

update public.ncm_catalog
set
  normalized_code = nullif(public.cont_hub_digits(coalesce(normalized_code, code, formatted_code)), ''),
  formatted_code = case
    when formatted_code = '' and length(public.cont_hub_digits(code)) = 8 then public.cont_hub_format_ncm(code)
    else formatted_code
  end,
  description_search = public.cont_hub_search_text(description),
  imported_at = coalesce(imported_at, source_updated_at, updated_at, now())
where
  normalized_code is null
  or normalized_code = ''
  or formatted_code = ''
  or description_search = ''
  or imported_at is null;

create unique index if not exists ncm_catalog_normalized_code_uidx
  on public.ncm_catalog (normalized_code);

create index if not exists ncm_catalog_description_search_idx
  on public.ncm_catalog (description_search);

create index if not exists ncm_catalog_active_normalized_idx
  on public.ncm_catalog (is_active, normalized_code);

create or replace function public.normalize_ncm_catalog_fields()
returns trigger
language plpgsql
as $$
begin
  new.normalized_code := nullif(public.cont_hub_digits(coalesce(new.normalized_code, new.code, new.formatted_code)), '');
  new.formatted_code := case
    when coalesce(new.formatted_code, '') = '' and new.normalized_code is not null then public.cont_hub_format_ncm(new.normalized_code)
    else coalesce(new.formatted_code, '')
  end;
  new.description_search := public.cont_hub_search_text(new.description);
  new.imported_at := coalesce(new.imported_at, now());
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists normalize_ncm_catalog_fields_trigger on public.ncm_catalog;
create trigger normalize_ncm_catalog_fields_trigger
before insert or update on public.ncm_catalog
for each row execute function public.normalize_ncm_catalog_fields();

alter table public.ncm_sync_jobs
  add column if not exists rejected_codes integer not null default 0,
  add column if not exists source text not null default 'Siscomex',
  add column if not exists source_version text not null default '',
  add column if not exists duration_ms integer not null default 0;

do $$
begin
  if (
    select count(*)
    from public.ncm_sync_jobs
    where status = 'Executando'
  ) <= 1
  and not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'ncm_sync_jobs_single_running_idx'
  ) then
    execute 'create unique index ncm_sync_jobs_single_running_idx on public.ncm_sync_jobs ((status)) where status = ''Executando''';
  end if;
end $$;

insert into public.ncm_catalog (
  code,
  normalized_code,
  formatted_code,
  description,
  description_search,
  is_active,
  hierarchy_level,
  source,
  source_version,
  imported_at,
  source_updated_at,
  updated_at
)
values (
  '0102.39.11',
  '01023911',
  '0102.39.11',
  'Prenhes ou com cria ao pe',
  public.cont_hub_search_text('Prenhes ou com cria ao pe'),
  true,
  4,
  'Tabela_NCM_Vigente_20260622.xlsx',
  '20260622',
  now(),
  now(),
  now()
)
on conflict (normalized_code) do update
set
  code = excluded.code,
  formatted_code = excluded.formatted_code,
  description = excluded.description,
  description_search = excluded.description_search,
  is_active = excluded.is_active,
  hierarchy_level = excluded.hierarchy_level,
  source = excluded.source,
  source_version = excluded.source_version,
  imported_at = coalesce(public.ncm_catalog.imported_at, excluded.imported_at),
  source_updated_at = excluded.source_updated_at,
  updated_at = now();

alter table public.fiscal_company_profiles
  add column if not exists last_verified_at timestamptz,
  add column if not exists data_origin text not null default 'client_registration',
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid references auth.users (id),
  add column if not exists ibge_resolved_at timestamptz,
  add column if not exists ibge_source text not null default '';

create table if not exists public.fiscal_field_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  profile_id uuid references public.fiscal_company_profiles (id) on delete cascade,
  field_name text not null,
  value text not null default '',
  previous_value text not null default '',
  source text not null default 'manual'
    check (source in (
      'client_registration',
      'cnpj_provider',
      'ibge',
      'sefaz',
      'accounting_import',
      'manual',
      'fiscal_rule',
      'system_default'
    )),
  status text not null default 'suggested'
    check (status in ('suggested', 'confirmed', 'rejected', 'superseded')),
  obtained_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users (id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, client_id, field_name, source)
);

create index if not exists fiscal_field_sources_org_client_idx
  on public.fiscal_field_sources (organization_id, client_id, field_name);

create index if not exists fiscal_field_sources_profile_idx
  on public.fiscal_field_sources (profile_id);

alter table public.fiscal_field_sources enable row level security;

drop policy if exists "Organization read fiscal field sources" on public.fiscal_field_sources;
create policy "Organization read fiscal field sources"
  on public.fiscal_field_sources
  for select
  using (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization write fiscal field sources" on public.fiscal_field_sources;
create policy "Organization write fiscal field sources"
  on public.fiscal_field_sources
  for all
  using (public.is_platform_admin() or public.is_org_member(organization_id))
  with check (public.is_platform_admin() or public.is_org_member(organization_id));

grant select on public.ncm_catalog to authenticated;
grant select on public.ncm_sync_jobs to authenticated;
grant select, insert, update on public.fiscal_field_sources to authenticated;
grant all privileges on public.ncm_catalog to service_role, postgres;
grant all privileges on public.ncm_sync_jobs to service_role, postgres;
grant all privileges on public.fiscal_field_sources to service_role, postgres;

notify pgrst, 'reload schema';
