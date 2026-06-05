alter table public.admin_client_profiles
  add column if not exists address_complement text not null default '';

alter table public.company_settings
  add column if not exists logo_data text,
  add column if not exists address_complement text not null default '',
  add column if not exists cnpj_document_data text,
  add column if not exists cnpj_document_name text not null default '',
  add column if not exists cnpj_document_text text not null default '';

comment on column public.company_settings.logo_data is
  'Logo em data URL. Para arquivos maiores, migrar para Supabase Storage.';

comment on column public.company_settings.cnpj_document_data is
  'Documento CNPJ em data URL. Para arquivos maiores, migrar para Supabase Storage.';

create table if not exists public.company_partners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null default '',
  rg text not null default '',
  cnh text not null default '',
  cpf text not null default '',
  residence_proof_data text,
  residence_proof_name text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_partners enable row level security;

drop policy if exists "Organization access company partners" on public.company_partners;
create policy "Organization access company partners"
on public.company_partners
for all
using (public.is_admin() or public.is_org_member(organization_id))
with check (public.is_admin() or public.is_org_member(organization_id));

notify pgrst, 'reload schema';
