-- CONT HUB - Duplicate prevention for Receita Federal / Serpro / manual import.
-- Idempotent, non-destructive. Run after 20260616_serpro_dual_contract_mode.sql
-- and 20260616_manual_revenue_import.sql.

create extension if not exists pgcrypto;

alter table public.serpro_requests
  add column if not exists idempotency_key text not null default '',
  add column if not exists request_payload_hash text not null default '',
  add column if not exists locked_until timestamptz,
  add column if not exists retry_of_request_id uuid references public.serpro_requests (id) on delete set null,
  add column if not exists result_valid_until timestamptz;

create unique index if not exists serpro_requests_idempotency_unique_idx
  on public.serpro_requests (organization_id, idempotency_key)
  where idempotency_key <> '';

create unique index if not exists serpro_requests_active_payload_unique_idx
  on public.serpro_requests (
    organization_id,
    coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid),
    service_id,
    environment,
    request_payload_hash
  )
  where request_payload_hash <> ''
    and status in ('created', 'reserved', 'sent', 'completed');

create unique index if not exists serpro_requests_correlation_unique_idx
  on public.serpro_requests (organization_id, correlation_id)
  where correlation_id <> '';

create index if not exists serpro_requests_lookup_idx
  on public.serpro_requests (organization_id, client_id, service_id, environment, created_at desc);

create table if not exists public.serpro_operation_locks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  service_id text not null references public.serpro_service_catalog (id) on delete restrict,
  competence text not null default '',
  environment public.serpro_environment not null default 'homologacao',
  request_payload_hash text not null default '',
  lock_key text not null,
  request_id uuid references public.serpro_requests (id) on delete set null,
  status text not null default 'active',
  locked_until timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists serpro_operation_locks_active_key_unique_idx
  on public.serpro_operation_locks (lock_key)
  where status = 'active';

create index if not exists serpro_operation_locks_scope_idx
  on public.serpro_operation_locks (organization_id, client_id, service_id, environment, competence);

alter table public.serpro_wallet_transactions
  add column if not exists idempotency_key text not null default '',
  add column if not exists captured_from_transaction_id uuid references public.serpro_wallet_transactions (id) on delete set null;

create unique index if not exists serpro_wallet_transactions_idempotency_unique_idx
  on public.serpro_wallet_transactions (organization_id, idempotency_key)
  where idempotency_key <> '';

create unique index if not exists serpro_wallet_transactions_once_per_request_type_idx
  on public.serpro_wallet_transactions (request_id, transaction_type)
  where request_id is not null
    and transaction_type in ('reserve', 'capture', 'release', 'refund');

alter table public.serpro_documents
  add column if not exists external_id text not null default '',
  add column if not exists document_hash text not null default '',
  add column if not exists logical_key text not null default '',
  add column if not exists external_updated_at timestamptz;

update public.serpro_documents
set document_hash = file_hash
where coalesce(document_hash, '') = ''
  and coalesce(file_hash, '') <> '';

create unique index if not exists serpro_documents_external_id_unique_idx
  on public.serpro_documents (organization_id, provider, external_id)
  where provider <> ''
    and external_id <> '';

create unique index if not exists serpro_documents_document_hash_unique_idx
  on public.serpro_documents (organization_id, document_hash)
  where document_hash <> '';

create unique index if not exists serpro_documents_protocol_unique_idx
  on public.serpro_documents (organization_id, provider, protocol_number)
  where provider <> ''
    and protocol_number <> '';

create unique index if not exists serpro_documents_logical_key_unique_idx
  on public.serpro_documents (organization_id, logical_key)
  where logical_key <> '';

create index if not exists serpro_documents_competency_idx
  on public.serpro_documents (organization_id, client_id, provider, document_type, competency);

create index if not exists serpro_documents_hash_lookup_idx
  on public.serpro_documents (organization_id, file_hash, document_hash);

alter table public.serpro_operation_locks enable row level security;

drop policy if exists serpro_operation_locks_access on public.serpro_operation_locks;
create policy serpro_operation_locks_access on public.serpro_operation_locks
  for all using (public.serpro_can_access_org(organization_id))
  with check (public.serpro_can_access_org(organization_id));

notify pgrst, 'reload schema';
