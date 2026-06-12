-- CONT HUB - complemento incremental do fluxo real de emissao NF-e modelo 55.
-- Script nao destrutivo. Rode somente no SQL Editor do Supabase quando for habilitar o novo fluxo.

alter table public.nfe_documents
  add column if not exists emission_payload jsonb not null default '{}'::jsonb,
  add column if not exists validation_errors jsonb not null default '[]'::jsonb,
  add column if not exists xsd_errors jsonb not null default '[]'::jsonb,
  add column if not exists environment text not null default 'homologacao',
  add column if not exists state_uf text not null default '',
  add column if not exists issued_at timestamptz,
  add column if not exists authorized_at timestamptz,
  add column if not exists cancelled_at timestamptz;

alter table public.nfe_sefaz_logs
  add column if not exists request_kind text not null default '',
  add column if not exists request_digest text not null default '',
  add column if not exists response_digest text not null default '';

create index if not exists nfe_documents_emission_status_idx
  on public.nfe_documents (organization_id, client_id, status, updated_at desc);

create index if not exists nfe_documents_authorized_idx
  on public.nfe_documents (organization_id, authorized_at desc)
  where status = 'Autorizada';

notify pgrst, 'reload schema';
