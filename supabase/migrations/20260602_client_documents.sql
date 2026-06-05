create table if not exists public.client_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  document_type text not null default 'Documento',
  extracted_cnpj text not null default '',
  file_name text not null,
  mime_type text not null,
  file_size integer not null default 0,
  file_data text not null,
  created_at timestamptz not null default now()
);

create index if not exists client_documents_organization_id_idx
  on public.client_documents (organization_id);

create index if not exists client_documents_client_id_idx
  on public.client_documents (client_id);

alter table public.client_documents enable row level security;

drop policy if exists "Organization access client documents" on public.client_documents;
create policy "Organization access client documents"
on public.client_documents
for all
using (public.is_admin() or public.is_org_member(organization_id))
with check (public.is_admin() or public.is_org_member(organization_id));

notify pgrst, 'reload schema';
